/*
 * ResearchGraph "Ask" core. Pure functions, runs in Node and in the browser.
 *
 *   answer(question, items)           -> { text, cites:[n,...], intent }   local answer from the canvas, no model
 *   buildMessages(question, items, h) -> chat messages for an LLM (server uses this when a key is set)
 *
 * `items` is a flat list of the workspace's nodes, numbered from 1 so answers can cite them as [n]:
 *   { n, id, type, title, meta, summary, findings:[], tags:[], topic, acc?, lat? }
 */
(function (root) {
  'use strict';
  const STOP = new Set('a an and the of for on in to with me my our we is are be do does did can could please tell about from that this these those into it its at by as or if then than also just what which who whom how why when where there here have has had any all some give show list find use used using i you your was were will would should about more most very'.split(' '));
  const TYPE_WORDS = { paper: /\bpapers?\b|\bpublications?\b|\barticles?\b/, dataset: /\bdata ?sets?\b|\bcorpus\b|\bcorpora\b/, code: /\bcode\b|\brepos?\b|\brepositor(y|ies)\b|\bharness\b/, note: /\bnotes?\b/, experiment: /\bexperiments?\b|\bruns?\b|\bablations?\b|\bsweeps?\b/ };
  const LABEL = { paper: 'paper', dataset: 'dataset', code: 'code repo', note: 'note', experiment: 'experiment' };
  const PLURAL = { paper: 'papers', dataset: 'datasets', code: 'code repos', note: 'notes', experiment: 'experiments' };
  const stem = w => w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
  const tokens = s => (String(s || '').toLowerCase().match(/[a-z0-9][a-z0-9.+-]*/g) || []).map(stem).filter(w => w.length > 1 && !STOP.has(w));
  const short = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const firstSentence = s => { s = String(s || '').replace(/\s+/g, ' ').trim(); const m = s.match(/^.{20,}?[.!?](\s|$)/); return short(m ? m[0].trim() : s, 190); };
  const ref = i => '[' + i.n + ']';
  const typeOf = q => Object.keys(TYPE_WORDS).find(t => TYPE_WORDS[t].test(q));

  function score(it, qt) {
    const title = new Set(tokens(it.title)), tags = new Set(tokens((it.tags || []).join(' '))), topic = new Set(tokens(it.topic)),
      body = new Set(tokens([it.summary, it.meta, (it.findings || []).join(' ')].join(' ')));
    let s = 0;
    qt.forEach(w => { if (title.has(w)) s += 3; if (tags.has(w)) s += 2.5; if (topic.has(w)) s += 1.5; if (body.has(w)) s += 1; });
    return s;
  }

  function answer(question, items) {
    const q = String(question || '').toLowerCase().trim(), list = items || [];
    if (!list.length) return { text: 'This workspace is empty, so there is nothing to look through yet. Add a paper, dataset, repo or note and ask again.', cites: [], intent: 'empty' };
    const by = t => list.filter(i => i.type === t), want = typeOf(q), cites = [];
    const bullets = arr => arr.map(i => { cites.push(i.n); return '- **' + short(i.title, 80) + '** ' + ref(i); }).join('\n');

    // 1. counts
    if (/\bhow many\b|\bnumber of\b|\bcount\b/.test(q)) {
      if (want) { const a = by(want); return { text: 'There ' + (a.length === 1 ? 'is **1** ' + LABEL[want] : 'are **' + a.length + '** ' + PLURAL[want]) + ' in this workspace.' + (a.length ? '\n' + bullets(a.slice(0, 8)) : ''), cites, intent: 'count' }; }
      const parts = Object.keys(LABEL).map(t => by(t).length + ' ' + (by(t).length === 1 ? LABEL[t] : PLURAL[t]));
      return { text: 'This workspace has **' + list.length + '** items: ' + parts.join(', ') + '.', cites: [], intent: 'count' };
    }
    // 2. best / fastest experiment
    const exps = by('experiment').filter(i => i.acc != null);
    if (exps.length && (want === 'experiment' || /\b(best|highest|top|fastest|quickest|lowest|most accurate|worst)\b/.test(q)) && /\b(best|highest|top|most accurate|fastest|quickest|lowest|worst|accuracy|latency|speed)\b/.test(q)) {
      const fast = /\b(fastest|quickest|lowest latency|latency|speed)\b/.test(q);
      const sorted = exps.slice().sort((a, b) => fast ? a.lat - b.lat : b.acc - a.acc), top = sorted[0]; cites.push(top.n);
      const rest = sorted.slice(1, 4).map(i => { cites.push(i.n); return '- ' + short(i.title, 60) + ' ' + ref(i) + ': ' + i.acc.toFixed(1) + '% accuracy, ' + i.lat.toFixed(1) + ' ms'; }).join('\n');
      return { text: (fast ? 'The fastest' : 'The most accurate') + ' simulated run is **' + short(top.title, 80) + '** ' + ref(top) + ' at **' + top.acc.toFixed(1) + '%** accuracy and **' + top.lat.toFixed(1) + ' ms** latency.' + (rest ? '\n\nNext:\n' + rest : '') + '\n\nThese numbers are simulated predictions, not measured results.', cites, intent: 'best' };
    }
    // 3. gaps / next steps
    if (/\b(missing|gap|gaps|next step|next steps|what should|recommend|suggest|improve|todo|to do)\b/.test(q)) {
      const tips = [];
      if (!by('dataset').length) tips.push('No **dataset** yet. Add one so experiments have something to run on.');
      if (!by('code').length) tips.push('No **code repo** yet. Add the repo or harness you would run.');
      if (!by('experiment').length) tips.push('No **experiment** yet. Create one from a dataset and try the what-if sliders.');
      if (by('paper').length < 3) tips.push('Only ' + by('paper').length + ' paper' + (by('paper').length === 1 ? '' : 's') + '. Ask the Literature Reviewer for related work.');
      const unlinked = list.filter(i => i.type === 'note');
      if (unlinked.length) { tips.push('Notes that may need a follow-up: ' + unlinked.slice(0, 3).map(i => { cites.push(i.n); return short(i.title, 50) + ' ' + ref(i); }).join('; ') + '.'); }
      return { text: tips.length ? 'Here is what I would do next:\n' + tips.map(t => '- ' + t).join('\n') : 'The canvas already has papers, data, code and experiments. A good next step is an ablation: change one parameter in an experiment and save the run.', cites, intent: 'gaps' };
    }
    // 4. summary / overview
    if (/\b(summar|overview|what is (this|the) (workspace|project|canvas)|tell me about (this|the) (workspace|project|canvas)|recap)/.test(q)) {
      const tagc = {}; list.forEach(i => (i.tags || []).forEach(t => { tagc[t] = (tagc[t] || 0) + 1; }));
      const top = Object.keys(tagc).sort((a, b) => tagc[b] - tagc[a]).slice(0, 4);
      const key = by('paper').slice(0, 3);
      return { text: 'This workspace holds **' + list.length + '** items: ' + Object.keys(LABEL).filter(t => by(t).length).map(t => by(t).length + ' ' + (by(t).length === 1 ? LABEL[t] : PLURAL[t])).join(', ') + '.' + (top.length ? '\nMain themes: ' + top.map(t => '#' + t).join(', ') + '.' : '') + (key.length ? '\n\nKey papers:\n' + bullets(key) : ''), cites, intent: 'summary' };
    }
    // 5. list a type
    const extra = tokens(q).filter(w => !Object.values(TYPE_WORDS).some(r => r.test(w)) && !/^(exist|available|current|workspace|canvas|one|say|name|give|list|show)$/.test(w));
    if (want && /\b(list|show|which|what|all|name|give)\b/.test(q) && (!extra.length || /^\s*(list|show|name|give me|all)\b/.test(q))) {
      const a = by(want);
      return { text: a.length ? 'The **' + a.length + '** ' + (a.length === 1 ? LABEL[want] : PLURAL[want]) + ':\n' + bullets(a.slice(0, 10)) + (a.length > 10 ? '\n…and ' + (a.length - 10) + ' more.' : '') : 'There are no ' + PLURAL[want] + ' in this workspace yet.', cites, intent: 'list' };
    }
    // 6. relevance search
    const qt = tokens(q).filter(w => !Object.values(TYPE_WORDS).some(r => r.test(w)) || list.some(i => tokens(i.title).includes(w)));
    const ranked = list.map(i => ({ i, s: score(i, qt.length ? qt : tokens(q)) + (want && i.type === want ? 0.5 : 0) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 3);
    if (ranked.length) {
      const lines = ranked.map(({ i }) => { cites.push(i.n); return '- **' + short(i.title, 80) + '** ' + ref(i) + ' (' + LABEL[i.type] + '): ' + (firstSentence(i.summary) || short(i.meta, 120)) + ((i.findings || [])[0] ? '\n  Key finding: ' + short(i.findings[0], 150) : ''); });
      return { text: (ranked.length === 1 ? 'The closest item on this canvas:' : 'The closest items on this canvas:') + '\n' + lines.join('\n'), cites, intent: 'search' };
    }
    return { text: 'I could not find anything about that on this canvas. I can search titles, tags, summaries and findings. Try a topic word from your sources, or ask “summarize this workspace”.', cites: [], intent: 'none' };
  }

  function buildMessages(question, items, history) {
    const ctx = (items || []).slice(0, 60).map(i => '[' + i.n + '] ' + i.type.toUpperCase() + ': ' + short(i.title, 120) + (i.meta ? ' (' + short(i.meta, 80) + ')' : '') +
      (i.tags && i.tags.length ? ' tags: ' + i.tags.slice(0, 6).join(', ') : '') + (i.summary ? '\n    ' + short(i.summary, 360) : '') +
      ((i.findings || []).length ? '\n    findings: ' + i.findings.slice(0, 3).map(f => short(f, 140)).join(' | ') : '') + (i.acc != null ? '\n    simulated accuracy ' + i.acc + '%, latency ' + i.lat + ' ms' : '')).join('\n');
    const system = 'You are the research assistant inside ResearchGraph. Answer using only the workspace items below. Cite the items you use as [n]. If the items do not contain the answer, say so plainly and suggest what to add. Experiment numbers are simulated predictions; say so when you quote them. Be concise: a few sentences or a short list. Use **bold** for item names.\n\nWORKSPACE ITEMS\n' + ctx;
    const msgs = [{ role: 'system', content: system }];
    (history || []).slice(-6).forEach(h => { if (h && (h.role === 'user' || h.role === 'assistant') && h.text) msgs.push({ role: h.role, content: short(h.text, 1200) }); });
    msgs.push({ role: 'user', content: short(question, 600) });
    return msgs;
  }

  const api = { answer, buildMessages, tokens };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RGAsk = api;
})(typeof self !== 'undefined' ? self : this);
