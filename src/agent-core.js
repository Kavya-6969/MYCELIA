/*
 * ResearchGraph multi-agent engine.
 *
 *   Controller ──routes goals──▶ Literature Reviewer | Environment Setup | Experiment Simulator
 *
 * Every action that runs something or adds a node goes through the approval gate:
 * the agent pauses, a proposal is emitted, and work resumes only after decide().
 * Scores reward approved work and penalise rejections and failures; a score at or
 * below RETIRE_AT retires a specialist until it is reinstated.
 *
 * Pure logic, no I/O. Runs in Node (server.js streams its events over SSE) and in the
 * browser (same engine, used when no server is reachable). Specialists are simulated:
 * "execute" actions never touch the host machine.
 */
(function (root) {
  'use strict';
  const NODE = typeof require === 'function' && typeof module !== 'undefined';
  const Core = NODE ? require('./ingest-core.js') : root.RGCore;
  const Sim = NODE ? require('./experiment-core.js') : root.RGExperiment;

  const START_SCORE = 50, RETIRE_AT = 20, REINSTATE_TO = 35;
  const REWARD = { spawnApproved: 10, executeApproved: 4, taskSuccess: 2, spawnRejected: -8, executeRejected: -5, taskFailed: -12, goalDone: 2, goalFailed: -4 };

  const AGENTS = {
    controller: { id: 'controller', name: 'Controller', role: 'Routes goals to specialists' },
    literature: { id: 'literature', name: 'Literature Reviewer', role: 'Finds and links papers' },
    setup: { id: 'setup', name: 'Environment Setup', role: 'Prepares code and environments' },
    experiment: { id: 'experiment', name: 'Experiment Simulator', role: 'Designs and runs experiments' },
    writer: { id: 'writer', name: 'Writer', role: 'Writes answers as canvas notes' }
  };
  const SPECIALISTS = ['literature', 'setup', 'experiment'];

  /* Real papers the Literature Reviewer can suggest. Tags drive matching. */
  const CATALOG = [
    { title: 'REALM: Retrieval-Augmented Language Model Pre-Training', lead: 'Guu', year: 2020, venue: 'ICML', tags: ['rag', 'retrieval', 'nlp'], summary: 'Pre-trains a language model together with a learned retriever so that it can look up Wikipedia passages while predicting masked text.' },
    { title: 'Improving Language Models by Retrieving from Trillions of Tokens', lead: 'Borgeaud', year: 2022, venue: 'ICML', tags: ['rag', 'retrieval', 'language-model'], summary: 'Conditions a transformer on chunks retrieved from a two-trillion-token database, matching much larger models with far fewer parameters.' },
    { title: 'Leveraging Passage Retrieval with Generative Models for Open Domain Question Answering', lead: 'Izacard', year: 2021, venue: 'EACL', tags: ['rag', 'qa', 'retrieval'], summary: 'Fusion-in-Decoder encodes each retrieved passage separately and fuses them in the decoder, improving open-domain QA as more passages are used.' },
    { title: 'Precise Zero-Shot Dense Retrieval without Relevance Labels', lead: 'Gao', year: 2022, venue: 'ACL 2023', tags: ['retrieval', 'dense', 'few-shot'], summary: 'HyDE has a language model write a hypothetical answer document and retrieves real documents similar to it, with no labelled training data.' },
    { title: 'Lost in the Middle: How Language Models Use Long Contexts', lead: 'Liu', year: 2023, venue: 'TACL', tags: ['rag', 'evaluation', 'language-model'], summary: 'Shows that models use information at the start and end of a long context best and degrade when the relevant passage sits in the middle.' },
    { title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding', lead: 'Devlin', year: 2019, venue: 'NAACL', tags: ['transformer', 'nlp', 'language-model'], summary: 'Pre-trains a bidirectional transformer with masked language modelling and fine-tunes it to set new results on eleven NLP tasks.' },
    { title: 'Attention Is All You Need', lead: 'Vaswani', year: 2017, venue: 'NeurIPS', tags: ['transformer', 'nlp', 'deep-learning'], summary: 'Introduces the Transformer, an architecture based only on attention that trains faster than recurrent models and sets new translation results.' },
    { title: 'Language Models are Few-Shot Learners', lead: 'Brown', year: 2020, venue: 'NeurIPS', tags: ['few-shot', 'language-model', 'nlp', 'transformer'], summary: 'Scales an autoregressive transformer to 175 billion parameters and shows it can perform new tasks from a few examples in the prompt.' },
    { title: 'Training Language Models to Follow Instructions with Human Feedback', lead: 'Ouyang', year: 2022, venue: 'NeurIPS', tags: ['language-model', 'reinforcement-learning', 'nlp'], summary: 'Fine-tunes GPT-3 with human preference data and reinforcement learning, producing outputs people prefer over a much larger base model.' },
    { title: 'FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness', lead: 'Dao', year: 2022, venue: 'NeurIPS', tags: ['efficiency', 'transformer', 'deep-learning'], summary: 'Computes exact attention with tiling to cut reads and writes to GPU memory, giving faster training and longer contexts.' },
    { title: 'Denoising Diffusion Probabilistic Models', lead: 'Ho', year: 2020, venue: 'NeurIPS', tags: ['diffusion', 'computer-vision', 'deep-learning'], summary: 'Trains a model to reverse a gradual noising process and reaches high-quality image synthesis.' },
    { title: 'High-Resolution Image Synthesis with Latent Diffusion Models', lead: 'Rombach', year: 2022, venue: 'CVPR', tags: ['diffusion', 'computer-vision', 'efficiency'], summary: 'Runs diffusion in the latent space of a pretrained autoencoder, which cuts compute while keeping image quality.' },
    { title: 'An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale', lead: 'Dosovitskiy', year: 2021, venue: 'ICLR', tags: ['transformer', 'computer-vision', 'deep-learning'], summary: 'Applies a standard transformer to sequences of image patches and matches convolutional networks when pre-trained on large datasets.' },
    { title: 'Deep Residual Learning for Image Recognition', lead: 'He', year: 2016, venue: 'CVPR', tags: ['computer-vision', 'deep-learning', 'benchmark'], summary: 'Adds skip connections so that very deep networks can be trained, winning ImageNet 2015.' },
    { title: 'Accurate Prediction of Protein Structures and Interactions Using a Three-Track Neural Network', lead: 'Baek', year: 2021, venue: 'Science', tags: ['protein-structure', 'deep-learning'], summary: 'RoseTTAFold passes information between sequence, distance and 3D coordinate tracks to predict protein structures with accuracy close to AlphaFold2.' },
    { title: 'Robust Deep Learning-Based Protein Sequence Design Using ProteinMPNN', lead: 'Dauparas', year: 2022, venue: 'Science', tags: ['protein-structure', 'deep-learning', 'graph'], summary: 'A message-passing network that designs amino-acid sequences for a given backbone and recovers native sequences more often than Rosetta.' },
    { title: 'GraphCast: Learning Skillful Medium-Range Global Weather Forecasting', lead: 'Lam', year: 2023, venue: 'Science', tags: ['climate', 'graph', 'deep-learning'], summary: 'A graph neural network trained on ERA5 that produces ten-day global forecasts in under a minute and beats the leading operational system on most targets.' },
    { title: 'FourCastNet: A Global Data-driven High-resolution Weather Model Using Adaptive Fourier Neural Operators', lead: 'Pathak', year: 2022, venue: 'arXiv', tags: ['climate', 'deep-learning', 'efficiency'], summary: 'Uses Fourier neural operators to forecast global weather at 0.25 degree resolution thousands of times faster than numerical models.' },
    { title: 'Semi-Supervised Classification with Graph Convolutional Networks', lead: 'Kipf', year: 2017, venue: 'ICLR', tags: ['graph', 'deep-learning', 'benchmark'], summary: 'Defines a scalable graph convolution that propagates features along edges and classifies nodes with few labels.' },
    { title: 'Graph Attention Networks', lead: 'Velickovic', year: 2018, venue: 'ICLR', tags: ['graph', 'transformer', 'deep-learning'], summary: 'Lets each node weight its neighbours with learned attention, removing the need for a fixed graph structure.' },
    { title: 'Proximal Policy Optimization Algorithms', lead: 'Schulman', year: 2017, venue: 'arXiv', tags: ['reinforcement-learning', 'optimization'], summary: 'A clipped-objective policy gradient method that is simpler than trust-region methods and performs comparably.' },
    { title: 'Human-level Control through Deep Reinforcement Learning', lead: 'Mnih', year: 2015, venue: 'Nature', tags: ['reinforcement-learning', 'deep-learning', 'benchmark'], summary: 'Trains a deep Q-network from pixels and reaches human-level play across a suite of Atari games.' }
  ];

  const KEYS = {
    literature: ['paper', 'papers', 'literature', 'survey', 'review', 'related work', 'find', 'search', 'cite', 'citation', 'state of the art', 'sota', 'background', 'summarize', 'summarise', 'read', 'recommend', 'discover'],
    setup: ['setup', 'set up', 'environment', 'install', 'dependencies', 'requirements', 'docker', 'venv', 'conda', 'reproduce', 'repo', 'build', 'configure', 'pip', 'gpu', 'bootstrap'],
    experiment: ['experiment', 'simulate', 'simulation', 'ablation', 'run', 'benchmark', 'hyperparameter', 'sweep', 'evaluate', 'evaluation', 'compare', 'test', 'metric', 'train', 'measure']
  };
  const STOP = new Set('a an and the of for on in to with me my our us we is are be do does can could please give some any all about from that this these those into onto over under it its at by as or if then than also just new more most very paper papers find review related work run set up setup'.split(' '));
  const words = s => (String(s).toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []);
  const keywords = goal => words(goal).filter(w => !STOP.has(w));
  const stem = w => w.replace(/(ing|ed|es|s)$/, '');
  const termsOf = n => new Set(words([n.title, (n.tags || []).join(' '), n.topic, n.meta].join(' ')).map(stem));
  const overlap = (kw, set) => kw.filter(w => set.has(stem(w))).length;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round2 = v => Math.round(v * 100) / 100;
  const shortTitle = t => (t.length > 56 ? t.slice(0, 55).trimEnd() + '…' : t);
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  class TaskFail extends Error {}
  class Retired extends TaskFail {}
  class NoWork extends Error {}   // nothing to do is not a failure, so it costs no score


  /* An explicit writing request ("list", "write", "recommend"...) goes to the Writer unless it clearly names specialist work. */
  const WRITE_RE = /\b(list|write|draft|summari[sz]e|summary|explain|describe|brainstorm|outline|ideas?|suggest|recommend|top \d+|give me|tell me|name \d+|generate|make me|create a (list|note|summary))\b/i;
  const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  const COUNT_RE = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:separate\s+|short\s+|different\s+)?notes?\b/i;
  const NOTE_RE = /\b(?:create|add|make|write|generate|give me|pin|put)\b[^.]*\bnotes?\b|\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+notes?\b/i;
  function noteCount(goal) { const m = String(goal || '').match(COUNT_RE); if (!m) return 1; const n = /^\d/.test(m[1]) ? +m[1] : NUMW[m[1].toLowerCase()]; return Math.max(1, Math.min(12, n || 1)); }
  function noteTopic(goal) { return String(goal || '').replace(/^\s*(?:please\s+)?(?:i\s+(?:want|need)\s+(?:you\s+)?to\s+)?(?:create|add|make|write|generate|give me|pin|put)\s+(?:me\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a|some)?\s*(?:separate\s+|short\s+|different\s+)?notes?\s*(?:of|on|about|for|regarding)?\s*/i, '').replace(/\s+/g, ' ').trim() || String(goal || '').trim(); }
  const SPECIALIST_RE = /\b(papers?|literature|survey|related work|citations?|set ?up|environment|dependencies|docker|repo|experiments?|ablations?|hyperparameters?|sweeps?|simulat\w*)\b/i;

  /* Writer agent helpers. The host (browser or server) supplies opts.writer, which calls an AI model. */
  function writerPrompt(goal, graph, count) {
    count = count || 1;
    const ctx = (graph || []).slice(0, 12).map(n => '- ' + String(n.title || '').slice(0, 80)).join('\n');
    return 'You are the Writer agent inside MYCELIA, a research canvas. The user gave this goal:\n"' + goal + '"\n\n' +
      (count > 1
        ? 'Write exactly ' + count + ' separate notes that will each be pinned on their canvas as its own card. Each note covers one distinct item or angle of the goal.\n' +
          'Reply with JSON only, no code fences: {"notes": [{"title": string, "body": string, "tags": string[]}]} with exactly ' + count + ' entries.\n' +
          '- body: 2 to 4 plain sentences of concrete facts, no markdown symbols, each note under 400 characters.\n'
        : 'Write exactly what they asked for, as a note that will be pinned on their canvas.\n' +
          'Reply with JSON only, no code fences: {"title": string, "body": string, "tags": string[]}\n') +
      '- title: at most 70 characters.\n' +
      '- body: plain text only, no markdown symbols. If they asked for a list, put one item per line, numbered like "1. Name: short reason". At most 15 lines, each under 120 characters.\n' +
      '- tags: 1 to 3 short lowercase words.\n' +
      'If the goal is unclear, still return JSON with a short title and a body that says what is missing.' +
      (ctx ? '\n\nThe canvas already holds these items (use them only if they are relevant):\n' + ctx : '');
  }
  function parseWriter(v) {
    if (typeof v === 'string') {
      const m = v.match(/\{[\s\S]*\}/), raw = v;
      try { v = JSON.parse(m ? m[0] : raw); }
      catch (e) {   // not valid JSON (for example a raw line break inside a string): pull the fields out by hand
        const grab = k => { const r = raw.match(new RegExp('"' + k + '"\\s*:\\s*"([\\s\\S]*?)"\\s*(?:,\\s*"|\\})')); return r ? r[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : ''; };
        v = { title: grab('title'), body: grab('body') }; if (!v.body) v = { title: '', body: raw };
      }
    }
    if (!v || typeof v !== 'object') return null;
    const body = String(v.body || v.text || '').replace(/\*\*|__/g, '').replace(/^#+\s*/gm, '').trim().slice(0, 1400);
    if (!body) return null;
    const title = String(v.title || '').replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim().slice(0, 90) || body.split('\n')[0].slice(0, 70);
    const tags = (Array.isArray(v.tags) ? v.tags : []).map(t => String(t).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24)).filter(Boolean).slice(0, 3);
    return { title, body, tags };
  }

  /* Several notes: {notes:[...]} (or a single note) -> array of parsed notes. */
  function parseWriterMulti(v, count) {
    let obj = v;
    if (typeof v === 'string') { const m = v.match(/\{[\s\S]*\}/); try { obj = JSON.parse(m ? m[0] : v); } catch (e) { obj = null; } }
    if (obj && Array.isArray(obj.notes)) return obj.notes.map(parseWriter).filter(Boolean).slice(0, count || 12);
    if (Array.isArray(obj)) return obj.map(parseWriter).filter(Boolean).slice(0, count || 12);
    const one = parseWriter(v); return one ? [one] : [];
  }

  /* Controller routing: score each specialist on keyword hits; fixed pipeline order.
     A goal no specialist recognises goes to the Writer when an AI model is connected (canWrite), otherwise to starter papers. */
  function route(goal, canWrite) {
    if (NOTE_RE.test(goal) && !/\b(papers?|datasets?|experiments?|ablations?)\b/i.test(goal)) return [{ agent: 'writer', hits: 0 }];
    if (canWrite && WRITE_RE.test(goal) && !SPECIALIST_RE.test(goal)) return [{ agent: 'writer', hits: 0 }];
    const g = ' ' + goal.toLowerCase().replace(/[^a-z0-9 -]/g, ' ') + ' ';
    const hits = {};
    SPECIALISTS.forEach(a => { hits[a] = KEYS[a].filter(k => g.includes(' ' + k + ' ') || g.includes(' ' + k + 's ')).length; });
    let order = SPECIALISTS.filter(a => hits[a] > 0);
    if (!order.length && words(goal).length >= 1) order = [canWrite ? 'writer' : 'literature'];
    return order.map(a => ({ agent: a, hits: hits[a] || 0 }));
  }

  function createEngine(opts) {
    opts = opts || {};
    const sleep = opts.sleep || (ms => new Promise(r => setTimeout(r, ms)));
    const rng = opts.rng || Math.random;
    const stepMs = opts.stepMs == null ? 850 : opts.stepMs;
    const settleMs = opts.settleMs == null ? 5000 : opts.settleMs;
    const flaky = opts.flaky == null ? 0.05 : opts.flaky;
    const now = opts.now || (() => Date.now());
    const canWrite = () => !!opts.writer && (opts.canWrite ? !!opts.canWrite() : true);
    const listeners = new Set(), history = [];
    let seq = 0;
    const id = p => p + '_' + now().toString(36) + (++seq).toString(36);

    const agents = {};
    Object.keys(AGENTS).forEach(k => {
      agents[k] = Object.assign({}, AGENTS[k], { status: 'idle', step: 'Ready', confidence: null, score: START_SCORE, retired: false, stats: { tasks: 0, succeeded: 0, failed: 0, approved: 0, rejected: 0 }, settle: null });
    });
    const proposals = new Map(), waiters = new Map(), locks = {};

    const pub = a => ({ id: a.id, name: a.name, role: a.role, status: a.status, step: a.step, confidence: a.confidence, score: a.score, retired: a.retired, stats: Object.assign({}, a.stats), tier: tier(a) });
    function tier(a) { return a.retired ? 'retired' : a.score >= 70 ? 'trusted' : a.score >= 40 ? 'stable' : 'at-risk'; }
    function emit(ev) { ev.id = id('ev'); ev.ts = now(); history.push(ev); if (history.length > 600) history.shift(); listeners.forEach(fn => { try { fn(ev); } catch (e) { /* listener errors never stop agents */ } }); return ev; }
    function setAgent(key, patch) {
      const a = agents[key]; if (a.settle) { clearTimeout(a.settle); a.settle = null; }
      Object.assign(a, patch);
      emit({ type: 'agent', agent: pub(a) });
      if (patch.status === 'complete' || patch.status === 'failed') {
        a.settle = setTimeout(() => { a.settle = null; if (a.status === 'complete' || a.status === 'failed') { a.status = a.retired ? 'retired' : 'idle'; a.step = a.retired ? 'Retired' : 'Ready'; a.confidence = null; emit({ type: 'agent', agent: pub(a) }); } }, settleMs);
        if (a.settle.unref) a.settle.unref();
      }
    }
    function reward(key, delta, reason, wsId) {
      const a = agents[key]; a.score = clamp(a.score + delta, 0, 100);
      let retired = false;
      if (key !== 'controller' && !a.retired && a.score <= RETIRE_AT) { a.retired = true; retired = true; }
      emit({ type: 'score', wsId, agentId: key, delta, score: a.score, reason, retired, agent: pub(a) });
      if (retired) { setAgent(key, { status: 'retired', step: 'Retired after repeated failures', confidence: null }); }
    }
    function log(ctx, key, kind, text, conf) { emit({ type: 'log', wsId: ctx.wsId, goalId: ctx.goalId, agentId: key, kind, text, confidence: conf == null ? null : round2(conf) }); }

    /* ----- approval gate ----- */
    function gate(ctx, key, spec) {
      const p = { id: id('pr'), goalId: ctx.goalId, wsId: ctx.wsId, agentId: key, kind: spec.kind, title: spec.title, detail: spec.detail || [], confidence: round2(spec.confidence), payload: spec.payload || null, state: 'pending', createdAt: now() };
      if (spec.kind === 'spawn_node') p.nodeId = id('ag');
      proposals.set(p.id, p);
      setAgent(key, { status: 'waiting', step: 'Waiting for approval: ' + shortTitle(spec.title), confidence: p.confidence });
      emit({ type: 'proposal', event: 'created', proposal: Object.assign({}, p) });
      return new Promise(resolve => waiters.set(p.id, resolve));
    }
    function decide(proposalId, approve) {
      const p = proposals.get(proposalId); if (!p || p.state !== 'pending') return false;
      p.state = approve ? 'approved' : 'rejected'; p.decidedAt = now();
      const a = agents[p.agentId];
      if (approve) { a.stats.approved++; reward(p.agentId, p.kind === 'spawn_node' ? REWARD.spawnApproved : REWARD.executeApproved, p.kind === 'spawn_node' ? 'Node approved' : 'Action approved', p.wsId); }
      else { a.stats.rejected++; reward(p.agentId, p.kind === 'spawn_node' ? REWARD.spawnRejected : REWARD.executeRejected, p.kind === 'spawn_node' ? 'Node rejected' : 'Action rejected', p.wsId); }
      emit({ type: 'proposal', event: approve ? 'approved' : 'rejected', proposal: Object.assign({}, p) });
      if (!a.retired) setAgent(p.agentId, { status: 'running', step: approve ? 'Approved, continuing' : 'Rejected, adjusting plan' });
      const w = waiters.get(p.id); waiters.delete(p.id); if (w) w(approve ? 'approved' : 'rejected');
      return true;
    }
    function pending(wsId) { return Array.from(proposals.values()).filter(p => p.state === 'pending' && (!wsId || p.wsId === wsId)).map(p => Object.assign({}, p)); }

    /* ----- specialist agents ----- */
    function makeCtx(key, base) {
      const a = agents[key], alive = () => { if (a.retired) throw new Retired('Retired mid-task, so I stopped.'); };
      return {
        wsId: base.wsId, goalId: base.goalId, goal: base.goal, task: base.task, graph: base.graph, approved: 0, rejected: 0,
        async think(text, conf) { alive(); log(base, key, 'thought', text, conf); if (conf != null) setAgent(key, { confidence: round2(conf) }); await sleep(stepMs); },
        async step(text, conf) { alive(); setAgent(key, { status: 'running', step: text, confidence: conf == null ? a.confidence : round2(conf) }); log(base, key, 'step', text, conf); await sleep(stepMs); },
        async gate(spec) { alive(); const r = await gate(base, key, spec); if (r === 'approved') this.approved++; else this.rejected++; return r; },
        fail(reason) { throw new TaskFail(reason); },
        skip(reason) { throw new NoWork(reason); }
      };
    }

    async function literature(c) {
      const kw = keywords(c.task), g = c.graph;
      await c.step('Scanning ' + g.length + ' node' + (g.length === 1 ? '' : 's') + ' on the canvas', 0.7);
      const rel = g.map(n => ({ n, s: overlap(kw, termsOf(n)) })).filter(x => x.s > 0).sort((x, y) => y.s - x.s).slice(0, 3).map(x => x.n);
      await c.think(rel.length ? 'Closest existing work: ' + rel.map(n => '“' + shortTitle(n.title) + '”').join(', ') + '.' : 'Nothing on the canvas matches yet, so I will search from the goal text alone.', rel.length ? 0.78 : 0.55);
      const topic = new Set(kw.map(stem)); rel.forEach(n => (n.tags || []).forEach(t => topic.add(stem(t))));
      await c.step('Searching the paper index', 0.7);
      const have = g.map(n => new Set(words(n.title)));
      const scored = CATALOG.map(p => {
        const tt = new Set(words(p.title)); const dup = have.some(h => { let i = 0; tt.forEach(w => { if (h.has(w)) i++; }); return i / Math.max(1, tt.size) > 0.7; });
        const tagHits = p.tags.filter(t => topic.has(stem(t))).length, titleHits = overlap(kw, new Set(Array.from(tt).map(stem)));
        return { p, dup, s: tagHits * 2 + titleHits };
      }).filter(x => !x.dup);
      let cands = scored.filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 2);
      if (!cands.length) {
        if (!scored.length) c.skip('Every paper in the built-in index is already on your canvas, so there is nothing new to add.');
        await c.think('Nothing matched “' + (kw.slice(0, 4).join(' ') || c.task) + '” closely, so I will suggest foundational papers instead. Treat these as a starting point.', 0.5);
        cands = scored.slice(0, 2);
      }
      await c.think('Found ' + cands.length + ' candidate paper' + (cands.length > 1 ? 's' : '') + ' that are not on the canvas yet.', clamp(0.55 + cands[0].s * 0.06, 0.55, 0.93));
      let made = 0;
      for (const x of cands) {
        const p = x.p, conf = clamp(0.55 + x.s * 0.07, 0.55, 0.95);
        const draft = { title: p.title, tags: p.tags, summary: p.summary, topic: '' };
        const links = Core.link(draft, g, { k: 2, min: 0.05 });
        const topicName = (links.length && (g.find(n => n.id === links[0].target) || {}).topic) || (rel[0] && rel[0].topic) || 'Uncategorized';
        const r = await c.gate({
          kind: 'spawn_node', title: 'Add paper: ' + shortTitle(p.title) + ' (' + p.lead + ' et al., ' + p.year + ')', confidence: conf,
          detail: [p.summary].concat(links.length ? ['Links to ' + links.map(l => '“' + shortTitle((g.find(n => n.id === l.target) || {}).title || '') + '”').join(' and ')] : []),
          payload: { node: { type: 'paper', title: p.title, authors: [p.lead + ' et al.'], meta: p.lead + ' et al. · ' + p.year + ' · ' + p.venue, tags: p.tags, topic: topicName, summary: p.summary, findings: [] }, links: links.map(l => ({ target: l.target, score: l.score, reason: l.reason })) }
        });
        if (r === 'approved') made++; else await c.think('Dropping that one. I will weight the next suggestion differently.', 0.6);
      }
      return { made };
    }

    function pickBy(g, type, kw) { const xs = g.filter(n => n.type === type); return xs.map(n => ({ n, s: overlap(kw, termsOf(n)) })).sort((a, b) => b.s - a.s)[0]; }

    async function setup(c) {
      const kw = keywords(c.task), pick = pickBy(c.graph, 'code', kw);
      if (!pick) c.skip('There is no code node on the canvas. Add a repository with Add Source, then ask again.');
      const repo = pick.n, blob = (repo.title + ' ' + repo.meta + ' ' + (repo.tags || []).join(' ')).toLowerCase();
      await c.step('Inspecting “' + shortTitle(repo.title) + '”', 0.7);
      const py = /python|pytorch|torch|pip|\.py|faiss/.test(blob), js = /node|javascript|typescript|npm|react/.test(blob), rs = /rust|cargo/.test(blob);
      await c.think(py ? 'Python project. I will use an isolated virtual environment.' : js ? 'Node project. I will use a clean install from the lockfile.' : rs ? 'Rust project. Cargo will fetch and build dependencies.' : 'The metadata does not name a language, so I will fall back to reading the README.', py || js || rs ? 0.86 : 0.55);
      const cmds = py ? ['python -m venv .venv', 'source .venv/bin/activate', 'pip install -r requirements.txt'].concat(/faiss/.test(blob) ? ['pip install faiss-cpu'] : [], ['python -m pytest -q']) : js ? ['node -v', 'npm ci', 'npm test'] : rs ? ['cargo build --release', 'cargo test'] : ['git clone <repo-url>', 'open README.md and follow the build section'];
      const conf = py || js || rs ? 0.86 : 0.55;
      const r = await c.gate({ kind: 'execute', title: 'Set up environment for ' + shortTitle(repo.title), confidence: conf, detail: cmds.map(x => '$ ' + x).concat(['Simulated: nothing is executed on your machine.']) });
      if (r === 'rejected') { await c.think('Skipping setup. Tell me if you want a different toolchain.', 0.6); return { made: 0 }; }
      await c.step('Creating environment (simulated)', conf); await c.step('Checking the install (simulated)', conf);
      const rr = await c.gate({
        kind: 'spawn_node', title: 'Add note: Environment for ' + shortTitle(repo.title), confidence: conf,
        detail: ['A checklist of the setup commands, linked to the repository node.'],
        payload: { node: { type: 'note', title: 'Environment: ' + repo.title, authors: [], meta: 'Setup checklist · simulated', tags: ['setup', 'environment'].concat((repo.tags || []).slice(0, 1)), topic: repo.topic || 'Tooling', summary: 'Setup steps for ' + repo.title + ': ' + cmds.join('; ') + '.', findings: [] }, links: [{ target: repo.id, score: 0.9, reason: 'Documents this repository' }] }
      });
      return { made: rr === 'approved' ? 1 : 0 };
    }

    /* Hyperparameter sweeps run on the shared simulator (experiment-core) and produce an Experiment node. */
    const SWEEPS = [
      { key: 'learningRate', re: /learning[ -]rate|\blr\b/i, grid: [1e-4, 3e-4, 1e-3] }, { key: 'batchSize', re: /batch/i, grid: [16, 32, 64] },
      { key: 'layers', re: /\blayers?\b|\bdepth\b/i, grid: [4, 8, 12] }, { key: 'hiddenSize', re: /hidden|\bwidth\b/i, grid: [128, 256, 512] },
      { key: 'epochs', re: /epochs?/i, grid: [5, 10, 20] }, { key: 'dropout', re: /dropout/i, grid: [0, 0.1, 0.3] }
    ];
    async function sweep(c, sw, ds, cd) {
      const meta = Sim.BY_KEY[sw.key], target = ds ? ds.n : cd.n, tail = c.task.slice(Math.max(0, c.task.search(sw.re)));
      let vals = (tail.match(/\b\d+(?:\.\d+)?(?:e-?\d+)?\b/gi) || []).map(Number).filter(v => isFinite(v) && v >= meta.min && v <= meta.max).filter((v, i, a) => a.indexOf(v) === i).slice(0, 6);
      if (vals.length < 2) vals = sw.grid;
      const fmt = v => Sim.format(sw.key, v), conf = clamp(0.6 + (ds ? 0.12 : 0) + (cd ? 0.1 : 0) + (vals !== sw.grid ? 0.08 : 0), 0.6, 0.92);
      await c.step('Designing a ' + vals.length + '-point sweep of ' + meta.label.toLowerCase(), conf);
      await c.think('Plan: ' + meta.label.toLowerCase() + ' = ' + vals.map(fmt).join(', ') + ' with the other settings at their baseline.', conf);
      const r = await c.gate({ kind: 'execute', title: 'Sweep ' + meta.label.toLowerCase() + ' on ' + shortTitle(target.title), confidence: conf, detail: vals.map((v, i) => (i + 1) + '. ' + meta.label.toLowerCase() + ' = ' + fmt(v)).concat(['Simulated with the experiment model. No real training or data access.']) });
      if (r === 'rejected') { await c.think('Not running the sweep. I can narrow the values if you want.', 0.6); return { made: 0 }; }
      const seed = target.id + '|' + c.task, base = Sim.makeExp({ model: 'Baseline model', dataset: target.title, seed }), hist = [];
      for (let i = 0; i < vals.length; i++) {
        await c.step('Running ' + meta.label.toLowerCase() + ' = ' + fmt(vals[i]) + ' (' + (i + 1) + '/' + vals.length + ')', conf);
        if (rng() < flaky) c.fail('The run crashed at ' + meta.label.toLowerCase() + ' = ' + fmt(vals[i]) + ' with an out-of-memory error (simulated). A smaller batch size should fix it.');
        const m = Sim.simulate(Object.assign({}, base.baseline, { [sw.key]: vals[i] }), { seed });
        hist.push({ label: meta.label + ' ' + fmt(vals[i]), at: 0, params: m.params, accuracy: m.accuracy, latencyMs: m.latencyMs, ok: !m.diverged && m.memGB <= Sim.GPU_BUDGET_GB, value: vals[i] });
      }
      const okRuns = hist.filter(h => h.ok), pool = okRuns.length ? okRuns : hist, best = pool.reduce((a, b) => (b.accuracy > a.accuracy ? b : a));
      await c.think('Best setting is ' + meta.label.toLowerCase() + ' = ' + fmt(best.value) + ' at ' + best.accuracy.toFixed(1) + '% accuracy.', clamp(conf + 0.05, 0, 0.95));
      const exp = Sim.makeExp({ model: 'Baseline model', dataset: target.title, seed, params: { [sw.key]: best.value }, history: hist.map(h => ({ label: h.label, at: h.at, params: h.params, accuracy: h.accuracy, latencyMs: h.latencyMs })) });
      const links = [ds && { target: ds.n.id, score: 0.85, reason: 'Evaluated on this dataset' }, cd && { target: cd.n.id, score: 0.8, reason: 'Run with this code' }].filter(Boolean);
      const title = 'Sweep: ' + meta.label.toLowerCase() + ' ' + fmt(best.value) + ' leads (' + best.accuracy.toFixed(1) + '%)';
      const rr = await c.gate({
        kind: 'spawn_node', title: 'Add experiment: ' + title, confidence: conf,
        detail: hist.map(h => h.label + ': ' + h.accuracy.toFixed(1) + '% accuracy, ' + h.latencyMs + ' ms' + (h.ok ? '' : ' (unstable or over budget)')).concat(['Open the node to try other settings. Simulated, not measured.']),
        payload: { node: { type: 'experiment', title, authors: [], meta: 'Simulated · ' + shortTitle(target.title), tags: ['experiment', 'hyperparameters'].concat((target.tags || []).slice(0, 1)), topic: target.topic || 'Uncategorized', summary: 'Simulated ' + meta.label.toLowerCase() + ' sweep: ' + hist.map(h => h.label + ' ' + h.accuracy.toFixed(1) + '%').join(', ') + '.', findings: [], exp }, links }
      });
      return { made: rr === 'approved' ? 1 : 0 };
    }

    async function experiment(c) {
      const kw = keywords(c.task), ds = pickBy(c.graph, 'dataset', kw), cd = pickBy(c.graph, 'code', kw);
      if (!ds && !cd) c.skip('There is no dataset or code node to run against. Add one with Add Source first.');
      const sw = SWEEPS.find(x => x.re.test(c.task)); if (sw) return sweep(c, sw, ds, cd);
      const nums = (c.task.match(/\b\d+(?:\.\d+)?\b/g) || []).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);
      const rerank = /rerank/i.test(c.task);
      const configs = nums.length >= 2 ? nums.map(v => 'k=' + v) : rerank ? ['without reranker', 'with reranker'] : ['baseline', 'variant A', 'variant B'];
      const target = ds ? ds.n : cd.n, tags = (target.tags || []).join(' ');
      const metric = /f1/i.test(c.task) ? 'F1' : /exact match|\bem\b/i.test(c.task) ? 'Exact match' : /qa|question/.test(tags + ' ' + target.title.toLowerCase()) ? 'Exact match' : 'Accuracy';
      const conf = clamp(0.45 + (ds ? 0.17 : 0) + (cd ? 0.17 : 0) + (nums.length >= 2 || rerank ? 0.1 : 0), 0.45, 0.92);
      await c.step('Designing ' + configs.length + ' configurations', conf);
      await c.think('Plan: ' + configs.join(', ') + ' on “' + shortTitle(target.title) + '”, measuring ' + metric + '.', conf);
      const r = await c.gate({ kind: 'execute', title: 'Run ' + configs.length + '-config simulation on ' + shortTitle(target.title), confidence: conf, detail: configs.map((x, i) => (i + 1) + '. ' + x).concat(['Simulated with a seeded model. No real training or data access.']) });
      if (r === 'rejected') { await c.think('Not running the experiment. I can narrow the grid if you want.', 0.6); return { made: 0 }; }
      const rand = seeded(hash(c.task + '|' + target.id)), results = [];
      for (let i = 0; i < configs.length; i++) {
        await c.step('Running ' + configs[i] + ' (' + (i + 1) + '/' + configs.length + ')', conf);
        if (rng() < flaky) c.fail('The run crashed on “' + configs[i] + '” with an out-of-memory error (simulated). A smaller batch size should fix it.');
        results.push({ label: configs[i], value: Math.round((0.42 + rand() * 0.34) * 1000) / 1000 });
      }
      const best = results.reduce((a, b) => (b.value > a.value ? b : a));
      await c.think('Best configuration is ' + best.label + ' at ' + best.value.toFixed(3) + ' ' + metric + '.', clamp(conf + 0.05, 0, 0.95));
      const links = [ds && { target: ds.n.id, score: 0.85, reason: 'Evaluated on this dataset' }, cd && { target: cd.n.id, score: 0.8, reason: 'Run with this code' }].filter(Boolean);
      const rr = await c.gate({
        kind: 'spawn_node', title: 'Add note: ' + best.label + ' leads (' + metric + ' ' + best.value.toFixed(3) + ')', confidence: conf,
        detail: results.map(x => x.label + ': ' + x.value.toFixed(3)).concat(['Simulated results, not a real measurement.']),
        payload: { node: { type: 'note', title: 'Experiment: ' + best.label + ' leads (' + metric + ' ' + best.value.toFixed(3) + ')', authors: [], meta: 'Simulated · seeded run', tags: ['experiment', 'simulation'].concat((target.tags || []).slice(0, 1)), topic: target.topic || 'Uncategorized', summary: 'Simulated ' + metric + ' by configuration: ' + results.map(x => x.label + ' ' + x.value.toFixed(3)).join(', ') + '. Best: ' + best.label + '.', findings: results.map(x => x.label + ': ' + x.value.toFixed(3)) }, links }
      });
      return { made: rr === 'approved' ? 1 : 0 };
    }

    /* The Writer turns a general goal ("a list of 10 anime") into a note, using the AI model the host provides. */
    async function writer(c) {
      const count = noteCount(c.task);
      let outs;
      if (!canWrite()) {
        // No AI model here: still put the notes on the canvas, as honest empty placeholders the person can fill in with Edit.
        await c.step('Reading the goal', 0.7);
        const topic = noteTopic(c.task);
        await c.think('No AI model is connected here, so I cannot research this. I am adding ' + count + ' placeholder note' + (count === 1 ? '' : 's') + ' you can fill in with Edit.', 0.5);
        outs = Array.from({ length: count }, (_, i) => ({ title: shortTitle((count > 1 ? 'Note ' + (i + 1) + ': ' : '') + topic), body: 'Placeholder. No AI model was connected, so nothing was researched. Use the ⋯ button, then Edit, to type your own text or links here.', tags: ['placeholder'], placeholder: true }));
      } else {
        await c.step('Reading the goal', 0.7);
        await c.step('Asking the AI model. If a permission box appears, allow it.', 0.75);
        try { outs = parseWriterMulti(await opts.writer({ goal: c.task, graph: c.graph, prompt: writerPrompt(c.task, c.graph, count), count }), count); }
        catch (e) {
          const code = e && e.code, msg = (e && e.message) || 'unknown error';
          if (code === 'not_granted') c.skip('You did not allow the AI model, so nothing was written. Allow it when asked, then send the goal again.');
          if (code === 'aborted') c.skip('Cancelled, so nothing was written.');
          if (code === 'unavailable') c.skip('The AI model is not available in this view, so nothing was written. ' + msg);
          if (code === 'rate_limited') c.skip('The AI model is busy (too many requests). Wait a moment and send the goal again.');
          c.fail('The AI model could not write this (' + (code || 'error') + '): ' + msg);
        }
        if (!outs || !outs.length) c.fail('The AI model returned nothing I could use.');
        await c.think('Drafted ' + outs.length + ' note' + (outs.length === 1 ? '' : 's') + (outs.length === 1 ? ': “' + shortTitle(outs[0].title) + '”.' : '.'), 0.75);
      }
      let made = 0;
      for (const out of outs) {
        const lines = out.body.split('\n').filter(l => l.trim());
        const r = await c.gate({
          kind: 'spawn_node', title: 'Add note: ' + shortTitle(out.title), confidence: out.placeholder ? 0.5 : 0.75,
          detail: lines.slice(0, 3).map(l => shortTitle(l.trim())).concat(lines.length > 3 ? ['…and ' + (lines.length - 3) + ' more lines'] : []),
          payload: { node: { type: 'note', title: out.title, authors: [], meta: out.placeholder ? 'Placeholder · no AI model connected, add your own text with Edit' : 'Written by the Writer agent · AI-generated, check the facts', tags: [out.placeholder ? 'placeholder' : 'ai-note'].concat(out.placeholder ? [] : out.tags), topic: 'Notes', summary: out.body, findings: [] }, links: [] }
        });
        if (r === 'approved') made++;
      }
      return { made };
    }
    const RUNNERS = { literature, setup, experiment, writer };

    /* Run one specialist task. One task at a time per agent; others queue. */
    function runTask(key, base) {
      const prev = locks[key] || Promise.resolve();
      const run = prev.then(async () => {
        const a = agents[key];
        if (a.retired) { log(base, 'controller', 'info', a.name + ' is retired, so I skipped “' + base.task + '”. Reinstate it to use it again.'); return { skipped: true }; }
        a.stats.tasks++;
        setAgent(key, { status: 'running', step: 'Starting', confidence: null });
        log(base, 'controller', 'routed', 'Routed to ' + a.name + ': ' + base.task);
        const ctx = makeCtx(key, base);
        try {
          const res = await RUNNERS[key](ctx);
          if (ctx.approved > 0) { a.stats.succeeded++; reward(key, REWARD.taskSuccess, 'Task completed', base.wsId); }
          if (!a.retired) setAgent(key, { status: 'complete', step: ctx.approved ? 'Done: ' + ctx.approved + ' approved' : 'Done: nothing approved', confidence: a.confidence });
          log(base, key, 'result', ctx.approved ? 'Finished. ' + ctx.approved + ' item' + (ctx.approved > 1 ? 's' : '') + ' approved' + (ctx.rejected ? ', ' + ctx.rejected + ' rejected' : '') + '.' : 'Finished with nothing approved.', a.confidence);
          return { ok: true, approved: ctx.approved, rejected: ctx.rejected, made: res && res.made };
        } catch (e) {
          if (e instanceof NoWork) { a.stats.tasks--; log(base, key, 'info', e.message, null); if (!a.retired) setAgent(key, { status: 'complete', step: 'Nothing to do', confidence: null }); return { skipped: true, note: e.message }; }
          if (!(e instanceof TaskFail)) { log(base, key, 'failed', 'Unexpected error: ' + (e && e.message), null); a.stats.failed++; reward(key, REWARD.taskFailed, 'Task crashed', base.wsId); if (!a.retired) setAgent(key, { status: 'failed', step: 'Crashed', confidence: null }); return { ok: false }; }
          if (e instanceof Retired) { log(base, key, 'failed', e.message, null); return { ok: false, reason: e.message }; }
          a.stats.failed++; log(base, key, 'failed', e.message, null);
          reward(key, REWARD.taskFailed, 'Task failed', base.wsId);
          if (!a.retired) setAgent(key, { status: 'failed', step: 'Failed: ' + shortTitle(e.message), confidence: null });
          return { ok: false, reason: e.message };
        }
      });
      locks[key] = run.catch(() => {});
      return run;
    }

    /* ----- Controller ----- */
    function submitGoal(input) {
      const goal = String(input.goal || '').trim().slice(0, 300), wsId = input.wsId || 'default';
      const goalId = id('goal'), graph = (input.graph || []).slice(0, 2000);
      if (goal.length < 3) return { ok: false, error: 'Write a goal first.' };
      if (!/[a-z]{3}/i.test(goal)) return { ok: false, error: 'Write the goal in a few words, for example “review papers on retrieval”.' };
      const base = { wsId, goalId, goal, graph };
      emit({ type: 'goal', state: 'received', goalId, wsId, goal });
      (async () => {
        setAgent('controller', { status: 'running', step: 'Reading goal', confidence: null });
        log(base, 'controller', 'thought', 'Reading the goal: “' + goal + '”.', null);
        await sleep(stepMs);
        const plan = route(goal, canWrite());
        if (!plan.length) {
          log(base, 'controller', 'failed', 'I could not tell which specialist should take this. Try “review papers on …”, “set up <repo>” or “run an ablation on …”.', null);
          setAgent('controller', { status: 'failed', step: 'No route for this goal' });
          emit({ type: 'goal', state: 'done', goalId, wsId, ok: false }); return;
        }
        if (plan.length === 1 && plan[0].agent === 'literature' && plan[0].hits === 0) log(base, 'controller', 'info', 'No paper, setup or experiment keywords matched, and no AI model is connected to write notes, so I will suggest starter papers instead.', null);
        const names = plan.map(p => AGENTS[p.agent].name);
        const conf = clamp(0.6 + plan[0].hits * 0.12, 0.6, 0.95);
        log(base, 'controller', 'thought', 'Plan: ' + names.join(' → ') + '.', conf);
        setAgent('controller', { status: 'running', step: 'Routing to ' + names.join(', '), confidence: conf });
        await sleep(stepMs);
        let okCount = 0, approvedTotal = 0, skippedCount = 0, lastNote = '';
        for (const p of plan) {
          setAgent('controller', { status: 'running', step: 'Waiting on ' + AGENTS[p.agent].name, confidence: conf });
          const r = await runTask(p.agent, Object.assign({}, base, { task: goal }));
          if (r && r.ok) okCount++; if (r && r.skipped) { skippedCount++; lastNote = r.note || lastNote; } if (r && r.approved) approvedTotal += r.approved;
        }
        if (okCount === 0 && skippedCount === plan.length) {
          reward('controller', 0, 'Nothing to do', wsId);
          setAgent('controller', { status: 'complete', step: 'Nothing to do', confidence: conf });
          log(base, 'controller', 'info', 'Nothing for the team to do right now. ' + lastNote, null);
          emit({ type: 'goal', state: 'done', goalId, wsId, ok: true }); return;
        }
        const good = okCount > 0 && approvedTotal > 0;
        reward('controller', good ? REWARD.goalDone : okCount === 0 ? REWARD.goalFailed : 0, good ? 'Goal delivered results' : 'Goal produced nothing', wsId);
        setAgent('controller', { status: okCount ? 'complete' : 'failed', step: okCount ? 'Goal done: ' + approvedTotal + ' approved' : 'Goal failed', confidence: conf });
        log(base, 'controller', okCount ? 'result' : 'failed', okCount ? 'Goal complete. ' + approvedTotal + ' item' + (approvedTotal === 1 ? '' : 's') + ' approved across ' + okCount + ' task' + (okCount === 1 ? '' : 's') + '.' : 'None of the tasks succeeded. See the messages above.', conf);
        emit({ type: 'goal', state: 'done', goalId, wsId, ok: okCount > 0 });
      })().catch(e => { log(base, 'controller', 'failed', 'Controller error: ' + e.message, null); });
      return { ok: true, goalId };
    }

    function reinstate(key) {
      const a = agents[key]; if (!a || !a.retired) return false;
      a.retired = false; a.score = REINSTATE_TO; a.stats.failed = 0;
      setAgent(key, { status: 'idle', step: 'Reinstated', confidence: null });
      emit({ type: 'score', agentId: key, delta: 0, score: a.score, reason: 'Reinstated', retired: false, agent: pub(a) });
      return true;
    }

    return {
      on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      submitGoal, decide, reinstate, pending,
      snapshot() { return { agents: Object.keys(agents).map(k => pub(agents[k])), pending: pending() }; },
      history: () => history.slice(),
      constants: { START_SCORE, RETIRE_AT, REINSTATE_TO, REWARD }
    };
  }

  const api = { createEngine, route, AGENTS, SPECIALISTS, CATALOG, keywords, writerPrompt, parseWriter, parseWriterMulti, noteCount, noteTopic };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RGAgents = api;
})(typeof self !== 'undefined' ? self : this);
