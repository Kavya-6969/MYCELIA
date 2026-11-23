/*
 * ResearchGraph local sync database.
 *
 * Uses SQLite through Node's built-in `node:sqlite` (Node 22.5+), so there is nothing to install.
 * If that module is missing, it falls back to a single JSON file and says so in `info().engine`.
 *
 *   open({ file, legacyJson })  -> store
 *   store.load()                -> { rev, updatedAt, snapshot }
 *   store.save(state, meta)     -> writes the snapshot, a queryable projection and one log row in one transaction
 *   store.reset()               -> clears everything (Load Demo)
 *   store.info()                -> { engine, file, rev, workspaces, nodes, edges, log: [...] }
 *
 * Tables: meta, snapshot (the authoritative blob), workspaces, nodes, edges (a flat projection you can
 * query with any SQLite tool), sync_log (one row per accepted sync, last 200 kept).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, nodes INTEGER NOT NULL, edges INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS nodes (ws_id TEXT NOT NULL, id TEXT NOT NULL, type TEXT, title TEXT, tags TEXT, updated_at INTEGER, PRIMARY KEY (ws_id, id));
CREATE TABLE IF NOT EXISTS edges (ws_id TEXT NOT NULL, id TEXT NOT NULL, a TEXT, b TEXT, score REAL, reason TEXT, PRIMARY KEY (ws_id, id));
CREATE TABLE IF NOT EXISTS sync_log (rev INTEGER PRIMARY KEY, at INTEGER NOT NULL, client_id TEXT, merged INTEGER NOT NULL, bytes INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS nodes_type ON nodes (type);
`;

function openSqlite(file, legacyJson) {
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  db.exec(SCHEMA);
  const q = {
    getMeta: db.prepare('SELECT value FROM meta WHERE key = ?'),
    setMeta: db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
    getSnap: db.prepare('SELECT json FROM snapshot WHERE id = 1'),
    setSnap: db.prepare('INSERT INTO snapshot (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json'),
    insWs: db.prepare('INSERT INTO workspaces (id, name, nodes, edges, updated_at) VALUES (?, ?, ?, ?, ?)'),
    insNode: db.prepare('INSERT OR REPLACE INTO nodes (ws_id, id, type, title, tags, updated_at) VALUES (?, ?, ?, ?, ?, ?)'),
    insEdge: db.prepare('INSERT OR REPLACE INTO edges (ws_id, id, a, b, score, reason) VALUES (?, ?, ?, ?, ?, ?)'),
    insLog: db.prepare('INSERT OR REPLACE INTO sync_log (rev, at, client_id, merged, bytes) VALUES (?, ?, ?, ?, ?)'),
    trimLog: db.prepare('DELETE FROM sync_log WHERE rev <= ?')
  };
  const tx = fn => { db.exec('BEGIN IMMEDIATE'); try { fn(); db.exec('COMMIT'); } catch (e) { try { db.exec('ROLLBACK'); } catch (_) { /* already rolled back */ } throw e; } };
  const num = k => { const r = q.getMeta.get(k); return r ? Number(r.value) : 0; };

  function load() {
    const row = q.getSnap.get();
    return { rev: num('rev'), updatedAt: num('updated_at'), snapshot: row ? JSON.parse(row.json) : null };
  }
  function save(state, meta) {
    meta = meta || {};
    const snap = state.snapshot, json = JSON.stringify(snap);
    tx(() => {
      q.setSnap.run(json);
      q.setMeta.run('rev', String(state.rev)); q.setMeta.run('updated_at', String(state.updatedAt || Date.now()));
      db.exec('DELETE FROM workspaces; DELETE FROM nodes; DELETE FROM edges;');
      for (const w of (snap && snap.ws) || []) {
        q.insWs.run(w.id, String(w.name || ''), (w.nodes || []).length, (w.edges || []).length, state.updatedAt || Date.now());
        for (const n of w.nodes || []) q.insNode.run(w.id, n.id, n.type || null, String(n.title || ''), (n.tags || []).join(','), n.ut || null);
        for (const e of w.edges || []) q.insEdge.run(w.id, e.id, e.a, e.b, e.score == null ? null : e.score, e.reason || null);
      }
      q.insLog.run(state.rev, state.updatedAt || Date.now(), (snap && snap.clientId) || null, meta.merged ? 1 : 0, json.length);
      q.trimLog.run(state.rev - 200);
    });
  }
  function reset() {
    tx(() => { db.exec('DELETE FROM snapshot; DELETE FROM workspaces; DELETE FROM nodes; DELETE FROM edges; DELETE FROM sync_log;'); q.setMeta.run('rev', '0'); q.setMeta.run('updated_at', String(Date.now())); });
  }
  function info() {
    const c = t => db.prepare('SELECT COUNT(*) AS n FROM ' + t).get().n;
    return { engine: 'sqlite', file, rev: num('rev'), workspaces: c('workspaces'), nodes: c('nodes'), edges: c('edges'),
      log: db.prepare('SELECT rev, at, client_id AS clientId, merged, bytes FROM sync_log ORDER BY rev DESC LIMIT 10').all().map(r => Object.assign({}, r, { merged: !!r.merged })) };
  }
  function close() { try { db.close(); } catch (_) { /* closed */ } }

  const store = { engine: 'sqlite', file, load, save, reset, info, close };
  // One-time import of the old sync.json so nothing is lost when upgrading.
  if (!q.getSnap.get() && legacyJson && fs.existsSync(legacyJson)) {
    try { const old = JSON.parse(fs.readFileSync(legacyJson, 'utf8')); if (old && old.snapshot) { save({ rev: old.rev || 1, updatedAt: old.updatedAt || Date.now(), snapshot: old.snapshot }, { merged: false }); store.imported = true; } } catch (e) { /* unreadable legacy file */ }
  }
  return store;
}

function openJson(file) {
  const jf = file.replace(/\.db$/, '.json');
  let state = { rev: 0, updatedAt: 0, snapshot: null };
  try { state = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch (e) { /* first run */ }
  const persist = () => { fs.mkdirSync(path.dirname(jf), { recursive: true }); fs.writeFileSync(jf, JSON.stringify(state)); };
  return {
    engine: 'json', file: jf,
    load: () => ({ rev: state.rev || 0, updatedAt: state.updatedAt || 0, snapshot: state.snapshot || null }),
    save: s => { state = { rev: s.rev, updatedAt: s.updatedAt, snapshot: s.snapshot }; persist(); },
    reset: () => { state = { rev: 0, updatedAt: Date.now(), snapshot: null }; persist(); },
    info: () => ({ engine: 'json', file: jf, rev: state.rev || 0, workspaces: ((state.snapshot || {}).ws || []).length, nodes: 0, edges: 0, log: [] }),
    close() {}
  };
}

function open(opts) {
  opts = opts || {};
  const file = opts.file;
  try { return openSqlite(file, opts.legacyJson); }
  catch (e) { console.error('SQLite unavailable (' + e.message + '). Falling back to a JSON file.'); return openJson(file); }
}

module.exports = { open };
