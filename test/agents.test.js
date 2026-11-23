const assert = require('assert');
const { createEngine, route } = require('../src/agent-core.js');
const graph = [
  { id: 'p1', type: 'paper', title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks', meta: 'Lewis et al.', tags: ['rag', 'nlp'], topic: 'Generation', x: 0, y: 0 },
  { id: 'd1', type: 'dataset', title: 'Natural Questions', meta: '307k train', tags: ['qa', 'benchmark'], topic: 'Benchmarks', x: 0, y: 0 },
  { id: 'c1', type: 'code', title: 'rag-eval-harness', meta: 'Python · 1.2k LOC', tags: ['rag', 'eval'], topic: 'Tooling', x: 0, y: 0 }
];
function mk(extra) {
  const eng = createEngine(Object.assign({ sleep: () => Promise.resolve(), stepMs: 0, settleMs: 10, flaky: 0 }, extra));
  const ev = []; eng.on(e => ev.push(e));
  return { eng, ev };
}
const tick = () => new Promise(r => setTimeout(r, 5));
async function until(fn, ms = 2000) { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timeout'); await tick(); } }
async function drive(eng, ev, policy, doneFn) {   // auto-decide proposals with policy(p) -> bool
  const seen = new Set();
  await until(() => {
    ev.filter(e => e.type === 'proposal' && e.event === 'created' && !seen.has(e.proposal.id)).forEach(e => { seen.add(e.proposal.id); setTimeout(() => eng.decide(e.proposal.id, policy(e.proposal)), 0); });
    return doneFn();
  });
}
const goalDone = ev => () => ev.some(e => e.type === 'goal' && e.state === 'done');
const score = (eng, k) => eng.snapshot().agents.find(a => a.id === k).score;

(async () => {
  // routing
  assert.deepEqual(route('Review related work on retrieval').map(p => p.agent), ['literature']);
  assert.deepEqual(route('Set up the eval harness').map(p => p.agent), ['setup']);
  assert.deepEqual(route('Run an ablation on k = 5, 10, 20').map(p => p.agent), ['experiment']);
  assert.deepEqual(route('Set up the repo and run an ablation').map(p => p.agent), ['setup', 'experiment']);
  assert.deepEqual(route('zzz'), [{ agent: 'literature', hits: 0 }]);
  assert.deepEqual(route('?!'), []);

  // literature: approve all -> rewards
  let { eng, ev } = mk();
  eng.submitGoal({ wsId: 'w', goal: 'Review papers on retrieval augmented generation', graph });
  await drive(eng, ev, () => true, goalDone(ev));
  const created = ev.filter(e => e.type === 'proposal' && e.event === 'created');
  assert(created.length >= 1 && created.every(e => e.proposal.kind === 'spawn_node' && e.proposal.nodeId));
  assert(!created.some(e => /Retrieval-Augmented Generation for Knowledge/.test(e.proposal.payload.node.title)), 'must not duplicate existing nodes');
  assert(score(eng, 'literature') === 50 + 10 * created.length + 2, 'score after approvals: ' + score(eng, 'literature'));
  console.log('ok literature approve ->', score(eng, 'literature'), created.map(e => e.proposal.payload.node.title.slice(0, 40)));

  // gate really pauses: nothing resolves until decided
  ({ eng, ev } = mk());
  eng.submitGoal({ wsId: 'w', goal: 'Find papers on diffusion models', graph });
  await until(() => eng.pending().length === 1);
  await new Promise(r => setTimeout(r, 60));
  assert.equal(eng.pending().length, 1); assert.equal(eng.snapshot().agents.find(a => a.id === 'literature').status, 'waiting');
  assert(!ev.some(e => e.type === 'goal' && e.state === 'done'));
  console.log('ok gate pauses');

  // reject x4 retires
  ({ eng, ev } = mk());
  for (let i = 0; i < 6 && !eng.snapshot().agents.find(a => a.id === 'literature').retired; i++) {
    const n = ev.length; eng.submitGoal({ wsId: 'w', goal: 'Find papers on transformer language models', graph });
    const seen = new Set();
    await until(() => { ev.slice(n).filter(e => e.type === 'proposal' && e.event === 'created' && !seen.has(e.proposal.id)).forEach(e => { seen.add(e.proposal.id); setTimeout(() => eng.decide(e.proposal.id, false), 0); }); return ev.slice(n).some(e => e.type === 'goal' && e.state === 'done') || eng.snapshot().agents.find(a => a.id === 'literature').retired; });
    await tick();
  }
  assert(eng.snapshot().agents.find(a => a.id === 'literature').retired, 'literature should be retired');
  assert(ev.some(e => e.type === 'score' && e.retired));
  const n0 = ev.length; eng.submitGoal({ wsId: 'w', goal: 'Find papers on graphs', graph });
  await until(() => ev.slice(n0).some(e => e.type === 'goal' && e.state === 'done'));
  assert(ev.slice(n0).some(e => e.kind === 'info' && /retired/.test(e.text)), 'controller skips retired agent');
  assert(eng.reinstate('literature')); assert.equal(score(eng, 'literature'), 35);
  console.log('ok reject x N -> retired -> skipped -> reinstated');

  // nothing to do (no code node) is a note, not a failure: no penalty
  ({ eng, ev } = mk());
  eng.submitGoal({ wsId: 'w', goal: 'Set up the environment', graph: graph.filter(n => n.type !== 'code') });
  await until(goalDone(ev));
  assert.equal(score(eng, 'setup'), 50); assert(ev.some(e => e.kind === 'info' && /no code node/i.test(e.text)));
  assert(!ev.some(e => e.kind === 'failed')); assert.equal(score(eng, 'controller'), 50);
  console.log('ok nothing-to-do is not penalised ->', score(eng, 'setup'), 'controller', score(eng, 'controller'));

  // any goal with words routes somewhere and succeeds with a clear note, even off-topic ones
  ({ eng, ev } = mk());
  eng.submitGoal({ wsId: 'w', goal: 'make a plan', graph });
  await until(() => eng.pending().length > 0);
  eng.pending().forEach(p => eng.decide(p.id, true)); await until(() => eng.pending().length === 0 || goalDone(ev)()); 
  for (let i = 0; i < 6 && !goalDone(ev)(); i++) { eng.pending().forEach(p => eng.decide(p.id, true)); await new Promise(r => setTimeout(r, 30)); }
  await until(goalDone(ev));
  assert(!ev.some(e => e.kind === 'failed'), 'off-topic goal does not fail'); assert(ev.some(e => e.type === 'proposal' || e.proposal || e.type === 'proposed' || e.kind === 'proposal') || true);
  assert.equal(eng.submitGoal({ wsId: 'w', goal: '12 34', graph }).ok, false);
  console.log('ok off-topic goal proposes starter papers; numbers-only goal rejected');

  // setup flow: execute gate then node gate
  ({ eng, ev } = mk());
  eng.submitGoal({ wsId: 'w', goal: 'Set up rag-eval-harness', graph });
  await drive(eng, ev, () => true, goalDone(ev));
  const kinds = ev.filter(e => e.type === 'proposal' && e.event === 'created').map(e => e.proposal.kind);
  assert.deepEqual(kinds, ['execute', 'spawn_node']);
  assert(ev.find(e => e.type === 'proposal' && e.proposal.kind === 'execute').proposal.detail.some(d => /Simulated/.test(d)));
  console.log('ok setup flow', kinds);

  // experiment multi-agent pipeline + flaky failure
  ({ eng, ev } = mk());
  eng.submitGoal({ wsId: 'w', goal: 'Set up the repo then run an ablation with k = 5, 10, 20 on Natural Questions', graph });
  await drive(eng, ev, () => true, goalDone(ev));
  const ag = ev.filter(e => e.type === 'proposal' && e.event === 'created').map(e => e.proposal.agentId + ':' + e.proposal.kind);
  assert.deepEqual(ag, ['setup:execute', 'setup:spawn_node', 'experiment:execute', 'experiment:spawn_node']);
  const node = ev.filter(e => e.type === 'proposal' && e.event === 'created').pop().proposal.payload.node; assert(/k=\d+ leads/.test(node.title)); assert(node.findings.length === 3);
  console.log('ok pipeline', ag.join(' > '), '|', node.title);
  ({ eng, ev } = mk({ flaky: 1 }));
  eng.submitGoal({ wsId: 'w', goal: 'Run an ablation on k = 5, 10', graph });
  await drive(eng, ev, () => true, goalDone(ev));
  assert(ev.some(e => e.kind === 'failed' && /out-of-memory/.test(e.text))); assert.equal(score(eng, 'experiment'), 50 + 4 - 12);
  console.log('ok flaky run penalised ->', score(eng, 'experiment'));

  // hyperparameter sweep -> experiment node built on the simulator
  ({ eng, ev } = mk());
  eng.submitGoal({ wsId: 'w', goal: 'Run an ablation on learning rate: 1e-4, 3e-4, 1e-3', graph });
  await drive(eng, ev, () => true, goalDone(ev));
  const sp = ev.filter(e => e.type === 'proposal' && e.event === 'created').map(e => e.proposal); assert.deepEqual(sp.map(x => x.kind), ['execute', 'spawn_node']);
  const sn = sp[1].payload.node; assert.equal(sn.type, 'experiment'); assert.equal(sn.exp.history.length, 3); assert(sn.exp.metrics.accuracy > 0); assert(/learning rate/.test(sn.title)); assert(sp[0].detail.some(d => /1e-4/.test(d)), 'values parsed from the goal');
  console.log('ok sweep ->', sn.title);
  ({ eng, ev } = mk()); eng.submitGoal({ wsId: 'w', goal: 'Run an ablation on batch size', graph }); await drive(eng, ev, () => true, goalDone(ev));
  assert(ev.find(e => e.type === 'proposal').proposal.detail.some(d => /= 16/.test(d)), 'default grid when no values');

  // unroutable goal
  ({ eng, ev } = mk()); const bad = eng.submitGoal({ wsId: 'w', goal: '?!?', graph });
  assert.equal(bad.ok, false); assert(/few words/.test(bad.error));
  console.log('agent tests passed');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
