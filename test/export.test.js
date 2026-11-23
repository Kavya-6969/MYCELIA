const assert = require('assert');
const { buildExport } = require('../src/export-core.js');
const X = require('../src/experiment-core.js');
const exp = X.makeExp({ model: 'ResNet-50', dataset: 'CIFAR-100', seed: 'cifar', params: { learningRate: 1e-3, layers: 12 } });
exp.history = [{ label: 'Run 1', at: 1, params: exp.params, accuracy: exp.metrics.accuracy, latencyMs: exp.metrics.latencyMs }];
const ws = { id: 'w1', name: 'Retrieval | QA', nodes: [
  { id: 'a', type: 'paper', title: 'Dense Passage Retrieval', meta: 'Karpukhin · 2020', tags: ['retrieval'], topic: 'Retrieval', summary: 'Dual encoders.', findings: ['Beats BM25'], x: 1, y: 2 },
  { id: 'b', type: 'note', title: 'Check "long tail" entities', meta: 'Edited 2h ago', tags: ['todo'], x: 0, y: 0 },
  { id: 'c', type: 'experiment', title: 'LR sweep', meta: 'Simulated', tags: ['experiment'], exp, x: 3, y: 4 },
  { id: 'g', type: 'paper', title: 'Ghost', pending: true, tags: [], x: 0, y: 0 }
], edges: [{ id: 'e1', a: 'a', b: 'b', score: 0.82, reason: 'Shared tags: #retrieval' }, { id: 'e2', a: 'c', b: 'a', pending: true }, { id: 'e3', a: 'g', b: 'a' }, { id: 'e4', a: 'c', b: 'a', score: 0.5 }] };
const now = new Date(2026, 10, 15, 20, 5);
const md = buildExport({ workspace: ws, format: 'markdown', now, scope: { agents: true }, agents: [{ name: 'Controller', score: 52, status: 'idle', stats: { approved: 1, rejected: 0, failed: 0 } }] });
console.log(md);
assert(/^# Retrieval \| QA/.test(md)); assert(md.includes('3 nodes · 2 relationships')); assert(!md.includes('Ghost')); assert(md.includes('## Experiments') && md.includes('| Learning rate | 3e-4 | 1e-3 ← |')); assert(md.includes('```mermaid')); assert(md.includes('| Run 1 |')); assert(md.includes('## Agent team'));
const js = JSON.parse(buildExport({ workspace: ws, format: 'json', now }));
assert.equal(js.schema, 'researchgraph.workspace/1'); assert.equal(js.summary.nodes, 3); assert.equal(js.relationships.length, 2); assert.equal(js.experiments.length, 1); assert.equal(js.experiments[0].baseline.params.learningRate, 3e-4); assert(js.experiments[0].deltas.latencyPct > 0); assert(!js.agents);
const only = JSON.parse(buildExport({ workspace: ws, format: 'json', now, scope: { notes: false, sources: false, relationships: false, experiments: true } })); assert(!only.notes && !only.sources && !only.relationships && only.experiments);
const empty = buildExport({ workspace: { id: 'x', name: 'Empty', nodes: [], edges: [] }, format: 'markdown', now }); assert(empty.includes('0 nodes'));
console.log('export tests passed');
