/*
 * ResearchGraph experiment simulator.
 *
 * A deterministic, closed-form model of how hyperparameters move accuracy, latency, memory
 * and training time. It is a teaching model, not a measurement: every number it returns is
 * a prediction from the formulas below, and the UI labels it as simulated.
 *
 * Pure functions, no I/O, so the drawer can recompute on every slider tick.
 * Runs in Node (tests, server) and the browser.
 */
(function (root) {
  'use strict';

  /* Parameter schema. scale 'log' sliders move in orders of magnitude. */
  const PARAMS = [
    { key: 'learningRate', label: 'Learning rate', min: 1e-5, max: 1e-1, scale: 'log', fmt: 'sci', hint: 'Step size of the optimiser' },
    { key: 'batchSize', label: 'Batch size', min: 8, max: 512, scale: 'log', step: 1, fmt: 'int', snap: 'pow2', hint: 'Samples per update' },
    { key: 'contextWindow', label: 'Context window', min: 512, max: 32768, scale: 'log', step: 1, fmt: 'ctx', snap: 'pow2', hint: 'Tokens the model can read at once' },
    { key: 'layers', label: 'Model layers', min: 1, max: 48, scale: 'lin', step: 1, fmt: 'int', hint: 'Depth of the network' },
    { key: 'hiddenSize', label: 'Hidden size', min: 32, max: 2048, scale: 'log', step: 1, fmt: 'int', snap: 'pow2', hint: 'Width of each layer' },
    { key: 'epochs', label: 'Epochs', min: 1, max: 100, scale: 'lin', step: 1, fmt: 'int', hint: 'Passes over the training set' },
    { key: 'dropout', label: 'Dropout', min: 0, max: 0.6, scale: 'lin', step: 0.01, fmt: 'dec2', hint: 'Fraction of units dropped in training' }
  ];
  const BY_KEY = {}; PARAMS.forEach(p => { BY_KEY[p.key] = p; });

  const DEFAULTS = { learningRate: 3e-4, batchSize: 32, layers: 6, hiddenSize: 256, epochs: 10, dropout: 0.1, contextWindow: 2048 };
  const PRESETS = {
    fast: { label: 'Fast', params: { learningRate: 1e-3, batchSize: 128, layers: 4, hiddenSize: 256, epochs: 6, dropout: 0.1 } },
    accurate: { label: 'Accurate', params: { learningRate: 3e-4, batchSize: 64, layers: 12, hiddenSize: 512, epochs: 30, dropout: 0.2 } }
  };
  const TRAIN_SAMPLES = 50000, GPU_BUDGET_GB = 24, STEPS_TO_CONVERGE = 5000;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r = (v, d) => { const m = Math.pow(10, d); return Math.round(v * m) / m; };
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function sanitize(params) {
    const out = {};
    PARAMS.forEach(p => {
      let v = Number(params && params[p.key]); if (!isFinite(v)) v = DEFAULTS[p.key];
      v = clamp(v, p.min, p.max); if (p.fmt === 'int' || p.fmt === 'ctx') v = Math.round(v);
      out[p.key] = p.key === 'dropout' ? r(v, 2) : v;
    });
    return out;
  }

  /* Slider position (0..1) <-> value, honouring log scales. */
  function toPos(key, v) { const p = BY_KEY[key]; v = clamp(v, p.min, p.max); return p.scale === 'log' ? (Math.log(v) - Math.log(p.min)) / (Math.log(p.max) - Math.log(p.min)) : (v - p.min) / (p.max - p.min); }
  function fromPos(key, t) {
    const p = BY_KEY[key]; t = clamp(t, 0, 1);
    let v = p.scale === 'log' ? Math.exp(Math.log(p.min) + t * (Math.log(p.max) - Math.log(p.min))) : p.min + t * (p.max - p.min);
    if (p.snap === 'pow2') v = Math.pow(2, Math.round(Math.log2(v)));
    else if (p.key === 'learningRate') v = Number(v.toPrecision(2));
    else if (p.fmt === 'int') v = Math.round(v); else if (p.key === 'dropout') v = r(v, 2);
    return clamp(v, p.min, p.max);
  }
  function format(key, v) {
    const p = BY_KEY[key]; if (p.fmt === 'sci') { const e = v.toExponential(1).replace('e', 'e'); return e.replace(/\.0e/, 'e').replace('e+', 'e'); }
    if (p.fmt === 'dec2') return v.toFixed(2); if (p.fmt === 'ctx') return v >= 1024 ? (v / 1024) + 'k' : String(Math.round(v)); return String(Math.round(v));
  }

  /*
   * Model:
   *  - the best learning rate grows with sqrt(batch size); accuracy falls off as a Gaussian in log10(lr / best)
   *  - capacity saturates with depth x width
   *  - convergence depends on how many optimiser steps fit in the epochs, scaled by the learning-rate factor
   *  - overfitting grows with parameter count and epochs, and is reduced by dropout
   */
  function simulate(input, ctx) {
    const p = sanitize(input), seed = hash((ctx && ctx.seed) || 'default');
    const ceiling = 0.90 + ((seed % 40) / 40) * 0.05;               // 0.90 - 0.95, per experiment
    const floor = 0.10;
    const paramsM = p.layers * 12 * p.hiddenSize * p.hiddenSize / 1e6;
    const bestLr = 3e-4 * Math.sqrt(p.batchSize / 32);
    const lrOff = Math.log10(p.learningRate / bestLr);
    const lrFactor = Math.exp(-(lrOff * lrOff) / (2 * 0.55 * 0.55));
    const capacity = 1 - Math.exp(-(p.layers * p.hiddenSize) / 900);
    const steps = p.epochs * (TRAIN_SAMPLES / p.batchSize);
    const convergence = 1 - Math.exp(-(steps * clamp(lrFactor, 0.05, 1)) / STEPS_TO_CONVERGE);
    const reg = 0.45 + p.dropout * 4;                                  // dropout 0.1 -> 0.85
    const overfit = 0.4 * (1 - Math.exp(-(Math.log10(1 + paramsM) * (p.epochs / 60)) / reg));
    const dropPenalty = p.dropout > 0.3 ? (p.dropout - 0.3) * 0.5 : 0;  // too much dropout underfits
    const diverged = p.learningRate > bestLr * 40;
    let acc = diverged ? floor + 0.02 : floor + (ceiling - floor) * Math.pow(capacity, 0.55) * convergence * (0.35 + 0.65 * lrFactor) * (1 - overfit) * (1 - dropPenalty);
    const ctxLog = Math.log2(p.contextWindow / 2048);                 // 0 at the 2k default, so existing numbers hold
    if (!diverged) acc *= ctxLog <= 2 ? 1 + 0.02 * ctxLog : 1.04 + 0.004 * (ctxLog - 2);   // gains flatten past 8k
    acc = clamp(acc, 0.01, 0.99);
    const memGB = Math.max(0.4, 0.6 + paramsM * 0.016 + (p.batchSize * p.layers * p.hiddenSize * 128 * 34) / 1e9 + (p.contextWindow / 2048 - 1) * 0.5 * (p.batchSize / 32));   // activations at sequence length 128
    const latency = (3.5 + 2.2 * Math.pow(paramsM, 0.85) + p.layers * 0.35) * Math.pow(p.contextWindow / 2048, 0.55);                 // ms per sample at inference
    const stepMs = 6 + paramsM * 4.2 * Math.pow(p.batchSize / 32, 0.8);
    const trainMin = (steps * stepMs) / 60000;
    const loss = clamp(-Math.log(clamp(acc, 0.02, 0.98)) * 0.9 + (diverged ? 2 : 0), 0.02, 5);
    return {
      accuracy: r(acc * 100, 2), loss: r(loss, 3), latencyMs: r(latency, 1), trainMin: r(trainMin, 1), memGB: r(memGB, 1), paramsM: r(paramsM, 1),
      factors: { lrFactor: r(lrFactor, 3), bestLr, capacity: r(capacity, 3), convergence: r(convergence, 3), overfit: r(overfit, 3) },
      diverged, params: p
    };
  }

  /* Validation-accuracy curve over epochs (percent), ending at the model's final accuracy. */
  function curve(input, ctx, points) {
    const m = simulate(input, ctx), E = m.params.epochs, n = Math.min(E, points || 24), out = [];
    const rate = clamp(m.factors.lrFactor, 0.05, 1) * (TRAIN_SAMPLES / m.params.batchSize) / STEPS_TO_CONVERGE;
    const norm = 1 - Math.exp(-rate * E), start = 10;
    for (let i = 1; i <= n; i++) {
      const e = (i / n) * E; const f = (1 - Math.exp(-rate * e)) / (norm || 1);
      const wobble = m.diverged ? 0 : (m.factors.overfit > 0.12 && e > E * 0.7 ? -(e / E - 0.7) * m.factors.overfit * 8 : 0);
      out.push({ epoch: r(e, 1), acc: r(start + (m.accuracy - start) * clamp(f, 0, 1) + wobble, 2) });
    }
    return out;
  }

  /* Differences between a candidate and a reference. `good` is true when the change helps. */
  function compare(base, cur) {
    const d = (a, b) => ({ abs: r(b - a, 2), pct: a ? r(((b - a) / a) * 100, 1) : 0 });
    const acc = d(base.accuracy, cur.accuracy), lat = d(base.latencyMs, cur.latencyMs), tr = d(base.trainMin, cur.trainMin), mem = d(base.memGB, cur.memGB), loss = d(base.loss, cur.loss);
    return {
      accuracy: Object.assign(acc, { good: acc.abs >= 0 }), latencyMs: Object.assign(lat, { good: lat.abs <= 0 }),
      trainMin: Object.assign(tr, { good: tr.abs <= 0 }), memGB: Object.assign(mem, { good: mem.abs <= 0 }), loss: Object.assign(loss, { good: loss.abs <= 0 })
    };
  }

  function warnings(m) {
    const w = [], f = m.factors, p = m.params;
    if (m.diverged) w.push({ level: 'bad', text: 'Learning rate is far above the stable range for this batch size. Training is likely to diverge.' });
    else if (f.bestLr && p.learningRate > f.bestLr * 6) w.push({ level: 'warn', text: 'Learning rate is high for this batch size. Expect unstable loss.' });
    else if (p.learningRate < f.bestLr / 15) w.push({ level: 'warn', text: 'Learning rate is very low. Training will converge slowly.' });
    if (m.memGB > GPU_BUDGET_GB) w.push({ level: 'bad', text: 'Needs about ' + m.memGB + ' GB, above the ' + GPU_BUDGET_GB + ' GB GPU budget. Lower the batch size or model size.' });
    if (f.overfit > 0.15) w.push({ level: 'warn', text: 'Large model with many epochs and little dropout. Overfitting is likely.' });
    if (f.convergence < 0.6 && !m.diverged) w.push({ level: 'warn', text: 'Too few optimiser steps to converge. Add epochs or lower the batch size.' });
    if (p.dropout > 0.4) w.push({ level: 'warn', text: 'Heavy dropout can underfit.' });
    return w;
  }

  /* Grid search with the same model. Returns the best configuration that fits the budget. */
  function tune(base, ctx, opts) {
    opts = opts || {}; const maxMem = opts.maxMemGB || GPU_BUDGET_GB, maxLat = opts.maxLatencyMs || Infinity;
    const lrs = [1e-4, 2e-4, 3e-4, 5e-4, 1e-3, 2e-3], bss = [16, 32, 64, 128, 256], ls = [4, 6, 8, 12, 16], hs = [128, 256, 512, 1024], ds = [0.05, 0.1, 0.2, 0.3];
    let best = null, tried = 0; const fixed = sanitize(base);
    lrs.forEach(learningRate => bss.forEach(batchSize => ls.forEach(layers => hs.forEach(hiddenSize => ds.forEach(dropout => {
      const params = Object.assign({}, fixed, { learningRate, batchSize, layers, hiddenSize, dropout }); const m = simulate(params, ctx); tried++;
      if (m.memGB > maxMem || m.latencyMs > maxLat || m.diverged) return;
      if (!best || m.accuracy > best.m.accuracy) best = { params: sanitize(params), m };
    })))));
    return best && { params: best.params, metrics: best.m, tried };
  }

  /* Experiment node payload. */
  function makeExp(opts) {
    opts = opts || {}; const base = sanitize(Object.assign({}, DEFAULTS, opts.baseline || {})), params = sanitize(Object.assign({}, base, opts.params || {}));
    const seed = opts.seed || opts.model || 'experiment';
    return { model: opts.model || 'Transformer encoder', dataset: opts.dataset || 'Training set', seed, baseline: base, params, metrics: simulate(params, { seed }), history: opts.history || [] };
  }

  const api = { PARAMS, BY_KEY, DEFAULTS, PRESETS, GPU_BUDGET_GB, sanitize, simulate, curve, compare, warnings, tune, makeExp, toPos, fromPos, format };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RGExperiment = api;
})(typeof self !== 'undefined' ? self : this);
