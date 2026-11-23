// node test/notes-ui.test.js : goals are carried out automatically (no manual approval)
const { chromium } = require('playwright'); const assert = require('assert'); const path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'dist', 'artifact.html');
const FAKE = `window.claude = { use: async n => n === 'sample' ? Object.assign(async (input) => {
  const t = typeof input === 'string' ? input : input.map(x => x.content).join('\\n');
  if (/exactly 5 separate notes/.test(t)) return { text: JSON.stringify({ notes: ['Vande Bharat Express','Gatimaan Express','Shatabdi Express','Rajdhani Express','Tejas Express'].map((x, i) => ({ title: x, body: 'Fact about ' + x + '. Top speed ' + (160 - i) + ' km/h.', tags: ['train'] })) }), truncated: false };
  return { text: '{}', truncated: false };
}, { json: async () => ({}), limits: async () => ({}) }) : null };`;
const open = async (b, fake) => { const pg = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); if (fake) await pg.addInitScript(fake); await pg.goto(url + '#workspace', { waitUntil: 'load' }); await pg.addStyleTag({ content: '[hidden]{display:none!important}' }); await pg.waitForTimeout(1500); return pg; };
(async () => {
  const b = await chromium.launch(), errs = [];
  let pg = await open(b, FAKE); pg.on('pageerror', e => errs.push(e.message));
  assert.ok(await pg.isChecked('#autoAdd'), 'auto-approve defaults on');
  const before = await pg.locator('.node.t-note').count();
  await pg.fill('#goalIn', 'i want to create 5 notes of fastest train in india'); await pg.press('#goalIn', 'Enter');
  await pg.waitForFunction(n => document.querySelectorAll('.node.t-note:not(.pending)').length >= n + 5, before, { timeout: 25000 });
  assert.strictEqual(await pg.locator('.node.pending').count(), 0, 'nothing left waiting');
  const titles = await pg.locator('.node.t-note .n-title').allTextContents();
  ['Vande Bharat Express', 'Gatimaan Express', 'Tejas Express'].forEach(t => assert.ok(titles.includes(t), t));
  assert.ok(/Top speed/.test(await pg.locator('.node.t-note:has-text("Gatimaan") .n-body').textContent()), 'text on the card');
  console.log('ok: 5 notes added automatically with the model');
  // a specialist goal is approved without clicks too
  await pg.fill('#goalIn', 'Review related work on retrieval'); await pg.press('#goalIn', 'Enter');
  await pg.waitForFunction(() => document.querySelectorAll('.prop.approved').length >= 6, null, { timeout: 30000 });
  await pg.waitForTimeout(1200); assert.strictEqual(await pg.locator('.node.pending').count(), 0, 'literature proposals auto-approved');
  console.log('ok: other agents auto-approve');
  await pg.context().close();
  // no model: placeholders still land on the canvas
  pg = await open(b, null); pg.on('pageerror', e => errs.push(e.message));
  const b2 = await pg.locator('.node.t-note').count();
  await pg.fill('#goalIn', 'create 5 notes of fastest train in india'); await pg.press('#goalIn', 'Enter');
  await pg.waitForFunction(n => document.querySelectorAll('.node.t-note:not(.pending)').length >= n + 5, b2, { timeout: 25000 });
  assert.ok(/Placeholder/.test(await pg.locator('.node.t-note:has-text("fastest train") .n-meta').first().textContent()), 'labelled placeholder');
  assert.ok(await pg.locator('.node.t-note:has-text("fastest train") .n-edit').count() >= 5, 'Edit button available to fill them in');
  console.log('ok: no model -> 5 placeholder notes');
  assert.deepStrictEqual(errs, [], errs.join('|')); await b.close(); console.log('PASS notes-ui');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
