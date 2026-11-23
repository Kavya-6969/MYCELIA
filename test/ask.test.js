// node test/ask.test.js   (unit tests for src/ask-core.js, plus /api/ask against a stand-in model server)
const assert = require('assert'), http = require('http'), { spawn } = require('child_process'), path = require('path');
const Ask = require('../src/ask-core.js');
const items = [
  { n: 1, id: 'p1', type: 'paper', title: 'Attention Is All You Need', meta: 'Vaswani 2017', summary: 'Introduces the Transformer, a model based only on attention. It trains faster than recurrent models.', findings: ['Reaches 28.4 BLEU on WMT14'], tags: ['transformer', 'nlp'], topic: 'NLP' },
  { n: 2, id: 'p2', type: 'paper', title: 'Dense Passage Retrieval', meta: 'Karpukhin 2020', summary: 'Learns dense embeddings for open-domain question answering retrieval.', findings: [], tags: ['retrieval'], topic: 'Retrieval' },
  { n: 3, id: 'd1', type: 'dataset', title: 'Natural Questions', meta: 'Google', summary: 'Real questions with Wikipedia answers.', findings: [], tags: ['dataset', 'qa'], topic: 'Retrieval' },
  { n: 4, id: 'x1', type: 'experiment', title: 'Baseline run', meta: 'Simulated', summary: 'Baseline on Natural Questions.', findings: [], tags: ['experiment'], topic: 'Retrieval', acc: 71.2, lat: 40.1 },
  { n: 5, id: 'x2', type: 'experiment', title: 'Deeper run', meta: 'Simulated', summary: 'More layers.', findings: [], tags: ['experiment'], topic: 'Retrieval', acc: 74.8, lat: 62.3 }
];
let a = Ask.answer('how many papers are there?', items);
assert.ok(/\*\*2\*\* papers/.test(a.text) && a.cites.join() === '1,2', 'count papers');
a = Ask.answer('Which experiment performs best?', items);
assert.ok(/Deeper run/.test(a.text) && /74\.8/.test(a.text) && /simulated/i.test(a.text), 'best experiment');
a = Ask.answer('which is the fastest run', items);
assert.ok(/Baseline run/.test(a.text), 'fastest');
a = Ask.answer('what does the transformer paper say about attention?', items);
assert.strictEqual(a.intent, 'search'); assert.strictEqual(a.cites[0], 1, 'relevance search ranks the transformer paper first');
a = Ask.answer('what does the transformer paper say?', items); assert.strictEqual(a.intent, 'search'); assert.strictEqual(a.cites[0], 1, 'short topical question is a search, not a list');
a = Ask.answer('what papers are here?', items); assert.strictEqual(a.intent, 'list');
a = Ask.answer('list datasets', items); assert.ok(/Natural Questions/.test(a.text) && a.intent === 'list');
a = Ask.answer('summarize this workspace', items); assert.ok(/5\*\* items/.test(a.text) && a.intent === 'summary');
a = Ask.answer('what is missing?', items); assert.ok(/code repo/i.test(a.text) && a.intent === 'gaps');
a = Ask.answer('quantum chromodynamics lattice', items); assert.strictEqual(a.intent, 'none'); assert.deepStrictEqual(a.cites, []);
a = Ask.answer('anything', []); assert.strictEqual(a.intent, 'empty');
const m = Ask.buildMessages('hi', items, [{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }, { role: 'system', text: 'ignored' }]);
assert.strictEqual(m[0].role, 'system'); assert.ok(m[0].content.includes('[4] EXPERIMENT')); assert.strictEqual(m.length, 4, 'system + 2 valid history + question');
console.log('ask core tests passed');

// ---- /api/ask: no key -> local; with a stand-in OpenAI-style server -> model ----
const post = (port, body) => new Promise((res, rej) => { const r = http.request({ port, path: '/api/ask', method: 'POST', headers: { 'content-type': 'application/json' } }, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res(JSON.parse(d))); }); r.on('error', rej); r.end(JSON.stringify(body)); });
const boot = (env, port) => new Promise((res, rej) => { const p = spawn('node', ['--no-warnings', path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, env, { PORT: port, RG_DB_FILE: '/tmp/rg-ask-' + port + '.db' }) }); p.stdout.on('data', d => { if (/ResearchGraph on/.test(d)) res(p); }); p.on('error', rej); setTimeout(() => rej(new Error('server timeout')), 6000); });
(async () => {
  let seen = null;
  const fake = http.createServer((q, r) => { let d = ''; q.on('data', c => d += c); q.on('end', () => { seen = JSON.parse(d); r.setHeader('content-type', 'application/json'); r.end(JSON.stringify({ choices: [{ message: { content: 'The **Deeper run** [5] is best.' } }] })); }); });
  await new Promise(r => fake.listen(3991, r));
  let s = await boot({ OPENAI_API_KEY: '', GROQ_API_KEY: '' }, 3992);
  let j = await post(3992, { question: 'hello', items }); assert.strictEqual(j.ok, false); assert.strictEqual(j.mode, 'local'); s.kill();
  s = await boot({ OPENAI_API_KEY: 'k', OPENAI_BASE_URL: 'http://localhost:3991' }, 3993);
  j = await post(3993, { question: 'best run?', items, history: [{ role: 'user', text: 'x' }] });
  assert.strictEqual(j.ok, true); assert.strictEqual(j.mode, 'model'); assert.ok(/Deeper run/.test(j.text));
  assert.strictEqual(seen.messages[0].role, 'system'); assert.ok(seen.messages[0].content.includes('Natural Questions')); assert.strictEqual(seen.messages.at(-1).content, 'best run?');
  const bad = await post(3993, { question: '', items }); assert.ok(bad.ok === false);
  s.kill(); fake.close(); console.log('ask api tests passed');
})().catch(e => { console.error(e); process.exit(1); });
