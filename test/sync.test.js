const assert = require('assert');
const S = require('../src/sync-core.js');
const mk = () => ({ id: 'w1', name: 'A', clustered: false, regions: [], feed: [],
  nodes: [{ id: 'n1', type: 'paper', title: 'P1', x: 0, y: 0, pending: false }, { id: 'n2', type: 'dataset', title: 'D1', x: 10, y: 0, pending: false }, { id: 'n3', type: 'experiment', title: 'X', x: 20, y: 0, pending: false, exp: { params: { learningRate: 1e-3 }, history: [{ at: 1, accuracy: 70 }] } }],
  edges: [{ id: 'e1', a: 'n1', b: 'n2' }, { id: 'e2', a: 'n2', b: 'n3' }] });
const now = 1_700_000_000_000;
// seed history explains every node and edge, in order
const ws = mk(); const log = S.seedLog(ws, now);
assert(log.length >= 3 && log.every((e, i) => i === 0 || e.ts >= log[i - 1].ts), 'ordered');
const full = S.stateAt(ws, log.length); assert.deepStrictEqual([...full.nodes].sort(), ['n1', 'n2', 'n3']); assert.strictEqual(full.edges.size, 2);
const none = S.stateAt(ws, 0); assert.strictEqual(none.nodes.size, 0);
for (let i = 0; i <= log.length; i++) { const st = S.stateAt(ws, i); st.edges.forEach(id => { const e = ws.edges.find(x => x.id === id); assert(st.nodes.has(e.a) && st.nodes.has(e.b), 'edge only after both nodes @' + i); }); }
console.log('ok seed log', log.length, 'steps');
// diffing: add node+edge, link, run, move, remove
const w = mk(); S.seedLog(w, now); S.diffWorkspace(w, now); const n0 = w.log.length;
w.nodes.push({ id: 'n4', type: 'paper', title: 'New paper', x: 5, y: 5, pending: false, by: 'literature' }); w.edges.push({ id: 'e3', a: 'n1', b: 'n4' });
let r = S.diffWorkspace(w, now + 1000); assert.strictEqual(r.events, 1); const ev = w.log[w.log.length - 1];
assert.strictEqual(ev.kind, 'agent'); assert.deepStrictEqual(ev.nodes, ['n4']); assert.deepStrictEqual(ev.edges, ['e3']); assert(/Literature Reviewer added paper/.test(ev.text));
w.edges.push({ id: 'e4', a: 'n3', b: 'n4' }); r = S.diffWorkspace(w, now + 2000); assert.strictEqual(w.log[w.log.length - 1].kind, 'link');
w.nodes[2].exp.history.push({ at: 2, accuracy: 81.5 }); S.diffWorkspace(w, now + 3000); assert(/Saved run at 81.5%/.test(w.log[w.log.length - 1].text));
w.nodes[0].x = 99; r = S.diffWorkspace(w, now + 4000); assert.strictEqual(r.events, 0); assert.strictEqual(r.other, 1);
w.nodes.push({ id: 'g', type: 'paper', title: 'ghost', x: 0, y: 0, pending: true }); r = S.diffWorkspace(w, now + 5000); assert.strictEqual(r.events, 0, 'pending ignored');
w.nodes.find(n => n.id === 'g').pending = false; S.diffWorkspace(w, now + 6000); assert(/ghost/.test(w.log[w.log.length - 1].text), 'approval creates the event');
w.nodes = w.nodes.filter(n => n.id !== 'n4'); w.edges = w.edges.filter(e => e.a !== 'n4' && e.b !== 'n4'); S.diffWorkspace(w, now + 7000); assert(w.tomb.n4);
const ts = w.log.map(e => e.ts); assert(ts.every((t, i) => i === 0 || t >= ts[i - 1]), 'log stays ordered');
console.log('ok diff', w.log.length - n0, 'new events');
// serialize drops pending, hydrate round-trips
w.nodes.push({ id: 'p', type: 'note', title: 'pend', pending: true, x: 0, y: 0 });
const snap = JSON.parse(JSON.stringify(S.serialize([w], { clientId: 'c1', now, active: 'w1' })));
assert(!snap.ws[0].nodes.some(n => n.id === 'p')); const back = S.hydrate(snap, () => ({ feed: [] }));
assert.strictEqual(back[0].nodes.length, snap.ws[0].nodes.length); assert(back[0].nodes.every(n => n.pending === false)); assert(S.maxSeq(snap) >= 3);
console.log('ok serialize/hydrate');
// merge: both sides add nodes, one deletes, newer edit wins
const base = S.serialize([mk()], { now });
const A = JSON.parse(JSON.stringify(base)), B = JSON.parse(JSON.stringify(base));
A.ws[0].nodes.push({ id: 'a1', type: 'note', title: 'from A', ut: 10, x: 0, y: 0 });
B.ws[0].nodes.push({ id: 'b1', type: 'note', title: 'from B', ut: 11, x: 0, y: 0 });
A.ws[0].nodes[0].title = 'old'; A.ws[0].nodes[0].ut = 5; B.ws[0].nodes[0].title = 'newer'; B.ws[0].nodes[0].ut = 9;
B.ws[0].tomb = { n2: 20 }; B.ws[0].nodes = B.ws[0].nodes.filter(n => n.id !== 'n2');
const m = S.merge(A, B), ids = m.ws[0].nodes.map(n => n.id).sort();
assert.deepStrictEqual(ids, ['a1', 'b1', 'n1', 'n3'].sort()); assert.strictEqual(m.ws[0].nodes.find(n => n.id === 'n1').title, 'newer');
assert(m.ws[0].edges.every(e => ids.includes(e.a) && ids.includes(e.b)), 'no dangling edges');
console.log('ok merge', ids.join(','));
console.log('sync tests passed');
// serialize with now:0 is stable (used to detect changes)
{ const w = mk(); const a = JSON.stringify(S.serialize([w], { now: 0 })), b = JSON.stringify(S.serialize([w], { now: 0 })); assert.strictEqual(a, b); console.log('ok stable serialize'); }
