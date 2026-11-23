const assert = require('assert');
const X = require('../src/experiment-core.js');
const ctx = { seed: 'demo' };
const base = X.simulate(X.DEFAULTS, ctx);
console.log('baseline', JSON.stringify({ a: base.accuracy, loss: base.loss, lat: base.latencyMs, train: base.trainMin, mem: base.memGB, M: base.paramsM, f: base.factors }));
const at = p => X.simulate(Object.assign({}, X.DEFAULTS, p), ctx);
// determinism and range
assert.deepEqual(X.simulate(X.DEFAULTS, ctx), base); assert(base.accuracy > 55 && base.accuracy < 95, 'baseline acc sane: ' + base.accuracy);
// learning rate has an interior optimum
const lrs = [1e-5, 1e-4, 3e-4, 1e-3, 1e-2, 1e-1].map(lr => at({ learningRate: lr }).accuracy); console.log('lr sweep', lrs.join(' '));
assert(lrs[2] > lrs[0] && lrs[2] > lrs[4] && lrs[5] < 20, 'lr optimum');
// depth: latency and params rise monotonically; accuracy rises then saturates
const ls = [1, 2, 4, 8, 16, 32].map(l => at({ layers: l })); console.log('layers acc', ls.map(x => x.accuracy).join(' '), 'lat', ls.map(x => x.latencyMs).join(' '));
for (let i = 1; i < ls.length; i++) assert(ls[i].latencyMs > ls[i - 1].latencyMs && ls[i].paramsM > ls[i - 1].paramsM);
assert(ls[3].accuracy > ls[0].accuracy);
// batch size: memory rises; fewer steps per epoch
const bs = [8, 32, 128, 512].map(b => at({ batchSize: b })); console.log('batch mem', bs.map(x => x.memGB).join(' '), 'train', bs.map(x => x.trainMin).join(' '), 'acc', bs.map(x => x.accuracy).join(' '));
for (let i = 1; i < bs.length; i++) assert(bs[i].memGB > bs[i - 1].memGB);
// epochs: more epochs, more training time, accuracy does not fall at first
assert(at({ epochs: 30 }).trainMin > at({ epochs: 10 }).trainMin && at({ epochs: 20 }).accuracy >= at({ epochs: 3 }).accuracy);
// dropout helps big models, hurts when extreme
const dr = [0, 0.1, 0.3, 0.6].map(d => at({ dropout: d, layers: 24, hiddenSize: 1024, epochs: 60 }).accuracy); console.log('dropout', dr.join(' ')); assert(dr[2] > dr[0] && dr[3] < dr[2], 'dropout helps big models then hurts');
// clamps
const wild = X.sanitize({ learningRate: 9, batchSize: -4, layers: 'x', epochs: 1e9, dropout: 3 }); assert.equal(wild.learningRate, 0.1); assert.equal(wild.batchSize, 8); assert.equal(wild.layers, X.DEFAULTS.layers); assert.equal(wild.epochs, 100); assert.equal(wild.dropout, 0.6);
// slider mapping round-trips
X.PARAMS.forEach(p => { const v = X.DEFAULTS[p.key], back = X.fromPos(p.key, X.toPos(p.key, v)); assert(Math.abs(back - v) / v < 0.2, p.key + ' roundtrip ' + back); });
assert.equal(X.fromPos('batchSize', 0.5), 64); assert.equal(X.fromPos('learningRate', 0), 1e-5);
// compare + warnings
const big = at({ layers: 24, hiddenSize: 1024, batchSize: 256 }), cmp = X.compare(base, big); console.log('big', big.accuracy, big.memGB, big.latencyMs, 'cmp', JSON.stringify(cmp.accuracy), JSON.stringify(cmp.latencyMs));
assert(cmp.latencyMs.abs > 0 && cmp.latencyMs.good === false);
assert(X.warnings(at({ learningRate: 0.1 })).some(w => w.level === 'bad'));
assert(X.warnings(big).some(w => /GPU budget/.test(w.text)));
assert.deepEqual(X.warnings(base), []);
// curve ends at the final accuracy and rises
const c = X.curve(X.DEFAULTS, ctx); assert(Math.abs(c[c.length - 1].acc - base.accuracy) < 1.5); assert(c[0].acc < c[c.length - 1].acc);
// tune beats baseline within the budget
const t = X.tune(X.DEFAULTS, ctx); console.log('tuned', JSON.stringify(t.params), t.metrics.accuracy, 'tried', t.tried); assert(t.metrics.accuracy > base.accuracy && t.metrics.memGB <= 24);
const tl = X.tune(X.DEFAULTS, ctx, { maxLatencyMs: 12 }); assert(tl.metrics.latencyMs <= 12);
// makeExp
const e = X.makeExp({ model: 'ResNet-50', dataset: 'CIFAR-100', params: { learningRate: 1e-3 } }); assert.equal(e.baseline.learningRate, 3e-4); assert.equal(e.params.learningRate, 1e-3); assert(e.metrics.accuracy);
console.log('experiment tests passed');
