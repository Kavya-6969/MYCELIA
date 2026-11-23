// node test/writer-ui.test.js : the standalone page (no server), with a stand-in for the viewer's `sample` capability
const { chromium } = require('playwright'); const assert = require('assert'); const path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'dist', 'artifact.html');
const FAKE = `window.claude = { use: async n => n === 'sample' ? Object.assign(async (input) => {
  const text = typeof input === 'string' ? input : input.map(t => t.content).join('\\n');
  window.__calls = (window.__calls || 0) + 1;
  if (typeof input === 'string' && /Writer agent/.test(input)) { const m = input.match(/goal:\\n"([^"]*)"/); return { text: JSON.stringify({ title: 'Ten anime to start with', body: Array.from({length: 10}, (_, i) => (i + 1) + '. Anime title ' + (i + 1) + ': a short reason').join('\\n'), tags: ['anime'] }), truncated: false }; }
  return { text: 'Claude says: the canvas holds **papers** [1].', truncated: false };
}, { json: async () => ({}), limits: async () => ({}) }) : null };`;
(async () => {
  const b = await chromium.launch(); const errs = [];
  // ---- with Claude available ----
  let pg = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  pg.on('pageerror', e => errs.push(e.message)); await pg.addInitScript(FAKE);
  await pg.goto(url + '#workspace', { waitUntil: 'load' }); await pg.addStyleTag({ content: '[hidden]{display:none!important}' }); await pg.waitForTimeout(1500);
  assert.strictEqual(await pg.locator('.ag').count(), 5, 'five agent cards'); assert.ok(await pg.locator('.ag[data-agent=writer]').count(), 'writer card');
  assert.ok(await pg.isChecked('#autoAdd'), 'auto-add on by default');
  const before = await pg.locator('.node').count();
  await pg.fill('#goalIn', 'give me a list of 10 anime'); await pg.press('#goalIn', 'Enter');
  await pg.waitForSelector('.node.t-note .n-body', { timeout: 20000 });
  await pg.waitForFunction(() => { const n = [...document.querySelectorAll('.node.t-note')].find(x => x.querySelector('.n-body')); return n && !n.classList.contains('pending'); }, null, { timeout: 8000 });
  const body = await pg.textContent('.node.t-note .n-body'); assert.ok(/1\. Anime title 1/.test(body) && /10\. Anime title 10/.test(body), 'the list is on the card: ' + body.slice(0, 60));
  assert.strictEqual(await pg.locator('.node').count(), before + 1, 'exactly one node added');
  assert.ok(/AI Note/.test(await pg.textContent('.node.t-note:has(.n-body) .n-type')), 'labelled AI Note');
  assert.ok(/AI-generated/.test(await pg.textContent('.node.t-note:has(.n-body) .n-meta')), 'honest label');
  assert.strictEqual(await pg.locator('.node:has(.n-body) .gbadge').count(), 0, 'no fake grounding badge on a written note');
  assert.ok(await pg.locator('.prop.approved').count() >= 1, 'proposal shows approved');
  console.log('ok: goal -> note on canvas, auto-added');
  // auto-add off: needs approval
  await pg.uncheck('#autoAdd'); await pg.fill('#goalIn', 'write a short list of 3 books'); await pg.press('#goalIn', 'Enter');
  await pg.waitForSelector('.prop.pending', { timeout: 20000 }); await pg.waitForTimeout(1500);
  assert.ok(await pg.locator('.prop.pending').count() === 1, 'waits for approval when auto-add is off'); assert.strictEqual(await pg.locator('.node.pending').count(), 1);
  await pg.click('.prop.pending .app'); await pg.waitForTimeout(600); assert.strictEqual(await pg.locator('.node.pending').count(), 0);
  console.log('ok: auto-add off waits for Approve');
  // Ask AI uses Claude
  await pg.click('.tab[data-tab=ask]'); await pg.fill('#askIn', 'what is on this canvas?'); await pg.press('#askIn', 'Enter');
  await pg.waitForSelector('.msg.bot:not(.pending)', { timeout: 8000 });
  assert.ok(/Claude says/.test(await pg.textContent('.msg.bot .bub')) && /Claude/.test(await pg.textContent('.msg.bot .msg-foot')), 'Ask answered by Claude');
  assert.ok(/Claude connected/.test(await pg.textContent('#askMode')));
  assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no overflow');
  console.log('ok: Ask uses Claude');
  await pg.close();
  // ---- no Claude: honest fallback ----
  pg = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url + '#workspace', { waitUntil: 'load' }); await pg.addStyleTag({ content: '[hidden]{display:none!important}' }); await pg.waitForTimeout(1500);
  await pg.fill('#goalIn', 'give me a list of 10 anime'); await pg.press('#goalIn', 'Enter'); await pg.waitForTimeout(4500);
  assert.ok(/no AI model is connected/.test(await pg.textContent('#feed')), 'explains that no model is connected');
  assert.strictEqual(await pg.locator('.node.t-note .n-body').count(), 0);
  await pg.click('.tab[data-tab=ask]'); assert.ok(/Answers from your canvas/.test(await pg.textContent('#askMode')));
  console.log('ok: no model -> honest message');
  assert.ok(/not available/.test(await pg.textContent('#aiChip')) && await pg.locator('#aiChip.off').count() === 1, 'chip says AI not available');
  await pg.click('.tab[data-tab=all]'); await pg.click('#aiChip'); await pg.waitForSelector('#toast:not([hidden])'); assert.ok(/not available in this view/.test(await pg.textContent('#toast')), 'chip click explains');
  await pg.context().close();
  // ---- Claude arrives late (use() resolves after 2s): a goal sent in the meantime still waits and writes ----
  const SLOW = FAKE.replace("window.claude = { use: async n => n === 'sample' ?", "window.claude = { use: async n => (await new Promise(r => setTimeout(r, 2000)), n === 'sample') ?");
  pg = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); await pg.addInitScript(SLOW);
  await pg.goto(url + '#workspace', { waitUntil: 'load' }); await pg.addStyleTag({ content: '[hidden]{display:none!important}' }); await pg.waitForTimeout(300);
  assert.ok(await pg.locator('#aiChip.wait').count() === 1, 'chip shows checking'); 
  await pg.fill('#goalIn', 'give me a list of 10 anime'); await pg.press('#goalIn', 'Enter');
  await pg.waitForSelector('.node.t-note .n-body', { timeout: 25000 }); assert.ok(await pg.locator('#aiChip.ok').count() === 1 && /Claude ready/.test(await pg.textContent('#aiChip')));
  await pg.click('#aiChip'); await pg.waitForFunction(() => /Claude answered: Claude says/.test(document.getElementById('toast').textContent), null, { timeout: 8000 });
  console.log('ok: late capability still writes; chip test works'); await pg.context().close();
  // ---- viewer refuses permission: clear message, nothing added ----
  const DENY = FAKE.replace("Object.assign(async (input) => {", "Object.assign(async (input) => { throw Object.assign(new Error('declined'), { code: 'not_granted' });");
  pg = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); await pg.addInitScript(DENY);
  await pg.goto(url + '#workspace', { waitUntil: 'load' }); await pg.addStyleTag({ content: '[hidden]{display:none!important}' }); await pg.waitForTimeout(1200);
  const n0 = await pg.locator('.node').count();
  await pg.fill('#goalIn', 'give me a list of 10 anime'); await pg.press('#goalIn', 'Enter'); await pg.waitForTimeout(5500);
  assert.ok(/did not allow the AI model/.test(await pg.textContent('#feed')), 'refusal explained in the feed'); assert.ok(/did not allow the AI model/.test(await pg.textContent('#toast')), 'and on screen'); assert.strictEqual(await pg.locator('.node').count(), n0);
  console.log('ok: permission refused -> explained'); console.log('errors:', errs.length ? errs : 'none'); assert.strictEqual(errs.length, 0);
  await b.close(); console.log('WRITER UI PASS');
})().catch(e => { console.error(e); process.exit(1); });
