/*
 * ResearchGraph ingestion core.
 * Pure functions, no dependencies. Runs in Node (server.js) and in the browser
 * (offline fallback), so both paths return the identical JSON contract.
 */
(function (root) {
  'use strict';

  const NODE_W = 248, NODE_H = 260;   // tall enough for experiment cards and AI notes, so new nodes do not land on them

  const STOP = new Set(('a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its just may me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up us use used using very was we were what when where which while who whom why will with would you your et al fig figure table section paper results result based new via one two however thus also can show shows shown propose proposed present approach method methods').split(/\s+/));

  /* Topic lexicon: display tag -> trigger stems. Gives readable tags like #transformer, #nlp. */
  const LEXICON = {
    transformer: ['transformer', 'self-attention', 'attention mechanism', 'bert', 'gpt'],
    nlp: ['language model', 'natural language', 'nlp', 'text generation', 'translation', 'question answering', 'summarization', 'tokeniz'],
    retrieval: ['retrieval', 'retriever', 'passage', 'dense retrieval', 'reranker', 'bm25', 'index'],
    rag: ['retrieval-augmented', 'retrieval augmented', 'rag '],
    'deep-learning': ['neural network', 'deep learning', 'backpropagation', 'gradient descent', 'convolutional'],
    'computer-vision': ['image', 'vision', 'object detection', 'segmentation', 'pixel'],
    diffusion: ['diffusion', 'denoising', 'score-based'],
    'reinforcement-learning': ['reinforcement learning', 'reward', 'policy gradient', 'q-learning'],
    benchmark: ['benchmark', 'leaderboard', 'state-of-the-art', 'state of the art'],
    dataset: ['dataset', 'corpus', 'annotated', 'annotation'],
    genomics: ['genome', 'genomic', 'rna', 'gene expression', 'sequencing'],
    'protein-structure': ['protein', 'folding', 'residue', 'alphafold', 'structure prediction'],
    climate: ['climate', 'precipitation', 'atmospheric', 'temperature projection', 'downscaling'],
    evaluation: ['evaluation', 'ablation', 'metric', 'f1', 'exact match', 'bleu', 'rouge'],
    optimization: ['optimization', 'convex', 'stochastic', 'convergence', 'regret'],
    graph: ['graph neural', 'knowledge graph', 'node classification', 'message passing'],
    'few-shot': ['few-shot', 'in-context learning', 'zero-shot', 'prompting'],
    efficiency: ['efficient', 'latency', 'throughput', 'quantization', 'distillation', 'pruning']
  };

  const TYPES = ['paper', 'dataset', 'code', 'note'];
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
  let uid = 0;
  const newId = () => 'in_' + Date.now().toString(36) + '_' + (++uid).toString(36);

  /* ---------- Parsing: text, HTML, PDF ---------- */

  const NAME_RE = /^[A-Z][\p{L}'.-]+(?:\s+[A-Z][\p{L}'.-]*\.?){1,3}$/u;
  function looksLikeAuthors(line) {
    const l = clean(line).replace(/[*†‡§¶0-9]+/g, '').replace(/^by\s+/i, '');
    if (!l || l.length > 220 || /[.!?]$/.test(l) && l.split(/\s+/).length > 12) return null;
    const parts = l.split(/\s*(?:,|;|\band\b|&)\s*/).map(s => s.trim()).filter(Boolean);
    if (!parts.length || parts.length > 12) return null;
    return parts.every(p => NAME_RE.test(p)) ? parts : null;
  }

  function findYear(s) { return (String(s).match(/\b(19[89]\d|20[0-3]\d)\b/) || [])[1] || ''; }

  function parseText(raw, hint) {
    const text = String(raw || '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
    const lines = text.split('\n').map(l => l.trim());
    const nonEmpty = lines.filter(Boolean);
    let title = '', authors = [], titleIdx = -1;

    // Explicit metadata wins (front-matter style).
    const mT = text.match(/^\s*title\s*[:=]\s*(.+)$/im), mA = text.match(/^\s*authors?\s*[:=]\s*(.+)$/im);
    if (mT) title = clean(mT[1]);
    if (mA) authors = mA[1].split(/\s*(?:,|;|\band\b)\s*/).map(clean).filter(Boolean);

    if (!title) {
      for (let i = 0; i < Math.min(nonEmpty.length, 8); i++) {
        const l = nonEmpty[i].replace(/^#+\s*/, '').replace(/^["“]|["”]$/g, '');
        if (l.length >= 6 && l.length <= 200 && !/^(abstract|arxiv|preprint|http)/i.test(l)) { title = clean(l); titleIdx = i; break; }
      }
    } else titleIdx = nonEmpty.findIndex(l => clean(l).toLowerCase().includes(title.toLowerCase()));

    if (!authors.length) {
      for (let i = Math.max(titleIdx + 1, 0); i < Math.min(nonEmpty.length, titleIdx + 5); i++) {
        const a = looksLikeAuthors(nonEmpty[i]); if (a) { authors = a; break; }
      }
    }
    const kind = hint && hint.kind;
    if (!title) title = hint && hint.fallbackTitle ? hint.fallbackTitle : 'Untitled source';
    // A short free-form note: the note itself is the title.
    if (kind === 'text' && nonEmpty.length === 1 && nonEmpty[0].length <= 200) title = clip(nonEmpty[0], 160);
    return { title: clip(title, 200), authors: authors.slice(0, 8), text: text.trim(), year: findYear(nonEmpty.slice(0, 4).join(' ') + ' ' + (text.match(/(?:©|copyright|published|submitted)[^\n]{0,40}/i) || [''])[0]) };
  }

  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
  const decode = s => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const c = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return c ? String.fromCodePoint(c) : m; }
    return ENT[e.toLowerCase()] || m;
  });
  function metaContent(html, names) {
    const out = [];
    const re = /<meta\s+[^>]*>/gi; let m;
    while ((m = re.exec(html))) {
      const tag = m[0], nm = (tag.match(/(?:name|property)\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (nm && names.includes(nm.toLowerCase())) { const c = (tag.match(/content\s*=\s*["']([^"']*)["']/i) || [])[1]; if (c) out.push(decode(c)); }
    }
    return out;
  }
  function parseHtml(html, url) {
    const titleMeta = metaContent(html, ['citation_title', 'og:title', 'twitter:title', 'dc.title'])[0];
    const titleTag = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const authors = metaContent(html, ['citation_author', 'dc.creator', 'author', 'article:author']);
    const body = (html.match(/<body[\s\S]*<\/body>/i) || [html])[0]
      .replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|h[1-6]|li|tr|section|article|br)>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ');
    const text = decode(body).replace(/[ \t\f\v]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
    const abs = metaContent(html, ['citation_abstract', 'description', 'og:description', 'dc.description'])[0];
    let host = ''; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { /* ignore */ }
    return {
      title: clip(clean(titleMeta || titleTag || host || 'Web page'), 200),
      authors: [...new Set(authors.map(clean))].slice(0, 8),
      text: (abs && !text.includes(abs.slice(0, 40)) ? abs + '\n\n' : '') + text,
      host, year: (html.match(/(?:citation_(?:publication_)?date|article:published_time|dc\.date)["'][^>]*content=["'](\d{4})/i) || [])[1] || ''
    };
  }

  /* Minimal PDF text extraction (no deps). Servers should prefer pdftotext; this is the fallback and the browser path. */
  function pdfUnescape(s) {
    return s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (m, c) => {
      if (/^[0-7]+$/.test(c)) return String.fromCharCode(parseInt(c, 8));
      return { n: '\n', r: '', t: ' ', b: '', f: '' }[c] ?? c;
    });
  }
  function latin1(bytes, a, b) { let s = ''; for (let i = a; i < b; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(b, i + 8192))); return s; }
  function ascii85(str) {
    str = str.replace(/\s+/g, '').replace(/^<~/, ''); const end = str.indexOf('~>'); if (end >= 0) str = str.slice(0, end);
    const out = []; let grp = [];
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === 'z' && !grp.length) { out.push(0, 0, 0, 0); continue; }
      grp.push(str.charCodeAt(i) - 33);
      if (grp.length === 5) { let v = 0; grp.forEach(d => { v = v * 85 + d; }); out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); grp = []; }
    }
    if (grp.length > 1) { const n = grp.length; while (grp.length < 5) grp.push(84); let v = 0; grp.forEach(d => { v = v * 85 + d; }); const b = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; out.push.apply(out, b.slice(0, n - 1)); }
    return new Uint8Array(out);
  }
  async function extractPdf(bytes, inflate) {
    const whole = latin1(bytes, 0, bytes.length);
    const info = {};
    const mt = whole.match(/\/Title\s*\(((?:\\.|[^\\)])*)\)/), ma = whole.match(/\/Author\s*\(((?:\\.|[^\\)])*)\)/);
    if (mt) info.title = pdfUnescape(mt[1]); if (ma) info.author = pdfUnescape(ma[1]);
    const chunks = [];
    const re = /stream\r?\n/g; let m;
    while ((m = re.exec(whole))) {
      const start = m.index + m[0].length, end = whole.indexOf('endstream', start); if (end < 0) break;
      const dict = whole.slice(Math.max(0, m.index - 300), m.index), flate = /FlateDecode/.test(dict.slice(dict.lastIndexOf('obj')));
      let data;
      const objDict = dict.slice(dict.lastIndexOf('obj'));
      try {
        data = bytes.subarray(start, end);
        if (/ASCII85Decode/.test(objDict)) data = ascii85(latin1(data, 0, data.length));
        if (flate) data = await inflate(data);
      } catch (e) { re.lastIndex = end; continue; }
      const s = latin1(data, 0, data.length);
      if (!/\bBT\b/.test(s)) { re.lastIndex = end; continue; }
      let out = '';
      const tre = /\[((?:\\.|[^\]\\])*)\]\s*TJ|\(((?:\\.|[^\\)])*)\)\s*(?:Tj|'|")|(T\*|\bTd\b|\bTD\b|\bET\b)/g; let t;
      while ((t = tre.exec(s))) {
        if (t[1] !== undefined) { out += t[1].replace(/\(((?:\\.|[^\\)])*)\)|(-?\d+\.?\d*)/g, (x, str, num) => str !== undefined ? pdfUnescape(str) : (parseFloat(num) < -200 ? ' ' : '')); }
        else if (t[2] !== undefined) out += pdfUnescape(t[2]);
        else out += '\n';
      }
      chunks.push(out); re.lastIndex = end;
    }
    return { text: chunks.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(), info };
  }

  /* ---------- Mock AI: summary, findings, tags ---------- */

  const tokenize = s => (s.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []).filter(w => !STOP.has(w));
  function sentences(text) {
    const flat = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ');
    // Split only where a terminator is followed by a capital, so "28.4 BLEU", "et al." and "e.g." stay intact.
    const parts = [];
    flat.split(/(?<=[a-z0-9)\]"”][.!?])\s+(?=[A-Z“"(\[])/).forEach(p => {
      if (parts.length && /\b(et al|e\.g|i\.e|vs|Fig|Eq|Dr|No)\.$/.test(parts[parts.length - 1])) parts[parts.length - 1] += ' ' + p; else parts.push(p);
    });
    return parts.map(clean).filter(s => s.length >= 40 && s.length <= 400 && /[a-z]/i.test(s) && !/^\W*(fig|table)\b/i.test(s));
  }
  function mockAnalyze(text, title) {
    const body = text.slice(0, 40000);
    const abs = body.match(/\babstract\b[:.\s-]*([\s\S]{200,2500}?)(?:\n\s*\n|\b1\.?\s+introduction\b|$)/i);
    const sents = sentences(abs ? abs[1] : body).slice(0, 80);
    const tf = {}; tokenize(title + ' ' + title + ' ' + body).forEach(w => { tf[w] = (tf[w] || 0) + 1; });
    const score = (s, i) => {
      const ws = tokenize(s); if (!ws.length) return 0;
      let v = ws.reduce((a, w) => a + Math.log(1 + (tf[w] || 0)), 0) / Math.sqrt(ws.length);
      if (i < 4) v *= 1.25;
      if (/\b(we|this (paper|work|study))\b.*\b(propose|present|introduce|show|find|study|develop)/i.test(s)) v *= 1.4;
      return v;
    };
    const ranked = sents.map((s, i) => ({ s, i, v: score(s, i) })).sort((a, b) => b.v - a.v);
    const top = ranked.slice(0, 3).sort((a, b) => a.i - b.i).map(x => x.s);
    let summary = top.join(' ');
    if (!summary) summary = clip(clean(body), 400);
    const cue = /\b(outperform|improv|achiev|reduc|increase|state-of-the-art|demonstrat|find that|show that|shows that|results? (?:show|indicate)|significant|accuracy|error|faster|gain)\w*/i;
    const topSet = new Set(top);
    let findings = ranked.filter(x => cue.test(x.s) && !topSet.has(x.s)).slice(0, 3).sort((a, b) => a.i - b.i).map(x => clip(x.s, 220));
    if (findings.length < 2) findings = findings.concat(ranked.filter(x => !topSet.has(x.s) && !findings.includes(clip(x.s, 220))).slice(0, 3 - findings.length).map(x => clip(x.s, 220)));
    return { summary: clip(summary, 700), findings, tags: extractTags(title + ' ' + title + ' ' + body, tf) };
  }
  function extractTags(blob, tf) {
    const low = ' ' + blob.toLowerCase() + ' ', scored = [];
    Object.keys(LEXICON).forEach(tag => {
      let hits = 0; LEXICON[tag].forEach(k => { let i = -1; while ((i = low.indexOf(k, i + 1)) >= 0 && hits < 20) hits++; });
      if (hits) scored.push([tag, hits + (low.slice(0, 300).includes(tag.replace('-', ' ')) ? 3 : 0)]);
    });
    scored.sort((a, b) => b[1] - a[1]);
    const tags = scored.slice(0, 4).map(x => x[0]);
    if (tags.length < 3 && tf) {
      Object.keys(tf).filter(w => tf[w] >= 3 && w.length > 4).sort((a, b) => tf[b] - tf[a]).forEach(w => { if (tags.length < 4 && !tags.includes(w)) tags.push(w); });
    }
    return tags;
  }

  /* LLM contract shared by the server adapters. */
  function buildPrompt(title, text) {
    return {
      system: 'You are a research assistant. Reply with JSON only: {"summary": string of exactly 3 concise sentences, "findings": array of 2-4 short strings, "tags": array of 3-5 lowercase topic tags (use hyphens, no # sign)}.',
      user: 'Title: ' + title + '\n\nText:\n' + text.slice(0, 12000)
    };
  }
  function normalizeAi(obj, fallback) {
    const a = obj && typeof obj === 'object' ? obj : {};
    const tags = (Array.isArray(a.tags) ? a.tags : []).map(t => clean(t).replace(/^#/, '').toLowerCase().replace(/\s+/g, '-')).filter(Boolean);
    const findings = (Array.isArray(a.findings) ? a.findings : []).map(clean).filter(Boolean);
    const summary = clean(a.summary);
    return {
      summary: summary || fallback.summary,
      findings: findings.length ? findings.slice(0, 4) : fallback.findings,
      tags: (tags.length ? tags : fallback.tags).slice(0, 5)
    };
  }

  /* ---------- Semantic linking ---------- */

  function nodeTokens(n) { return tokenize([n.title, n.authors && n.authors.join(' '), (n.tags || []).join(' ') + ' ' + (n.tags || []).join(' '), n.topic, n.summary, n.meta].filter(Boolean).join(' ')); }
  function link(incoming, existing, opts) {
    opts = opts || {};
    const k = opts.k || 3, minScore = opts.min == null ? 0.1 : opts.min;
    const docs = existing.filter(n => n && n.id).map(n => ({ n, t: nodeTokens(n) }));
    const inTok = nodeTokens(incoming), all = docs.map(d => d.t).concat([inTok]), df = {};
    all.forEach(t => new Set(t).forEach(w => { df[w] = (df[w] || 0) + 1; }));
    const N = all.length, vec = t => { const v = {}; t.forEach(w => { v[w] = (v[w] || 0) + 1; }); let nrm = 0; for (const w in v) { v[w] *= Math.log(1 + N / df[w]); nrm += v[w] * v[w]; } return { v, nrm: Math.sqrt(nrm) || 1 }; };
    const a = vec(inTok);
    const res = docs.map(d => {
      const b = vec(d.t); let dot = 0; for (const w in a.v) if (b.v[w]) dot += a.v[w] * b.v[w];
      const cos = dot / (a.nrm * b.nrm);
      const shared = (d.n.tags || []).filter(t => (incoming.tags || []).includes(t));
      const score = Math.min(1, cos + 0.12 * shared.length + (d.n.topic && incoming.topic && d.n.topic === incoming.topic ? 0.05 : 0));
      return { target: d.n.id, score: Math.round(score * 100) / 100, shared, reason: shared.length ? 'Shared tags: ' + shared.map(t => '#' + t).join(', ') : 'Similar wording in title and summary' };
    }).filter(r => r.score >= minScore).sort((x, y) => y.score - x.score).slice(0, k);
    return res;
  }
  function pickTopic(links, existing) {
    const by = {}; links.forEach(l => { const n = existing.find(e => e.id === l.target); if (n && n.topic) by[n.topic] = (by[n.topic] || 0) + l.score; });
    return Object.keys(by).sort((a, b) => by[b] - by[a])[0] || '';
  }

  /* ---------- Auto-placement ---------- */

  const hit = (a, b, pad) => a.x < b.x + NODE_W + pad && a.x + NODE_W + pad > b.x && a.y < b.y + NODE_H + pad && a.y + NODE_H + pad > b.y;
  function place(links, existing, hint) {
    const byId = new Map(existing.map(n => [n.id, n]));
    const anchors = links.map(l => byId.get(l.target)).filter(Boolean).filter(n => typeof n.x === 'number');
    const free = p => !existing.some(n => typeof n.x === 'number' && hit(p, n, 28));
    let cx, cy;
    if (anchors.length) {
      const wsum = links.reduce((s, l) => s + (byId.get(l.target) ? l.score + 0.05 : 0), 0) || 1;
      cx = anchors.reduce((s, n, i) => s + n.x * (links[i].score + 0.05), 0) / wsum;
      cy = anchors.reduce((s, n, i) => s + n.y * (links[i].score + 0.05), 0) / wsum;
    } else if (hint && typeof hint.x === 'number') { cx = hint.x - NODE_W / 2; cy = hint.y - 60; }
    else if (existing.length) {
      const xs = existing.map(n => n.x || 0), ys = existing.map(n => n.y || 0);
      cx = Math.max.apply(null, xs) + NODE_W + 110; cy = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
    } else { cx = 0; cy = 0; }
    // Search outward on a ring grid for the nearest free slot, preferring the side facing open space.
    const step = 44, cands = [];
    for (let r = 0; r <= 14; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      cands.push({ x: cx + dx * step * 1.5, y: cy + dy * step * 1.1, d: Math.hypot(dx * 1.5, dy * 1.1) });
    }
    cands.sort((a, b) => a.d - b.d);
    const pick = cands.find(p => free(p)) || cands[0];
    return { x: Math.round(pick.x), y: Math.round(pick.y) };
  }

  /* ---------- Orchestration ---------- */

  function assemble(parsed, ai, ctx) {
    const existing = ctx.existing || [];
    const type = TYPES.includes(ctx.type) ? ctx.type : (ctx.kind === 'text' ? 'note' : 'paper');
    const draft = { title: parsed.title, authors: parsed.authors, tags: ai.tags, summary: ai.summary, topic: '' };
    const links = link(draft, existing, { k: 3 });
    draft.topic = pickTopic(links, existing) || 'Uncategorized';
    const pos = place(links, existing, ctx.viewCenter);
    const metaBits = [parsed.authors.length ? (parsed.authors.length > 2 ? parsed.authors[0] + ' et al.' : parsed.authors.join(' & ')) : '', parsed.year, ctx.sourceLabel].filter(Boolean);
    const id = newId();
    return {
      ok: true,
      source: { kind: ctx.kind, name: ctx.sourceLabel || '', chars: parsed.text.length },
      ai: { provider: ctx.provider || 'mock', model: ctx.model || 'heuristic-v1', fallback: ctx.fallback || null },
      node: {
        id, type, title: parsed.title, authors: parsed.authors, year: parsed.year || '', meta: metaBits.join(' · ') || 'Added just now',
        summary: ai.summary, findings: ai.findings, tags: ai.tags, topic: draft.topic,
        preview: clip(clean(parsed.text), 600), x: pos.x, y: pos.y
      },
      edges: links.map(l => ({ id: 'edge_' + id + '_' + l.target, source: id, target: l.target, score: l.score, reason: l.reason })),
      cluster: { topic: draft.topic, size: links.length + 1 }
    };
  }

  const api = { parseText, parseHtml, extractPdf, mockAnalyze, buildPrompt, normalizeAi, link, place, assemble, extractTags, NODE_W, NODE_H, clip, clean };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RGCore = api;
})(typeof self !== 'undefined' ? self : this);
