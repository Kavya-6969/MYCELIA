// node test/writer.test.js : the Writer agent turns a general goal into a canvas note via an injected model
const assert = require('assert'); const A = require('../src/agent-core.js');
const fast = { stepMs: 0, settleMs: 10, flaky: 0 };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function run(opts, goal, { approve = true } = {}) {
  const eng = A.createEngine(Object.assign({}, fast, opts)), evs = [];
  eng.on(e => { evs.push(e); if (e.type === 'proposal' && e.event === 'created' && approve) setTimeout(() => eng.decide(e.proposal.id, true), 5); });
  const r = eng.submitGoal({ goal, wsId: 'w', graph: [{ id: 'n1', type: 'paper', title: 'Attention Is All You Need', tags: [] }] });
  assert.ok(r.ok, 'goal accepted');
  for (let i = 0; i < 200 && !evs.some(e => e.type === 'goal' && e.state === 'done'); i++) await wait(10);
  return { evs, eng };
}
(async () => {
  // routing
  assert.deepStrictEqual(A.route('give me a list of 10 anime', true).map(p => p.agent), ['writer']);
  assert.deepStrictEqual(A.route('give me a list of 10 anime', false).map(p => p.agent), ['literature'], 'no model: old fallback');
  assert.deepStrictEqual(A.route('recommend 5 books about space', true).map(p => p.agent), ['writer'], 'recommend is a writing request');
assert.deepStrictEqual(A.route('summarize this workspace', true).map(p => p.agent), ['writer']);
assert.deepStrictEqual(A.route('list 10 papers on retrieval', true).map(p => p.agent), ['literature'], 'names specialist work');
assert.deepStrictEqual(A.route('recommend 5 books about space', false).map(p => p.agent), ['literature'], 'no model: old behaviour');
assert.deepStrictEqual(A.route('review papers on retrieval', true).map(p => p.agent), ['literature'], 'specialists still win');
  // prompt + parser
  assert.ok(A.writerPrompt('10 anime', [{ title: 'X' }]).includes('"10 anime"'));
  const p = A.parseWriter('```json\n{"title":"Top 3 **anime**","body":"1. Naruto\\n2. Bleach","tags":["Anime!","list"]}\n```');
  assert.deepStrictEqual([p.title, p.body, p.tags.join()], ['Top 3 anime', '1. Naruto\n2. Bleach', 'anime,list']);
  assert.strictEqual(A.parseWriter('{"title":"t","body":""}'), null); assert.strictEqual(A.parseWriter(null), null);
  assert.strictEqual(A.parseWriter('just plain text').body, 'just plain text');
  console.log('ok routing + parsing');

  // happy path: a note node with the written body
  let got = null;
  const { evs, eng } = await run({ writer: async a => { got = a; return JSON.stringify({ title: 'Ten anime to watch', body: Array.from({ length: 10 }, (_, i) => (i + 1) + '. Show ' + (i + 1)).join('\n'), tags: ['anime'] }); }, canWrite: () => true }, 'a list of 10 anime');
  const prop = evs.find(e => e.type === 'proposal' && e.event === 'created').proposal;
  assert.strictEqual(prop.agentId, 'writer'); assert.strictEqual(prop.kind, 'spawn_node');
  assert.strictEqual(prop.payload.node.type, 'note'); assert.strictEqual(prop.payload.node.title, 'Ten anime to watch');
  assert.ok(prop.payload.node.summary.split('\n').length === 10 && /Show 10/.test(prop.payload.node.summary));
  assert.ok(prop.payload.node.tags.includes('ai-note') && prop.payload.node.tags.includes('anime'));
  assert.ok(/AI-generated/.test(prop.payload.node.meta), 'honest label');
  assert.ok(got.prompt.includes('a list of 10 anime') && got.prompt.includes('Attention Is All You Need'), 'model got goal + canvas context');
  assert.ok(evs.some(e => e.type === 'proposal' && e.event === 'approved'));
  assert.ok(eng.snapshot().agents.find(a => a.id === 'writer').score > 50, 'writer rewarded on approval');
  console.log('ok writer makes a note');

  // model failure -> task failed, goal not ok
  const f = await run({ writer: async () => { throw new Error('boom'); }, canWrite: () => true }, 'a list of 10 anime');
  assert.ok(f.evs.some(e => e.type === 'log' && e.kind === 'failed' && /boom/.test(e.text)), 'failure explained');
  // user declines the model -> skipped, no penalty
  const d = await run({ writer: async () => { const e = new Error('no'); e.code = 'not_granted'; throw e; }, canWrite: () => true }, 'a list of 10 anime');
  assert.ok(d.evs.some(e => e.type === 'log' && e.kind === 'info' && /did not allow the AI model/.test(e.text)));
  assert.strictEqual(d.eng.snapshot().agents.find(a => a.id === 'writer').score, 50, 'no penalty when the viewer declines');
  // no model at all -> starter-paper fallback with an explanation
  const n = await run({}, 'a list of 10 anime');
  assert.ok(n.evs.some(e => e.type === 'log' && /no AI model is connected/.test(e.text)), 'explains why');
  assert.ok(!n.evs.some(e => e.type === 'proposal' && e.proposal && e.proposal.agentId === 'writer'));
  // tolerant parsing: raw line breaks inside the JSON string, or prose around it
  const raw = A.parseWriter('Sure! Here it is:\n{"title": "Top anime", "body": "1. Naruto\n2. Bleach", "tags": ["x"]}');
  assert.deepStrictEqual([raw.title, raw.body], ['Top anime', '1. Naruto\n2. Bleach'], 'raw newline in a JSON string still parses');
  // error codes: busy / unavailable are skipped with a clear message, other codes fail with the code shown
  const mk = code => run({ writer: async () => { const e = new Error('msg-' + code); e.code = code; throw e; }, canWrite: () => true }, 'a list of 10 anime');
  const busy = await mk('rate_limited'); assert.ok(busy.evs.some(e => e.type === 'log' && e.kind === 'info' && /busy/.test(e.text)));
  const gone = await mk('unavailable'); assert.ok(gone.evs.some(e => e.type === 'log' && e.kind === 'info' && /not available/.test(e.text) && /msg-unavailable/.test(e.text)));
  const tmo = await mk('timeout'); assert.ok(tmo.evs.some(e => e.type === 'log' && e.kind === 'failed' && /\(timeout\)/.test(e.text) && /msg-timeout/.test(e.text)), 'other codes fail visibly with the code');
  // several notes
  assert.strictEqual(A.noteCount('create 5 notes of fastest train in india'), 5); assert.strictEqual(A.noteCount('a list of 10 anime'), 1); assert.strictEqual(A.noteCount('make three short notes on trains'), 3);
  assert.strictEqual(A.noteTopic('create 5 notes of fastest train in india'), 'fastest train in india');
  assert.deepStrictEqual(A.route('create 5 notes of fastest train in india', true).map(p => p.agent), ['writer']);
  assert.deepStrictEqual(A.route('create 5 notes of fastest train in india', false).map(p => p.agent), ['writer'], 'no model still writes placeholders');
  assert.ok(/exactly 5 separate notes/.test(A.writerPrompt('x', [], 5)));
  const multi = A.parseWriterMulti('{"notes":[{"title":"Vande Bharat","body":"160 km/h"},{"title":"Gatimaan","body":"160 km/h"}]}', 5); assert.strictEqual(multi.length, 2);
  const m5 = await run({ writer: async a => JSON.stringify({ notes: [1, 2, 3, 4, 5].map(i => ({ title: 'Train ' + i, body: 'Fact ' + i, tags: ['train'] })) }), canWrite: () => true }, 'create 5 notes of fastest train in india');
  assert.strictEqual(m5.evs.filter(e => e.type === 'proposal' && e.event === 'created').length, 5, 'five proposals, one per note');
  const ph = await run({ writer: async () => { throw new Error('should not be called'); }, canWrite: () => false }, 'create 5 notes of fastest train in india');
  const phs = ph.evs.filter(e => e.type === 'proposal' && e.event === 'created'); assert.strictEqual(phs.length, 5, 'placeholders without a model');
  assert.ok(/placeholder/i.test(phs[0].proposal.payload.node.meta) && /fastest train in india/.test(phs[0].proposal.payload.node.title));
  console.log('writer tests passed');
})().catch(e => { console.error(e); process.exit(1); });
