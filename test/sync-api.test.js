// usage: BASE=http://localhost:3111 node test/sync-api.test.js
const assert = require('assert'); const BASE = process.env.BASE || 'http://localhost:3000';
const post = (b) => fetch(BASE + '/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async r => ({ status: r.status, body: await r.json() }));
const snap = (id, title, ut) => ({ v: 1, ws: [{ id: 'sw', name: 'S', nodes: [{ id, type: 'note', title, x: 0, y: 0, ut }], edges: [], log: [], tomb: {} }] });
(async () => {
  const bad = await post({ snapshot: { nope: 1 } }); assert.strictEqual(bad.status, 400);
  const g0 = await (await fetch(BASE + '/api/sync')).json(); const rev0 = g0.rev;
  const a = await post({ baseRev: rev0, snapshot: snap('n_a', 'from A', 5) }); assert(a.body.ok && a.body.rev === rev0 + 1);
  const b = await post({ baseRev: rev0, snapshot: snap('n_b', 'from B', 6) }); assert(b.body.merged, 'stale baseRev triggers a merge');
  const ids = b.body.snapshot.ws.find(w => w.id === 'sw').nodes.map(n => n.id).sort(); assert.deepStrictEqual(ids.filter(x => /^n_/.test(x)), ['n_a', 'n_b']);
  const g = await (await fetch(BASE + '/api/sync')).json(); assert.strictEqual(g.rev, b.body.rev);
  const h = await (await fetch(BASE + '/api/health')).json(); assert(h.sync === true);
  console.log('sync api passed, rev', g.rev);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
