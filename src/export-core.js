/*
 * ResearchGraph workspace export.
 * buildExport(input) -> string. Markdown for reading and sharing, JSON for tools.
 * Pending (ghost) nodes and edges are left out: only what the user has accepted is exported.
 */
(function (root) {
  'use strict';
  const X = (typeof require === 'function' && typeof module !== 'undefined') ? require('./experiment-core.js') : root.RGExperiment;

  const TYPE_NAME = { paper: 'Paper', dataset: 'Dataset', code: 'Code', note: 'Note', experiment: 'Experiment' };
  const PARAM_NAME = {}; X.PARAMS.forEach(p => { PARAM_NAME[p.key] = p.label; });
  const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const cell = s => clean(s).replace(/\|/g, '\\|');
  const pad = n => String(n).padStart(2, '0');
  const stamp = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  const sgn = (v, unit) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v) + (unit || '');
  const DEFAULT_SCOPE = { notes: true, sources: true, relationships: true, experiments: true, agents: false };

  function prepare(input) {
    const ws = input.workspace || {}, nodes = (ws.nodes || []).filter(n => !n.pending), ids = new Set(nodes.map(n => n.id));
    const edges = (ws.edges || []).filter(e => !e.pending && ids.has(e.a) && ids.has(e.b));
    const byId = new Map(nodes.map(n => [n.id, n]));
    return { ws, nodes, edges, byId, scope: Object.assign({}, DEFAULT_SCOPE, input.scope || {}), now: input.now || new Date(), agents: input.agents || [] };
  }

  function experimentView(n) {
    const e = Object.assign({}, n.exp, { baseline: X.sanitize(n.exp.baseline), params: X.sanitize(n.exp.params) }), ctx = { seed: e.seed };
    const baseM = X.simulate(e.baseline, ctx), curM = X.simulate(e.params, ctx), cmp = X.compare(baseM, curM);
    return { id: n.id, title: n.title, model: e.model, dataset: e.dataset, baseline: { params: e.baseline, metrics: pick(baseM) }, current: { params: e.params, metrics: pick(curM) }, deltas: { accuracyPoints: cmp.accuracy.abs, latencyPct: cmp.latencyMs.pct, trainTimePct: cmp.trainMin.pct, memoryPct: cmp.memGB.pct }, warnings: X.warnings(curM).map(w => w.text), history: (e.history || []).map(h => ({ label: h.label, at: h.at, params: X.sanitize(h.params), accuracy: h.accuracy, latencyMs: h.latencyMs })), simulated: true };
  }
  const pick = m => ({ accuracy: m.accuracy, loss: m.loss, latencyMs: m.latencyMs, trainMin: m.trainMin, memGB: m.memGB, paramsM: m.paramsM });

  function relations(P) {
    return P.edges.map(e => ({ from: e.a, to: e.b, fromTitle: P.byId.get(e.a).title, toTitle: P.byId.get(e.b).title, score: e.score == null ? null : e.score, reason: e.reason || '' }));
  }

  function toJson(P) {
    const s = P.scope, out = { schema: 'researchgraph.workspace/1', exportedAt: P.now.toISOString(), workspace: { id: P.ws.id, name: P.ws.name }, summary: {} };
    const count = {}; P.nodes.forEach(n => { count[n.type] = (count[n.type] || 0) + 1; });
    out.summary = { nodes: P.nodes.length, relationships: P.edges.length, byType: count };
    const slim = n => ({ id: n.id, type: n.type, title: n.title, meta: n.meta || '', topic: n.topic || '', tags: n.tags || [], authors: n.authors || [], summary: n.summary || '', findings: n.findings || [], addedBy: n.by || null, position: { x: Math.round(n.x), y: Math.round(n.y) } });
    if (s.notes) out.notes = P.nodes.filter(n => n.type === 'note').map(slim);
    if (s.sources) out.sources = P.nodes.filter(n => n.type === 'paper' || n.type === 'dataset' || n.type === 'code').map(slim);
    if (s.relationships) out.relationships = relations(P);
    if (s.experiments) out.experiments = P.nodes.filter(n => n.type === 'experiment' && n.exp).map(experimentView);
    if (s.agents) out.agents = P.agents.map(a => ({ id: a.id, name: a.name, score: a.score, status: a.status, retired: !!a.retired, stats: a.stats }));
    return JSON.stringify(out, null, 2);
  }

  function nodeBlock(n) {
    const lines = ['### ' + clean(n.title)];
    const meta = [n.meta, n.topic && 'Topic: ' + n.topic, (n.tags || []).length && (n.tags || []).map(t => '#' + t).join(' ')].filter(Boolean).map(clean);
    if (meta.length) lines.push('_' + meta.join(' · ') + '_');
    if (n.summary) lines.push('', clean(n.summary));
    if ((n.findings || []).length) { lines.push('', '**Key findings**'); n.findings.forEach(f => lines.push('- ' + clean(f))); }
    return lines.join('\n');
  }

  function expBlock(n) {
    const v = experimentView(n), b = v.baseline, c = v.current, rows = [];
    const lines = ['### ' + clean(n.title), '_' + clean(v.model) + ' on ' + clean(v.dataset) + ' · simulated, not measured_', '', '| Parameter | Baseline | Current |', '|---|---|---|'];
    X.PARAMS.forEach(p => { const bv = b.params[p.key], cv = c.params[p.key]; lines.push('| ' + p.label + ' | ' + X.format(p.key, bv) + ' | ' + X.format(p.key, cv) + (bv !== cv ? ' ←' : '') + ' |'); });
    const d = X.compare(b.metrics, c.metrics);
    lines.push('', '| Metric | Baseline | Current | Change |', '|---|---|---|---|',
      '| Accuracy | ' + b.metrics.accuracy + '% | ' + c.metrics.accuracy + '% | ' + sgn(d.accuracy.abs, ' pts') + ' |',
      '| Latency | ' + b.metrics.latencyMs + ' ms | ' + c.metrics.latencyMs + ' ms | ' + sgn(d.latencyMs.pct, '%') + ' |',
      '| Training time | ' + b.metrics.trainMin + ' min | ' + c.metrics.trainMin + ' min | ' + sgn(d.trainMin.pct, '%') + ' |',
      '| GPU memory | ' + b.metrics.memGB + ' GB | ' + c.metrics.memGB + ' GB | ' + sgn(d.memGB.pct, '%') + ' |');
    if (v.warnings.length) { lines.push('', '**Warnings**'); v.warnings.forEach(w => lines.push('- ' + w)); }
    if (v.history.length) {
      lines.push('', '**Saved runs**', '', '| Run | Accuracy | Latency | Settings |', '|---|---|---|---|');
      v.history.forEach(h => lines.push('| ' + cell(h.label) + ' | ' + h.accuracy + '% | ' + h.latencyMs + ' ms | ' + X.PARAMS.map(p => X.format(p.key, h.params[p.key])).join(' / ') + ' |'));
      lines.push('', '_Settings order: ' + X.PARAMS.map(p => p.label.toLowerCase()).join(' / ') + '._');
    }
    return lines.join('\n');
  }

  function toMarkdown(P) {
    const s = P.scope, L = [];
    L.push('# ' + clean(P.ws.name || 'Workspace'), '', '_Exported ' + stamp(P.now) + ' · ' + P.nodes.length + ' nodes · ' + P.edges.length + ' relationships_');
    const count = {}; P.nodes.forEach(n => { count[n.type] = (count[n.type] || 0) + 1; });
    L.push('', Object.keys(TYPE_NAME).filter(k => count[k]).map(k => count[k] + ' ' + TYPE_NAME[k].toLowerCase() + (count[k] > 1 ? 's' : '')).join(' · '));
    const notes = P.nodes.filter(n => n.type === 'note');
    if (s.notes && notes.length) { L.push('', '## Notes'); notes.forEach(n => L.push('', '- ' + clean(n.title) + (n.meta ? ' _(' + clean(n.meta) + ')_' : '') + ((n.tags || []).length ? ' ' + n.tags.map(t => '#' + t).join(' ') : ''))); }
    if (s.sources) {
      [['paper', 'Papers'], ['dataset', 'Datasets'], ['code', 'Code']].forEach(([t, h]) => {
        const xs = P.nodes.filter(n => n.type === t); if (!xs.length) return;
        L.push('', '## ' + h); xs.forEach(n => L.push('', nodeBlock(n)));
      });
    }
    if (s.relationships && P.edges.length) {
      L.push('', '## Relationships', '');
      relations(P).forEach(r => L.push('- ' + clean(r.fromTitle) + ' → ' + clean(r.toTitle) + (r.score != null || r.reason ? ' (' + [r.score != null ? Math.round(r.score * 100) + '%' : '', r.reason].filter(Boolean).join(' · ') + ')' : '')));
      const idx = new Map(P.nodes.map((n, i) => [n.id, 'n' + i])), q = t => '"' + clean(t).replace(/"/g, "'").slice(0, 48) + '"';
      const used = new Set(); P.edges.forEach(e => { used.add(e.a); used.add(e.b); });
      L.push('', '```mermaid', 'graph LR');
      P.nodes.filter(n => used.has(n.id)).forEach(n => L.push('  ' + idx.get(n.id) + '[' + q(n.title) + ']'));
      P.edges.forEach(e => L.push('  ' + idx.get(e.a) + ' --> ' + idx.get(e.b)));
      L.push('```');
    }
    const exps = P.nodes.filter(n => n.type === 'experiment' && n.exp);
    if (s.experiments && exps.length) { L.push('', '## Experiments'); exps.forEach(n => L.push('', expBlock(n))); }
    if (s.agents && P.agents.length) {
      L.push('', '## Agent team', '', '| Agent | Score | Status | Approved | Rejected | Failed |', '|---|---|---|---|---|---|');
      P.agents.forEach(a => L.push('| ' + cell(a.name) + ' | ' + a.score + ' | ' + (a.retired ? 'Retired' : a.status) + ' | ' + a.stats.approved + ' | ' + a.stats.rejected + ' | ' + a.stats.failed + ' |'));
    }
    return L.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
  }

  function buildExport(input) { const P = prepare(input); return input.format === 'json' ? toJson(P) : toMarkdown(P); }

  const api = { buildExport, DEFAULT_SCOPE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RGExport = api;
})(typeof self !== 'undefined' ? self : this);
