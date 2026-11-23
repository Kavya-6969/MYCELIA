#!/usr/bin/env node
/*
 * ResearchGraph backend. Zero dependencies (Node 18+).
 *
 *   node server.js                      -> http://localhost:3000, mock AI
 *   GROQ_API_KEY=...   node server.js   -> Groq (llama-3.3-70b-versatile)
 *   OPENAI_API_KEY=... node server.js   -> OpenAI (gpt-4o-mini)
 *
 * POST /api/ingest  (JSON)
 *   { kind: "file" | "url" | "text",
 *     filename?, data? (base64, for file), url?, text?, type?,
 *     nodes: [{id,title,tags,topic,x,y,...}]   // existing canvas nodes, used for linking
 *     viewCenter?: {x,y} }
 * GET  /api/health  -> { ok, provider }
 * GET  /api/db      -> local sync database info: engine, file, row counts, last syncs
 */
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const dns = require('dns').promises;
const net = require('net');
const { spawn } = require('child_process');
const Core = require('./src/ingest-core.js');
const Agents = require('./src/agent-core.js');
const Sim = require('./src/experiment-core.js');
const Exporter = require('./src/export-core.js');
const Sync = require('./src/sync-core.js');
const Ask = require('./src/ask-core.js');
const Help = require('./src/help-core.js');
// One team per server; scores persist while the process runs. The Writer agent calls the configured AI provider.
const engine = Agents.createEngine({ writer: args => writeWithModel(args.prompt), canWrite: () => providers.length > 0 });
const streams = new Set();
engine.on(ev => { const line = 'data: ' + JSON.stringify(ev) + '\n\n'; streams.forEach(res => res.write(line)); });

const PORT = +process.env.PORT || 3000;
const MAX_BODY = 20 * 1024 * 1024;          // JSON body incl. base64 file
const MAX_FETCH = 8 * 1024 * 1024;          // fetched URL size
const PUBLIC = path.join(__dirname, 'public');

const providers = [];
if (process.env.GROQ_API_KEY) providers.push({ name: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', key: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile' });
if (process.env.OPENAI_API_KEY) providers.push({ name: 'openai', url: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1') + '/chat/completions', key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-4o-mini' });

async function writeWithModel(prompt) {
  let failed = 'no model configured';
  for (const p of providers) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 30000);
    try {
      const res = await fetch(p.url, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + p.key }, body: JSON.stringify({ model: p.model, temperature: 0.5, max_tokens: 700, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }) });
      if (!res.ok) throw new Error(p.name + ' returned HTTP ' + res.status);
      const j = await res.json(), text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (!text) throw new Error('empty reply');
      return text;
    } catch (e) { console.warn('[writer] ' + p.name + ' failed: ' + e.message); failed = p.name + ': ' + e.message; }
    finally { clearTimeout(timer); }
  }
  throw new Error(failed);
}
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

/* ---------------- LLM ---------------- */
async function callLlm(p, title, text) {
  const prompt = Core.buildPrompt(title, text);
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 25000);
  try {
    const res = await fetch(p.url, {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + p.key },
      body: JSON.stringify({ model: p.model, temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }] })
    });
    if (!res.ok) throw new Error(p.name + ' returned HTTP ' + res.status);
    const j = await res.json();
    const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    return JSON.parse(content);
  } finally { clearTimeout(timer); }
}
async function askLlm(question, items, history, help) {
  const messages = help ? Help.buildMessages(question, history) : Ask.buildMessages(question, items, history);
  let failed = '';
  for (const p of providers) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 25000);
    try {
      const res = await fetch(p.url, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + p.key }, body: JSON.stringify({ model: p.model, temperature: 0.2, max_tokens: 500, messages }) });
      if (!res.ok) throw new Error(p.name + ' returned HTTP ' + res.status);
      const j = await res.json(), text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (!text) throw new Error('empty reply');
      return { text: String(text).trim(), provider: p.name, model: p.model };
    } catch (e) { console.warn('[ask] ' + p.name + ' failed: ' + e.message); failed = p.name + ': ' + e.message; }
    finally { clearTimeout(timer); }
  }
  return { error: failed || 'no model configured' };
}
async function analyze(title, text) {
  const fallback = Core.mockAnalyze(text, title);
  for (const p of providers) {
    try { return { ai: Core.normalizeAi(await callLlm(p, title, text), fallback), provider: p.name, model: p.model, fallback: null }; }
    catch (e) { console.warn('[ai] ' + p.name + ' failed: ' + e.message); var failed = p.name + ': ' + e.message; }
  }
  return { ai: fallback, provider: 'mock', model: 'heuristic-v1', fallback: providers.length ? failed : null };
}

/* ---------------- Fetching URLs (with SSRF guard) ---------------- */
function privateIp(ip) {
  if (net.isIPv6(ip)) return ip === '::1' || /^(fc|fd|fe80)/i.test(ip) || /^::ffff:(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/i.test(ip);
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}
async function assertPublic(u) {
  if (!/^https?:$/.test(u.protocol)) throw new HttpError(400, 'Only http and https URLs are supported.');
  const addrs = net.isIP(u.hostname) ? [{ address: u.hostname }] : await dns.lookup(u.hostname, { all: true }).catch(() => { throw new HttpError(422, 'Could not resolve ' + u.hostname + '.'); });
  if (addrs.some(a => privateIp(a.address))) throw new HttpError(400, 'That address points to a private network and was blocked.');
}
async function fetchUrl(raw) {
  let u; try { u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : 'https://' + raw); } catch (e) { throw new HttpError(400, 'That does not look like a valid URL.'); }
  // arXiv abs page -> PDF is heavier; the abs page already has title, authors and abstract meta tags.
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(u);
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
    let res;
    try { res = await fetch(u, { redirect: 'manual', signal: ctl.signal, headers: { 'user-agent': 'ResearchGraphBot/0.1', accept: 'text/html,application/pdf,text/plain;q=0.9,*/*;q=0.5' } }); }
    catch (e) { throw new HttpError(502, 'Could not reach ' + u.hostname + ': ' + (e.name === 'AbortError' ? 'timed out' : e.message)); }
    finally { clearTimeout(timer); }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { u = new URL(res.headers.get('location'), u); continue; }
    if (!res.ok) throw new HttpError(502, u.hostname + ' answered with HTTP ' + res.status + '.');
    const len = +res.headers.get('content-length') || 0; if (len > MAX_FETCH) throw new HttpError(413, 'That page is larger than 8 MB.');
    const buf = Buffer.from(await res.arrayBuffer()); if (buf.length > MAX_FETCH) throw new HttpError(413, 'That page is larger than 8 MB.');
    return { buf, type: (res.headers.get('content-type') || '').toLowerCase(), url: u.toString() };
  }
  throw new HttpError(502, 'Too many redirects.');
}

/* ---------------- PDF ---------------- */
function pdftotext(buf) {
  return new Promise(resolve => {
    const tmp = path.join(os.tmpdir(), 'rg-' + process.pid + '-' + Date.now() + '.pdf');
    fs.writeFile(tmp, buf, err => {
      if (err) return resolve(null);
      const p = spawn('pdftotext', ['-l', '12', '-enc', 'UTF-8', tmp, '-'], { stdio: ['ignore', 'pipe', 'ignore'] });
      let out = ''; const t = setTimeout(() => p.kill(), 15000);
      p.stdout.on('data', d => { if (out.length < 400000) out += d; });
      p.on('error', () => { clearTimeout(t); fs.unlink(tmp, () => {}); resolve(null); });
      p.on('close', code => { clearTimeout(t); fs.unlink(tmp, () => {}); resolve(code === 0 && out.trim() ? out : null); });
    });
  });
}
async function parsePdf(buf) {
  if (buf.slice(0, 5).toString() !== '%PDF-') throw new HttpError(415, 'That file is not a valid PDF.');
  const meta = await Core.extractPdf(new Uint8Array(buf), async d => zlib.inflateSync(Buffer.from(d))).catch(() => ({ text: '', info: {} }));
  let text = await pdftotext(buf);
  if (!text) text = meta.text;
  if (!text || text.replace(/\s/g, '').length < 40) throw new HttpError(422, 'No selectable text found in this PDF. Scanned documents need OCR first.');
  const parsed = Core.parseText(text, {});
  if (meta.info.title && meta.info.title.length > 5) parsed.title = Core.clip(Core.clean(meta.info.title), 200);
  if (meta.info.author && !parsed.authors.length) parsed.authors = meta.info.author.split(/\s*(?:,|;|\band\b)\s*/).map(Core.clean).filter(Boolean).slice(0, 8);
  return parsed;
}

/* ---------------- Ingest ---------------- */
function cleanNodes(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 2000).filter(n => n && typeof n.id === 'string').map(n => ({
    id: String(n.id).slice(0, 80), type: ['paper', 'dataset', 'code', 'note'].includes(n.type) ? n.type : 'paper', title: String(n.title || '').slice(0, 300), meta: String(n.meta || '').slice(0, 200), topic: String(n.topic || '').slice(0, 80),
    summary: String(n.summary || '').slice(0, 1000), authors: Array.isArray(n.authors) ? n.authors.slice(0, 8).map(String) : [],
    tags: Array.isArray(n.tags) ? n.tags.slice(0, 12).map(t => String(t).slice(0, 40)) : [], x: Number.isFinite(+n.x) ? +n.x : 0, y: Number.isFinite(+n.y) ? +n.y : 0
  }));
}
async function ingest(body) {
  const kind = body.kind;
  let parsed, label = '';
  if (kind === 'text') {
    const t = String(body.text || '').trim();
    if (t.length < 3) throw new HttpError(400, 'Write or paste some text first.');
    parsed = Core.parseText(t.slice(0, 200000), { kind: 'text' }); label = 'Note';
  } else if (kind === 'url') {
    const r = await fetchUrl(String(body.url || '').trim());
    if (r.type.includes('pdf') || r.buf.slice(0, 5).toString() === '%PDF-') { parsed = await parsePdf(r.buf); }
    else if (r.type.includes('html') || /<html|<!doctype/i.test(r.buf.slice(0, 400).toString())) {
      parsed = Core.parseHtml(r.buf.toString('utf8'), r.url);
      if (parsed.text.length < 80) throw new HttpError(422, 'That page has no readable text. It may need JavaScript to load.');
    } else parsed = Core.parseText(r.buf.toString('utf8').slice(0, 200000), {});
    label = new URL(r.url).hostname.replace(/^www\./, '');
  } else if (kind === 'file') {
    const name = String(body.filename || 'upload'); if (!body.data) throw new HttpError(400, 'The file was empty.');
    const buf = Buffer.from(String(body.data), 'base64'); if (!buf.length) throw new HttpError(400, 'The file was empty.');
    label = name;
    if (/\.pdf$/i.test(name) || buf.slice(0, 5).toString() === '%PDF-') parsed = await parsePdf(buf);
    else if (/\.(txt|md|markdown|tex|csv|json|rst|text)$/i.test(name) || !path.extname(name)) parsed = Core.parseText(buf.toString('utf8').slice(0, 200000), { fallbackTitle: name.replace(/\.[^.]+$/, '') });
    else if (/\.html?$/.test(name)) parsed = Core.parseHtml(buf.toString('utf8'), 'file://' + name);
    else throw new HttpError(415, 'Unsupported file type. Use PDF, TXT, MD or HTML.');
  } else throw new HttpError(400, 'kind must be file, url or text.');

  if (parsed.text.length < 20) throw new HttpError(422, 'Not enough text to analyse.');
  const r = await analyze(parsed.title, parsed.text);
  return Core.assemble(parsed, r.ai, {
    kind, type: body.type, sourceLabel: label, existing: cleanNodes(body.nodes), viewCenter: body.viewCenter && Number.isFinite(+body.viewCenter.x) ? { x: +body.viewCenter.x, y: +body.viewCenter.y } : null,
    provider: r.provider, model: r.model, fallback: r.fallback
  });
}

/* ---------------- Sync store ---------------- */
const Store = require('./src/store.js');
// RG_DB_FILE picks the database file. RG_SYNC_FILE (older setting) is kept: its name with ".db" is used and its JSON is imported once.
const LEGACY_JSON = process.env.RG_SYNC_FILE || path.join(__dirname, 'data', 'sync.json');
const DB_FILE = process.env.RG_DB_FILE || (process.env.RG_SYNC_FILE ? process.env.RG_SYNC_FILE.replace(/\.json$/, '') + '.db' : path.join(__dirname, 'data', 'researchgraph.db'));
const store = Store.open({ file: DB_FILE, legacyJson: LEGACY_JSON });
let syncState = store.load();
function persistSync(meta) { try { store.save(syncState, meta); } catch (e) { console.error('sync save failed', e.message); } }
process.on('exit', () => store.close());

/* ---------------- HTTP ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
function secHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
}

const rateLimiter = new Map();
function checkRate(ip) {
  const now = Date.now(), windowMs = 60000, maxRequests = 100;
  let entry = rateLimiter.get(ip);
  if (!entry || now - entry.start > windowMs) {
    entry = { start: now, count: 0 };
    rateLimiter.set(ip, entry);
  }
  entry.count++;
  return entry.count <= maxRequests;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimiter.entries()) {
    if (now - entry.start > 60000) rateLimiter.delete(ip);
  }
}, 300000).unref();

function send(res, status, obj) {
  secHeaders(res);
  const b = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(b);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > MAX_BODY) { reject(new HttpError(413, 'Upload is larger than 15 MB.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(new HttpError(400, 'Request body must be JSON.')); } });
    req.on('error', reject);
  });
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const ip = req.socket.remoteAddress || '127.0.0.1';
    if (url.pathname.startsWith('/api/')) {
      secHeaders(res);
      if (!checkRate(ip)) {
        return send(res, 429, { ok: false, error: 'Too many requests. Please wait a moment.' });
      }
    }
    if (url.pathname === '/api/experiments/simulate' && req.method === 'POST') {
      const b = await readBody(req), ctx = { seed: String(b.seed || 'default').slice(0, 120) }, m = Sim.simulate(b.params || {}, ctx);
      const out = { ok: true, metrics: m, curve: Sim.curve(b.params || {}, ctx), warnings: Sim.warnings(m) };
      if (b.baseline) out.deltas = Sim.compare(Sim.simulate(b.baseline, ctx), m);
      return send(res, 200, out);
    }
    if (url.pathname === '/api/export' && req.method === 'POST') {
      const b = await readBody(req); const ws = b.workspace;
      if (!ws || !Array.isArray(ws.nodes)) throw new HttpError(400, 'Send { workspace: { name, nodes, edges }, format, scope }.');
      const format = b.format === 'json' ? 'json' : 'markdown';
      const text = Exporter.buildExport({ workspace: ws, format, scope: b.scope, agents: Array.isArray(b.agents) ? b.agents : [] });
      res.writeHead(200, { 'content-type': (format === 'json' ? 'application/json' : 'text/markdown') + '; charset=utf-8', 'cache-control': 'no-store' }); return res.end(text);
    }
    if (url.pathname === '/api/sync') {
      if (req.method === 'GET') return send(res, 200, { ok: true, rev: syncState.rev, updatedAt: syncState.updatedAt, snapshot: syncState.snapshot });
      if (req.method === 'DELETE') { syncState = { rev: 0, snapshot: null, updatedAt: Date.now() }; try { store.reset(); } catch (e) { console.error('db reset failed', e.message); } return send(res, 200, { ok: true }); }
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Use GET or POST.' });
      const b = await readBody(req), snap = b.snapshot;
      if (!snap || !Array.isArray(snap.ws)) throw new HttpError(400, 'Send { baseRev, snapshot: { ws: [...] } }.');
      const clean = snap.ws.every(w => w && typeof w.id === 'string' && Array.isArray(w.nodes) && Array.isArray(w.edges));
      if (!clean) throw new HttpError(400, 'Each workspace needs id, nodes and edges.');
      const behind = syncState.snapshot && Number(b.baseRev) !== syncState.rev;
      const merged = behind ? Sync.merge(syncState.snapshot, snap) : snap;
      syncState = { rev: syncState.rev + 1, snapshot: merged, updatedAt: Date.now() }; persistSync({ merged: !!behind });
      return send(res, 200, { ok: true, rev: syncState.rev, merged: !!behind, snapshot: behind ? merged : undefined });
    }
    if (url.pathname === '/api/ask') {
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Use POST.' });
      const b = await readBody(req), question = String(b.question || '').trim().slice(0, 600);
      if (!question) throw new HttpError(400, 'Send { question, items }.');
      const str = (v, n) => String(v == null ? '' : v).slice(0, n);
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 60).map((i, k) => ({ n: Number(i.n) || k + 1, id: str(i.id, 60), type: str(i.type, 20) || 'note', title: str(i.title, 200), meta: str(i.meta, 160), summary: str(i.summary, 600),
        findings: Array.isArray(i.findings) ? i.findings.slice(0, 4).map(f => str(f, 240)) : [], tags: Array.isArray(i.tags) ? i.tags.slice(0, 8).map(t => str(t, 40)) : [], topic: str(i.topic, 80), acc: i.acc == null ? undefined : Number(i.acc), lat: i.lat == null ? undefined : Number(i.lat) }));
      if (!providers.length) return send(res, 200, { ok: false, mode: 'local', error: 'No AI key is set on the server.' });
      const r = await askLlm(question, items, Array.isArray(b.history) ? b.history : [], !!b.help);
      return r.error ? send(res, 200, { ok: false, mode: 'local', error: r.error }) : send(res, 200, { ok: true, mode: 'model', text: r.text, provider: r.provider, model: r.model });
    }
    if (url.pathname === '/api/agents/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write('data: ' + JSON.stringify(Object.assign({ type: 'snapshot' }, engine.snapshot())) + '\n\n');
      streams.add(res); const ka = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(ka); streams.delete(res); }); return;
    }
    if (url.pathname === '/api/agents' && req.method === 'GET') return send(res, 200, Object.assign({ ok: true }, engine.snapshot()));
    if (url.pathname === '/api/agents/goal' && req.method === 'POST') {
      const b = await readBody(req); const r = engine.submitGoal({ goal: b.goal, wsId: String(b.wsId || 'default').slice(0, 60), graph: cleanNodes(b.nodes) });
      return send(res, r.ok ? 200 : 400, r);
    }
    if (url.pathname === '/api/agents/decision' && req.method === 'POST') {
      const b = await readBody(req); const ok = engine.decide(String(b.proposalId || ''), !!b.approve);
      return send(res, ok ? 200 : 404, ok ? { ok: true } : { ok: false, error: 'That proposal is no longer pending.' });
    }
    if (url.pathname === '/api/agents/reinstate' && req.method === 'POST') {
      const b = await readBody(req); const ok = engine.reinstate(String(b.agentId || ''));
      return send(res, ok ? 200 : 400, ok ? { ok: true } : { ok: false, error: 'That agent is not retired.' });
    }
    if (url.pathname === '/api/db') return send(res, 200, Object.assign({ ok: true }, store.info()));
    if (url.pathname === '/api/health' && (req.method === 'GET' || req.method === 'HEAD')) {
      return send(res, 200, { ok: true, agents: true, sync: true, ask: true, store: store.engine, provider: providers[0] ? providers[0].name : 'mock', model: providers[0] ? providers[0].model : 'heuristic-v1' });
    }
    if (url.pathname === '/api/ingest') {
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Use POST.' });
      const out = await ingest(await readBody(req));
      return send(res, 200, out);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { ok: false, error: 'Method not allowed.' });
    let rel = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const shared = { '/ingest-core.js': 'ingest-core.js', '/agent-core.js': 'agent-core.js', '/experiment-core.js': 'experiment-core.js', '/export-core.js': 'export-core.js', '/sync-core.js': 'sync-core.js', '/ask-core.js': 'ask-core.js', '/help-core.js': 'help-core.js', '/study-core.js': 'study-core.js' }[rel];
    const file = shared ? path.join(__dirname, 'src', shared) : path.join(PUBLIC, rel);
    if (!shared && !file.startsWith(PUBLIC)) return send(res, 403, { ok: false, error: 'Forbidden.' });
    fs.readFile(file, (err, data) => {
      secHeaders(res);
      if (err) {
        const page404 = path.join(PUBLIC, '404.html');
        return fs.readFile(page404, (e404, d404) => {
          res.writeHead(404, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          if (req.method === 'HEAD') return res.end();
          res.end(d404 || '<!doctype html><title>404</title><h1>404 Not Found</h1>');
        });
      }
      const ext = path.extname(file);
      const mime = MIME[ext] || 'application/octet-stream';
      const isImmutable = ['.woff2', '.woff', '.min.js'].some(s => file.includes(s));
      const cacheControl = isImmutable ? 'public, max-age=31536000, immutable' : (ext === '.html' ? 'no-cache' : 'public, max-age=86400');
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'content-type': mime, 'cache-control': cacheControl });
        return res.end();
      }
      const ae = req.headers['accept-encoding'] || '';
      if (data.length > 1024 && ae.includes('br')) {
        zlib.brotliCompress(data, (e, c) => {
          if (e) { res.writeHead(200, { 'content-type': mime, 'cache-control': cacheControl }); return res.end(data); }
          res.writeHead(200, { 'content-type': mime, 'content-encoding': 'br', 'cache-control': cacheControl });
          res.end(c);
        });
      } else if (data.length > 1024 && ae.includes('gzip')) {
        zlib.gzip(data, (e, c) => {
          if (e) { res.writeHead(200, { 'content-type': mime, 'cache-control': cacheControl }); return res.end(data); }
          res.writeHead(200, { 'content-type': mime, 'content-encoding': 'gzip', 'cache-control': cacheControl });
          res.end(c);
        });
      } else {
        res.writeHead(200, { 'content-type': mime, 'cache-control': cacheControl });
        res.end(data);
      }
    });
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    secHeaders(res);
    send(res, e.status || 500, { ok: false, error: e instanceof HttpError ? e.message : 'Ingestion failed. Check the server log.' });
  }
});
function shutdown(signal) {
  console.log('[server] Received ' + signal + ', shutting down gracefully.');
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[server] Forceful termination after timeout');
    process.exit(1);
  }, 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (require.main === module) server.listen(PORT, () => console.log('ResearchGraph on http://localhost:' + PORT + '  AI: ' + (providers[0] ? providers[0].name : 'mock (set GROQ_API_KEY or OPENAI_API_KEY)')));
module.exports = { server, ingest, engine };
