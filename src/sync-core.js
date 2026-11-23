/*
 * ResearchGraph offline-first core: snapshots, change log, replay state and merge.
 * Pure functions. Runs in Node (server, tests) and in the browser.
 *
 *  serialize(WS, meta)          -> plain snapshot that is safe to store (pending ghost nodes are dropped)
 *  diffWorkspace(ws, now)       -> appends change events to ws.log by comparing against ws.__sig
 *  seedLog(ws, now)             -> a sample history for the built-in demo workspaces
 *  stateAt(ws, step)            -> which nodes and edges existed after `step` events
 *  merge(server, client)        -> last-writer-wins merge with tombstones (used by /api/sync)
 */
(function (root) {
  'use strict';
  const DAY = 86400000;
  const TYPE_NAME = { paper: 'Paper', dataset: 'Dataset', code: 'Code', note: 'Note', experiment: 'Experiment' };
  const AGENT_NAME = { controller: 'Controller', literature: 'Literature Reviewer', setup: 'Environment Setup', experiment: 'Experiment Simulator', you: 'You' };
  const short = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  let evSeq = 0;
  const evId = () => 'h' + Date.now().toString(36) + (++evSeq).toString(36);

  /* ---------- snapshots ---------- */
  function serialize(WS, meta) {
    meta = meta || {};
    return {
      v: 1, clientId: meta.clientId || null, savedAt: meta.now != null ? meta.now : Date.now(), active: meta.active || null, seq: meta.seq || 0, gone: meta.gone || {},
      ws: WS.map(w => {
        const live = w.nodes.filter(n => !n.pending), ids = new Set(live.map(n => n.id));
        return {
          id: w.id, name: w.name, clustered: !!w.clustered, regions: w.regions || [], nameAt: w.nameAt || 0,
          nodes: live.map(n => JSON.parse(JSON.stringify(n))),
          edges: w.edges.filter(e => !e.pending && ids.has(e.a) && ids.has(e.b)).map(e => ({ id: e.id, a: e.a, b: e.b, score: e.score, reason: e.reason, manual: e.manual ? 1 : undefined, ut: e.ut })),
          log: w.log || [], tomb: w.tomb || {}
        };
      })
    };
  }
  /* Rebuild runtime workspaces from a snapshot. `blank(w)` supplies the runtime-only fields. */
  function hydrate(snap, blank) {
    return (snap.ws || []).map(w => Object.assign(blank(w), {
      id: w.id, name: w.name, nameAt: w.nameAt || 0, clustered: !!w.clustered, regions: w.regions || [],
      nodes: (w.nodes || []).map(n => Object.assign({}, n, { pending: false })),
      edges: (w.edges || []).map(e => Object.assign({}, e, { pending: false })),
      log: w.log || [], tomb: w.tomb || {}
    }));
  }
  function maxSeq(snap) {
    let m = 0; const num = id => { const r = /(\d+)$/.exec(String(id || '')); if (r) m = Math.max(m, +r[1]); };
    (snap.ws || []).forEach(w => { num(w.id); (w.nodes || []).forEach(n => num(n.id)); (w.edges || []).forEach(e => num(e.id)); });
    return m;
  }

  /* ---------- change detection ---------- */
  function signature(ws) {
    const nodes = {}, edges = {};
    ws.nodes.forEach(n => { if (!n.pending) nodes[n.id] = { h: n.exp && n.exp.history ? n.exp.history.length : 0, a: n.exp && n.exp.history && n.exp.history.length ? n.exp.history[n.exp.history.length - 1].accuracy : null, t: n.title, x: n.x, y: n.y, k: JSON.stringify(n.exp ? n.exp.params : null), c: [n.summary || '', n.url || '', (n.tags || []).join(','), n.edited ? 1 : 0].join('\u0001') }; });
    ws.edges.forEach(e => { if (!e.pending && nodes[e.a] && nodes[e.b]) edges[e.id] = [e.a, e.b]; });
    return { nodes, edges, clustered: !!ws.clustered, name: ws.name };
  }
  function lastTs(ws, now) { const l = ws.log || []; return l.length ? Math.max(now, l[l.length - 1].ts + 1) : now; }
  /* Compares the workspace with its previous signature, appends events, returns how many changes were found. */
  function diffWorkspace(ws, now) {
    ws.log = ws.log || []; ws.tomb = ws.tomb || {};
    const cur = signature(ws), prev = ws.__sig;
    ws.__sig = cur;
    const stamp = id => { const n = ws.nodes.find(x => x.id === id); if (n) n.ut = now; };
    if (!prev) return { events: 0, other: 0 };
    Object.keys(cur.nodes).forEach(id => { const a = prev.nodes[id], b = cur.nodes[id]; if (!a || a.x !== b.x || a.y !== b.y || a.t !== b.t || a.k !== b.k || a.h !== b.h || a.c !== b.c) stamp(id); });
    if (prev.name !== cur.name) ws.nameAt = now;
    const byId = new Map(ws.nodes.map(n => [n.id, n])), out = [];
    const added = Object.keys(cur.nodes).filter(id => !prev.nodes[id]);
    const removed = Object.keys(prev.nodes).filter(id => !cur.nodes[id]);
    const newEdges = Object.keys(cur.edges).filter(id => !prev.edges[id]);
    const goneEdges = Object.keys(prev.edges).filter(id => !cur.edges[id]);
    const used = new Set();
    newEdges.forEach(id => { const e = ws.edges.find(x => x.id === id); if (e) e.ut = now; });
    added.forEach(id => {
      const n = byId.get(id), mine = newEdges.filter(eid => cur.edges[eid].includes(id));
      mine.forEach(e => used.add(e));
      const agent = n.by && n.by !== 'you' ? n.by : null;
      const kind = n.type === 'experiment' ? 'experiment' : agent ? 'agent' : 'source';
      out.push({ kind, by: n.by || 'you', nodes: [id], edges: mine, text: (agent ? AGENT_NAME[agent] + ' added ' : 'Added ') + (TYPE_NAME[n.type] || 'node').toLowerCase() + ': ' + short(n.title, 64) + (mine.length ? ' · ' + mine.length + (mine.length === 1 ? ' link' : ' links') : '') });
    });
    const loose = newEdges.filter(e => !used.has(e));
    if (loose.length) out.push({ kind: 'link', by: 'you', nodes: [], edges: loose, text: 'Linked ' + loose.length + (loose.length === 1 ? ' pair' : ' pairs') + ' of nodes' });
    Object.keys(cur.nodes).forEach(id => {
      const a = prev.nodes[id], b = cur.nodes[id]; if (!a) return;
      if (b.h > a.h) { const n = byId.get(id); out.push({ kind: 'experiment', by: 'you', nodes: [id], edges: [], text: 'Saved run' + (b.a != null ? ' at ' + b.a + '% accuracy' : '') + ': ' + short(n.title, 56) }); }
    });
    removed.forEach(id => {
      ws.tomb[id] = now;
      out.push({ kind: 'remove', by: 'you', nodes: [], edges: [], removed: [id], text: 'Removed ' + short(id, 20) });
    });
    goneEdges.forEach(id => { ws.tomb[id] = now; });
    if (prev.clustered !== cur.clustered) out.push({ kind: 'cluster', by: 'you', nodes: [], edges: [], text: cur.clustered ? 'Grouped the canvas by topic' : 'Ungrouped the canvas' });
    let ts = lastTs(ws, now);
    out.forEach(ev => { ev.id = evId(); ev.ts = ts++; ws.log.push(ev); });
    if (ws.log.length > 600) ws.log.splice(0, ws.log.length - 600);
    // Moves, renames and parameter tweaks are saved but not shown as timeline steps.
    let other = 0;
    Object.keys(cur.nodes).forEach(id => { const a = prev.nodes[id], b = cur.nodes[id]; if (a && (a.x !== b.x || a.y !== b.y || a.t !== b.t || a.k !== b.k || a.c !== b.c)) other++; });
    if (prev.name !== cur.name) other++;
    return { events: out.length, other };
  }
  /* Records something that does not change the graph, such as an agent finishing a goal. */
  function note(ws, kind, by, text, now) {
    ws.log = ws.log || [];
    const ev = { id: evId(), ts: lastTs(ws, now), kind, by, nodes: [], edges: [], text: short(text, 120) };
    ws.log.push(ev); return ev;
  }

  /* ---------- sample history for the demo workspaces ---------- */
  function seedLog(ws, now) {
    const nodes = ws.nodes.filter(n => !n.pending), pos = new Map(nodes.map((n, i) => [n.id, i]));
    const span = 6.2 * DAY, n = Math.max(nodes.length, 1), order = nodes.slice().sort((a, b) => (a.type === 'experiment') - (b.type === 'experiment'));
    const at = new Map(); order.forEach((nd, i) => { at.set(nd.id, now - span + (span * 0.92) * (i / n) + ((i * 7919) % 53) * 60000); });
    const log = [];
    order.forEach(nd => {
      const mine = ws.edges.filter(e => !e.pending && (e.a === nd.id || e.b === nd.id) && pos.has(e.a) && pos.has(e.b) && at.get(e.a === nd.id ? e.b : e.a) < at.get(nd.id));
      const agent = nd.by && nd.by !== 'you' ? nd.by : null;
      const kind = nd.type === 'experiment' ? 'experiment' : agent ? 'agent' : 'source';
      let ts = at.get(nd.id);
      if (nd.type === 'experiment') {
        log.push({ kind: 'agent', by: 'experiment', nodes: [], edges: [], ts: ts - 20 * 60000, text: 'Experiment Simulator ran a hyperparameter sweep for ' + short(nd.title, 48), seed: true });
      }
      log.push({ kind, by: nd.by || 'you', nodes: [nd.id], edges: mine.map(e => e.id), ts, seed: true, text: (agent ? AGENT_NAME[agent] + ' added ' : 'Added ') + (TYPE_NAME[nd.type] || 'node').toLowerCase() + ': ' + short(nd.title, 64) + (mine.length ? ' · ' + mine.length + (mine.length === 1 ? ' link' : ' links') : '') });
      if (nd.type === 'experiment' && nd.exp && nd.exp.history && nd.exp.history.length) {
        const h = nd.exp.history[0];
        log.push({ kind: 'experiment', by: 'you', nodes: [nd.id], edges: [], ts: Math.min(h.at || ts + 3600000, now - 3600000), seed: true, text: 'Saved run at ' + h.accuracy + '% accuracy: ' + short(nd.title, 56) });
      }
    });
    // Edges whose endpoints were placed on the same step, or that were not claimed above.
    const claimed = new Set(); log.forEach(e => e.edges.forEach(x => claimed.add(x)));
    const rest = ws.edges.filter(e => !e.pending && pos.has(e.a) && pos.has(e.b) && !claimed.has(e.id));
    rest.forEach(e => { const t = Math.max(at.get(e.a), at.get(e.b)) + 90000; log.push({ kind: 'link', by: 'you', nodes: [], edges: [e.id], ts: t, seed: true, text: 'Linked ' + short((nodes[pos.get(e.a)] || {}).title, 30) + ' and ' + short((nodes[pos.get(e.b)] || {}).title, 30) }); });
    log.sort((a, b) => a.ts - b.ts);
    // A node added after its partner already needs the edge on the later step; anything left over is attached to the latest event.
    log.forEach((e, i) => { e.id = 's' + (i + 1) + '_' + ws.id; });
    ws.log = log;
    return log;
  }

  /* ---------- replay ---------- */
  function stateAt(ws, step) {
    const nodes = new Set(), edges = new Set(), log = ws.log || [], n = Math.max(0, Math.min(step, log.length));
    for (let i = 0; i < n; i++) {
      const e = log[i];
      (e.nodes || []).forEach(x => nodes.add(x)); (e.edges || []).forEach(x => edges.add(x));
      (e.removed || []).forEach(x => nodes.delete(x));
    }
    const present = new Set(ws.nodes.filter(x => !x.pending).map(x => x.id));
    // Anything on the map that no event explains (for example data restored from an older version) counts as always there.
    const known = new Set(); log.forEach(e => { (e.nodes || []).forEach(x => known.add(x)); });
    present.forEach(id => { if (!known.has(id)) nodes.add(id); });
    const knownE = new Set(); log.forEach(e => { (e.edges || []).forEach(x => knownE.add(x)); });
    ws.edges.forEach(e => { if (!e.pending && !knownE.has(e.id)) edges.add(e.id); });
    const focus = n > 0 ? log[n - 1] : null;
    return { nodes, edges, focus, step: n, total: log.length };
  }

  /* ---------- merge (server side) ---------- */
  function mergeList(a, b, tomb, key) {
    const m = new Map();
    (a || []).concat(b || []).forEach(x => {
      if (tomb[x.id] && tomb[x.id] >= (x.ut || 0)) return;
      const p = m.get(x.id);
      if (!p || (x.ut || 0) > (p.ut || 0)) m.set(x.id, x);
    });
    return Array.from(m.values());
  }
  function merge(server, client) {
    if (!server || !server.ws) return client;
    const gone = Object.assign({}, server.gone, client.gone);
    const out = { v: 1, clientId: client.clientId, savedAt: Date.now(), active: client.active, seq: Math.max(server.seq || 0, client.seq || 0), gone, ws: [] };
    const sMap = new Map(server.ws.map(w => [w.id, w])), seen = new Set();
    client.ws.forEach(c => {
      if (gone[c.id]) return;
      seen.add(c.id); const s = sMap.get(c.id);
      if (!s) { out.ws.push(c); return; }
      const tomb = Object.assign({}, s.tomb, c.tomb); Object.keys(s.tomb || {}).forEach(k => { tomb[k] = Math.max((s.tomb || {})[k] || 0, (c.tomb || {})[k] || 0); });
      const nodes = mergeList(s.nodes, c.nodes, tomb), ids = new Set(nodes.map(n => n.id));
      const edges = mergeList(s.edges, c.edges, tomb).filter(e => ids.has(e.a) && ids.has(e.b));
      const logIds = new Set(), log = [];
      (s.log || []).concat(c.log || []).forEach(e => { if (!logIds.has(e.id)) { logIds.add(e.id); log.push(e); } });
      log.sort((a, b) => a.ts - b.ts);
      out.ws.push({ id: c.id, nameAt: Math.max(c.nameAt || 0, s.nameAt || 0), name: (c.nameAt || 0) >= (s.nameAt || 0) ? c.name : s.name, clustered: c.clustered, regions: c.regions, nodes, edges, log: log.slice(-600), tomb });
    });
    server.ws.forEach(s => { if (!seen.has(s.id) && !gone[s.id]) out.ws.push(s); });
    return out;
  }

  const api = { serialize, hydrate, maxSeq, diffWorkspace, note, seedLog, stateAt, merge, signature, short };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RGSync = api;
})(typeof self !== 'undefined' ? self : this);
