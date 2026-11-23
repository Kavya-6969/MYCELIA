/*
 * MYCELIA study tools. Pure functions, run in Node and in the browser. No model needed:
 * everything is built from what is on the canvas (cards, their summaries, tags, findings, links).
 *
 *   context(items, edges, selId, wsName) -> ctx   whole workspace, or one card plus the cards linked to it
 *   slides(ctx)        -> [{ title, bullets[], notes, refs[] }]   5 slides
 *   slidesMarkdown(slides, ctx, withNotes) -> string
 *   quiz(ctx, seed)    -> [{ id, kind:'mc'|'short', q, options?, answer?, keywords?, model?, explain, ref }]
 *   checkShort(question, text) -> { ok, hits[] }
 *   cards(ctx, seed)   -> [{ id, front, back, kind, ref }]
 *   mindmap(ctx)       -> { id, label, kind, children[] }  tree; leaves carry ref (card id)
 *   nodeInfo(ctx, id)  -> { title, type, summary, findings, tags, links[] }
 *   summaryText(kind, ctx, data) -> markdown for a note placed back on the canvas
 */
(function (root) {
  'use strict';
  const TYPE_LABEL = { paper: 'Paper', dataset: 'Dataset', code: 'Code', note: 'Note', experiment: 'Experiment' };
  const GROUPS = [['paper', 'Papers'], ['dataset', 'Datasets'], ['code', 'Code'], ['note', 'Notes'], ['experiment', 'Experiments']];
  const STOP = new Set('the a an and or of to in on for with is are was were be by as at it its this that from into than then these those their our we you can using use used based new via over under per not but also more most such which while when where how what'.split(' '));

  const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
  const sentence = s => { s = String(s || '').replace(/\s+/g, ' ').trim(); const m = s.match(/^(.+?[.!?])(\s|$)/); return m ? m[1] : s; };
  const words = s => String(s || '').toLowerCase().replace(/[^a-z0-9+\-\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
  function rng(seed) { let a = (seed | 0) + 0x6D2B79F5; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const pct = v => (v * (v <= 1 ? 100 : 1)).toFixed(1) + '%';

  function context(items, edges, selId, wsName) {
    items = (items || []).filter(Boolean);
    const sel = selId ? items.find(i => i.id === selId) : null;
    let nodes = items;
    if (sel) {
      const ids = new Set([sel.id]);
      (edges || []).forEach(e => { if (e.a === sel.id) ids.add(e.b); if (e.b === sel.id) ids.add(e.a); });
      nodes = [sel].concat(items.filter(i => i.id !== sel.id && ids.has(i.id)));
    }
    const set = new Set(nodes.map(n => n.id));
    const es = (edges || []).filter(e => set.has(e.a) && set.has(e.b));
    const byId = {}; nodes.forEach(n => { byId[n.id] = n; });
    const deg = {}; nodes.forEach(n => { deg[n.id] = 0; });
    es.forEach(e => { deg[e.a]++; deg[e.b]++; });
    const topics = {}; nodes.forEach(n => { const t = n.topic || (n.tags && n.tags[0]) || ''; if (t) topics[t] = (topics[t] || 0) + 1; });
    const tagCount = {}; nodes.forEach(n => (n.tags || []).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; }));
    return {
      scope: sel ? 'node' : 'workspace', sel, nodes, edges: es, byId, deg,
      title: sel ? sel.title : (wsName || 'Workspace'), wsName: wsName || 'Workspace',
      topics: Object.keys(topics).sort((a, b) => topics[b] - topics[a]),
      tags: Object.keys(tagCount).sort((a, b) => tagCount[b] - tagCount[a]),
      of: t => nodes.filter(n => n.type === t),
    };
  }

  const ttl = (ctx, id) => (ctx.byId[id] ? ctx.byId[id].title : id);
  const ref = n => '[' + TYPE_LABEL[n.type] + ': ' + clip(n.title, 48) + ']';

  /* ---------- slide deck ---------- */
  function slides(ctx) {
    const N = ctx.nodes, out = [];
    const cnt = GROUPS.map(([t, l]) => [l, ctx.of(t).length]).filter(x => x[1]);
    const lead = ctx.sel ? ctx.sel : null;
    out.push({
      title: 'Title & overview',
      bullets: [
        ctx.scope === 'node' ? 'Focus: ' + ctx.title + ' (' + TYPE_LABEL[lead.type].toLowerCase() + ')' : 'Workspace: ' + ctx.title,
        N.length + ' card' + (N.length === 1 ? '' : 's') + ' and ' + ctx.edges.length + ' link' + (ctx.edges.length === 1 ? '' : 's') + (cnt.length ? ' (' + cnt.map(c => c[1] + ' ' + c[0].toLowerCase()).join(', ') + ')' : ''),
        ctx.topics.length ? 'Topics: ' + ctx.topics.slice(0, 4).join(', ') : (ctx.tags.length ? 'Tags: ' + ctx.tags.slice(0, 5).join(', ') : 'No topics or tags yet'),
        lead && lead.summary ? sentence(lead.summary) : '',
      ].filter(Boolean),
      notes: 'Open by saying what this map covers and why it exists. ' + (N.length ? 'It is built from ' + N.length + ' cards you collected, so every later slide points back to a card.' : 'The canvas is empty, so add a source first.'),
      refs: lead ? [lead.id] : N.slice(0, 3).map(n => n.id),
    });
    const src = N.filter(n => n.type === 'paper' || n.type === 'dataset' || n.type === 'code').sort((a, b) => (ctx.deg[b.id] - ctx.deg[a.id]));
    const srcB = [];
    src.slice(0, 5).forEach(n => { srcB.push(TYPE_LABEL[n.type] + ': ' + clip(n.title, 60) + (n.summary ? ' — ' + clip(sentence(n.summary), 110) : '')); });
    N.filter(n => n.findings && n.findings.length).slice(0, 3).forEach(n => srcB.push('Finding: ' + clip(n.findings[0], 120) + ' ' + ref(n)));
    out.push({
      title: 'Key sources & findings',
      bullets: srcB.length ? srcB : ['No papers, datasets or code on this map yet'],
      notes: 'Walk through the most connected sources first. For each one say what it contributes, then read the finding aloud.',
      refs: src.slice(0, 5).map(n => n.id),
    });
    const hubs = N.slice().sort((a, b) => ctx.deg[b.id] - ctx.deg[a.id]).filter(n => ctx.deg[n.id] > 0).slice(0, 2);
    const cB = [];
    if (hubs.length) cB.push('Hub' + (hubs.length > 1 ? 's' : '') + ': ' + hubs.map(h => clip(h.title, 40) + ' (' + ctx.deg[h.id] + ' links)').join(', '));
    ctx.edges.slice().sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5).forEach(e => cB.push(clip(ttl(ctx, e.a), 32) + ' ↔ ' + clip(ttl(ctx, e.b), 32) + (e.reason ? ': ' + clip(e.reason, 80) : '')));
    const iso = N.filter(n => !ctx.deg[n.id]);
    if (iso.length && N.length > 1) cB.push(iso.length + ' card' + (iso.length > 1 ? 's' : '') + ' not linked to anything yet');
    out.push({
      title: 'Architecture & connections',
      bullets: cB.length ? cB : ['No links yet. Drag from one card’s dot to another to connect them'],
      notes: 'Explain how the pieces depend on each other. Hubs are the cards the rest of the work leans on.',
      refs: hubs.map(h => h.id).concat(ctx.edges.slice(0, 3).flatMap(e => [e.a, e.b])).filter((v, i, a) => a.indexOf(v) === i),
    });
    const ex = ctx.of('experiment');
    const eB = [];
    ex.forEach(n => { if (n.acc != null) eB.push(clip(n.title, 52) + ': accuracy ' + pct(n.acc) + (n.lat != null ? ', latency ' + Math.round(n.lat) + ' ms' : '')); });
    const withAcc = ex.filter(n => n.acc != null);
    if (withAcc.length > 1) { const b = withAcc.slice().sort((a, c) => c.acc - a.acc)[0]; eB.unshift('Best accuracy: ' + clip(b.title, 50) + ' (' + pct(b.acc) + ')'); }
    ex.forEach(n => (n.findings || []).slice(0, 1).forEach(f => eB.push('What-if: ' + clip(f, 110))));
    out.push({
      title: 'Experiments & what-if takeaways',
      bullets: eB.length ? eB.slice(0, 6) : ['No experiments yet. Ask the Experiment agent to run one'],
      notes: 'Say what was changed in each run and what moved. Numbers come from the simulated experiment model, so call them estimates.',
      refs: ex.map(n => n.id),
    });
    const nx = [];
    if (!ex.length) nx.push('Run a first experiment to test the main idea');
    if (!ctx.of('dataset').length) nx.push('Add a dataset so results can be reproduced');
    if (iso.length && N.length > 1) nx.push('Link ' + clip(iso[0].title, 40) + (iso.length > 1 ? ' and ' + (iso.length - 1) + ' more' : '') + ' into the map');
    ctx.of('note').slice(0, 2).forEach(n => nx.push('Follow up: ' + clip(n.title, 70)));
    if (!ctx.of('paper').length) nx.push('Collect papers that support the idea');
    nx.push('Write up the result as a note and share the export');
    out.push({ title: 'Next steps', bullets: nx.slice(0, 6), notes: 'Close with the one thing to do first. Ask the audience for sources you have missed.', refs: ctx.of('note').map(n => n.id) });
    return out;
  }

  function slidesMarkdown(sl, ctx, withNotes) {
    const L = ['# ' + ctx.title, '_' + (ctx.scope === 'node' ? 'Slides from one card and its links' : 'Slides from the whole workspace') + ' · ' + ctx.nodes.length + ' cards_', ''];
    sl.forEach((s, i) => {
      L.push('## ' + (i + 1) + '. ' + s.title, '');
      s.bullets.forEach(b => L.push('- ' + b));
      if (withNotes && s.notes) L.push('', '> Speaker notes: ' + s.notes);
      L.push('');
    });
    return L.join('\n').trim() + '\n';
  }

  /* ---------- quiz ---------- */
  function pick(r, arr, n, not) { return shuffle(arr.filter(x => x !== not), r).slice(0, n); }
  function mc(id, q, correct, wrong, r, explain, refId) {
    const w = wrong.filter((x, i, a) => x && x !== correct && a.indexOf(x) === i).slice(0, 3);
    if (w.length < 2) return null;
    const opts = shuffle([correct].concat(w), r);
    return { id, kind: 'mc', q, options: opts, answer: opts.indexOf(correct), explain, ref: refId };
  }
  function quiz(ctx, seed) {
    const r = rng(seed == null ? 1 : seed), N = ctx.nodes, Q = [];
    const titles = N.map(n => n.title);
    shuffle(N.filter(n => n.summary), r).slice(0, 3).forEach((n, i) => {
      const q = mc('q-d' + i, 'Which card is described by: “' + clip(sentence(n.summary), 130) + '”?', n.title, pick(r, titles, 3, n.title), r, 'That is the summary of “' + n.title + '” ' + ref(n) + '.', n.id);
      if (q) Q.push(q);
    });
    shuffle(N, r).slice(0, 2).forEach((n, i) => {
      const q = mc('q-t' + i, 'What kind of card is “' + clip(n.title, 70) + '”?', TYPE_LABEL[n.type], Object.keys(TYPE_LABEL).map(k => TYPE_LABEL[k]), r, '“' + n.title + '” is a ' + TYPE_LABEL[n.type].toLowerCase() + (n.meta ? ' (' + clip(n.meta, 60) + ')' : '') + ' ' + ref(n) + '.', n.id);
      if (q) Q.push(q);
    });
    const tagged = N.filter(n => n.tags && n.tags.length);
    if (tagged.length) {
      const n = shuffle(tagged, r)[0], tag = n.tags[0], other = ctx.tags.filter(t => !n.tags.includes(t));
      const q = mc('q-g0', 'Which tag is on “' + clip(n.title, 70) + '”?', tag, other, r, '“' + n.title + '” carries the tag “' + tag + '” ' + ref(n) + '.', n.id);
      if (q) Q.push(q);
    }
    const ex = ctx.of('experiment').filter(n => n.acc != null);
    if (ex.length > 1) {
      const best = ex.slice().sort((a, b) => b.acc - a.acc)[0];
      const q = mc('q-x0', 'Which experiment reached the highest accuracy?', best.title, ex.map(n => n.title), r, '“' + best.title + '” scored ' + pct(best.acc) + (best.lat != null ? ' at ' + Math.round(best.lat) + ' ms' : '') + ' ' + ref(best) + '.', best.id);
      if (q) Q.push(q);
    }
    if (ctx.edges.length) {
      const e = shuffle(ctx.edges, r)[0], a = ctx.byId[e.a], b = ctx.byId[e.b];
      const q = mc('q-l0', 'Which card is linked to “' + clip(a.title, 60) + '”?', b.title, N.filter(n => n.id !== a.id && !ctx.edges.some(x => (x.a === a.id && x.b === n.id) || (x.b === a.id && x.a === n.id))).map(n => n.title), r, 'They are linked' + (e.reason ? ': ' + e.reason : '') + ' ' + ref(a) + ' ' + ref(b) + '.', a.id);
      if (q) Q.push(q);
    }
    shuffle(N.filter(n => n.summary), r).slice(0, 2).forEach((n, i) => {
      const kw = Array.from(new Set(words(n.title).concat(words(n.summary), (n.tags || []).map(t => t.toLowerCase())))).slice(0, 12);
      Q.push({ id: 'q-s' + i, kind: 'short', q: 'In one or two sentences, what is “' + clip(n.title, 70) + '” about?', keywords: kw, model: n.summary, explain: 'Source summary: ' + clip(n.summary, 220) + ' ' + ref(n), ref: n.id });
    });
    const f = shuffle(N.filter(n => n.findings && n.findings.length), r)[0];
    if (f) Q.push({ id: 'q-f0', kind: 'short', q: 'Name one finding reported in “' + clip(f.title, 70) + '”.', keywords: Array.from(new Set(f.findings.flatMap(words))).slice(0, 14), model: f.findings[0], explain: 'Findings on that card: ' + f.findings.slice(0, 3).map(x => clip(x, 90)).join(' · ') + ' ' + ref(f), ref: f.id });
    return Q.slice(0, 9);
  }
  function checkShort(question, text) {
    const have = new Set(words(text)), hits = (question.keywords || []).filter(k => have.has(k));
    return { ok: hits.length >= Math.min(2, Math.max(1, Math.ceil((question.keywords || []).length / 6))), hits };
  }

  /* ---------- flashcards ---------- */
  function cards(ctx, seed) {
    const C = [];
    ctx.nodes.forEach(n => {
      const back = [n.summary ? clip(n.summary, 260) : 'No summary yet.'].concat((n.findings || []).slice(0, 2).map(f => '• ' + clip(f, 120)));
      C.push({ id: 'c-' + n.id, front: n.title, back: back.join('\n'), kind: n.type, ref: n.id });
      if (n.acc != null) C.push({ id: 'cx-' + n.id, front: 'How did “' + clip(n.title, 50) + '” perform?', back: 'Accuracy ' + pct(n.acc) + (n.lat != null ? ', latency ' + Math.round(n.lat) + ' ms' : ''), kind: 'experiment', ref: n.id });
    });
    ctx.edges.slice(0, 6).forEach(e => C.push({ id: 'ce-' + e.a + '-' + e.b, front: 'How are “' + clip(ttl(ctx, e.a), 40) + '” and “' + clip(ttl(ctx, e.b), 40) + '” related?', back: e.reason || 'You linked them.', kind: 'link', ref: e.a }));
    return seed == null ? C : shuffle(C, rng(seed));
  }

  /* ---------- mind map ---------- */
  function mindmap(ctx) {
    const kids = [];
    GROUPS.forEach(([t, label]) => {
      const list = ctx.of(t);
      if (!list.length) return;
      kids.push({
        id: 'g-' + t, label: label + ' (' + list.length + ')', kind: 'group', type: t,
        children: list.map(n => ({
          id: n.id, label: clip(n.title, 38), kind: 'node', type: t, ref: n.id,
          children: ((n.findings && n.findings.length ? n.findings.slice(0, 3) : (n.summary ? [sentence(n.summary)] : []))).map((f, i) => ({ id: n.id + '#' + i, label: clip(f, 44), kind: 'finding', type: t, ref: n.id, children: [] })),
        })),
      });
    });
    return { id: 'root', label: clip(ctx.title, 36), kind: 'root', children: kids };
  }
  function nodeInfo(ctx, id) {
    const n = ctx.byId[id]; if (!n) return null;
    const links = ctx.edges.filter(e => e.a === id || e.b === id).map(e => ({ id: e.a === id ? e.b : e.a, title: ttl(ctx, e.a === id ? e.b : e.a), reason: e.reason || '' }));
    return { id, title: n.title, type: n.type, meta: n.meta || '', summary: n.summary || '', findings: n.findings || [], tags: n.tags || [], links };
  }

  /* ---------- note back on the canvas ---------- */
  function summaryText(kind, ctx, data) {
    if (kind === 'slides') return slidesMarkdown(data, ctx, false);
    if (kind === 'quiz') return '# Quiz result: ' + ctx.title + '\nScore: ' + data.score + ' of ' + data.total + '\n' + (data.missed && data.missed.length ? '\nTo review:\n' + data.missed.map(m => '- ' + m).join('\n') + '\n' : '\nNo questions missed.\n');
    if (kind === 'cards') return '# Flashcards: ' + ctx.title + '\nMastered: ' + data.mastered + ' · Needs review: ' + data.review + ' · Not rated: ' + data.left + '\n' + (data.reviewTitles && data.reviewTitles.length ? '\nNeeds review:\n' + data.reviewTitles.map(m => '- ' + m).join('\n') + '\n' : '');
    const lines = ['# Mind map: ' + ctx.title];
    mindmap(ctx).children.forEach(g => { lines.push('', '## ' + g.label); g.children.forEach(n => { lines.push('- ' + n.label); n.children.forEach(f => lines.push('  - ' + f.label)); }); });
    return lines.join('\n') + '\n';
  }

  const api = { context, slides, slidesMarkdown, quiz, checkShort, cards, mindmap, nodeInfo, summaryText, TYPE_LABEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RGStudy = api;
})(typeof self !== 'undefined' ? self : this);
