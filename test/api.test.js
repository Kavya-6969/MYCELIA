// Run: node server.js (other terminal), then node test/api.test.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const base = process.env.BASE || 'http://localhost:3000';
const nodes = [{ id: 'p1', title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks', tags: ['rag', 'nlp'], topic: 'Generation', x: 360, y: 215 }, { id: 'p2', title: 'BERT language model pretraining', tags: ['transformer', 'nlp'], topic: 'Models', x: 360, y: 10 }];
const post = async b => { const r = await fetch(base + '/api/ingest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() }; };
(async () => {
  let r = await post({ kind: 'file', filename: 'sample.pdf', data: fs.readFileSync(path.join(__dirname, 'sample.pdf')).toString('base64'), nodes });
  assert.equal(r.status, 200); assert(r.body.node.title === 'Attention Is All You Need'); assert(r.body.node.tags.includes('transformer')); assert(r.body.edges.length >= 1);
  assert(Number.isFinite(r.body.node.x) && Number.isFinite(r.body.node.y));
  r = await post({ kind: 'text', text: 'Late interaction for long-tail entities\nWe show late interaction outperforms dense retrieval.', nodes }); assert.equal(r.status, 200); assert.equal(r.body.node.type, 'note');
  r = await post({ kind: 'url', url: 'http://127.0.0.1/x', nodes }); assert.equal(r.status, 400);
  r = await post({ kind: 'file', filename: 'x.exe', data: 'AAAA', nodes }); assert.equal(r.status, 415);
  r = await post({ kind: 'file', filename: 'bad.pdf', data: 'AAAA', nodes }); assert.equal(r.status, 415);
  r = await post({ kind: 'text', text: '', nodes }); assert.equal(r.status, 400);
  console.log('api tests passed');
})().catch(e => { console.error(e); process.exit(1); });
