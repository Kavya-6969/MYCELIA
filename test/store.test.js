// node --no-warnings test/store.test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const Store = require('../src/store.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rgstore-')), file = path.join(dir, 't.db');
const snap = { v: 1, clientId: 'c1', ws: [{ id: 'w1', name: 'A', nodes: [{ id: 'n1', type: 'paper', title: 'T', tags: ['x'], ut: 1 }], edges: [] }] };
let s = Store.open({ file });
assert.strictEqual(s.engine, 'sqlite');
assert.strictEqual(s.load().snapshot, null);
s.save({ rev: 1, updatedAt: 10, snapshot: snap }, { merged: false });
s.save({ rev: 2, updatedAt: 20, snapshot: snap }, { merged: true });
s.close();
s = Store.open({ file });                                   // reopen: data survives
const L = s.load(); assert.strictEqual(L.rev, 2); assert.strictEqual(L.snapshot.ws[0].name, 'A');
const i = s.info(); assert.deepStrictEqual([i.workspaces, i.nodes, i.log.length, i.log[0].merged], [1, 1, 2, true]);
s.reset(); assert.strictEqual(s.load().snapshot, null); assert.strictEqual(s.info().nodes, 0); s.close();
// legacy sync.json is imported once
const lj = path.join(dir, 'old.json'); fs.writeFileSync(lj, JSON.stringify({ rev: 7, updatedAt: 5, snapshot: snap }));
const s2 = Store.open({ file: path.join(dir, 'n.db'), legacyJson: lj });
assert.strictEqual(s2.load().rev, 7); assert.ok(s2.imported); s2.close();
console.log('store tests passed');
