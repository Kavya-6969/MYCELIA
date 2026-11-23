// usage: node test/ask-ui.test.js <url>   (fresh server: RG_DB_FILE=/tmp/x.db PORT=3199 node server.js)
const { chromium } = require('playwright'); const assert = require('assert');
const url = process.argv[2] || 'http://localhost:3199/';
(async () => {
  const b = await chromium.launch(), pg = await b.newPage({ viewport: { width: 1440, height: 900 } }), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && !/favicon|ERR_|net::/.test(m.text()) && errs.push(m.text()));
  await pg.goto(url + '#workspace', { waitUntil: 'load' }); await pg.waitForTimeout(1500);
  await pg.click('.tab[data-tab=ask]');
  assert.ok(await pg.isVisible('#askPane') && !(await pg.isVisible('#goalForm')), 'ask column replaces the goal box');
  assert.strictEqual(await pg.locator('#askLog .chip-s').count(), 4, 'empty state offers 4 starter questions');
  await pg.click('#askLog .chip-s >> nth=0');
  await pg.waitForSelector('.msg.pending'); await pg.waitForSelector('.msg.bot:not(.pending)', { timeout: 8000 });
  assert.ok(/items/.test(await pg.textContent('.msg.bot .bub')), 'summary answer');
  // free-text question with citations
  await pg.fill('#askIn', 'which experiment performs best?'); await pg.press('#askIn', 'Enter');
  await pg.waitForFunction(() => document.querySelectorAll('.msg.bot:not(.pending)').length === 2, null, { timeout: 8000 });
  const cites = await pg.locator('.msg.bot >> nth=1 >> .cite').count(); assert.ok(cites >= 1, 'answer has citation chips: ' + cites);
  assert.ok(/canvas/.test(await pg.textContent('.msg.bot >> nth=1 >> .msg-foot')), 'honest source label');
  await pg.click('.msg.bot >> nth=1 >> .cite >> nth=0'); await pg.waitForTimeout(300);
  assert.ok(await pg.locator('.node.hl, .node.sel').count() >= 1, 'citation highlights the node on the canvas');
  // persistence + clear
  await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(1200); await pg.click('.tab[data-tab=ask]');
  assert.strictEqual(await pg.locator('.msg.user').count(), 2, 'chat survives reload');
  // no overflow, other tabs still work
  const o = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth, document.getElementById('askLog').scrollWidth <= document.getElementById('askLog').clientWidth]);
  assert.ok(o[0] <= o[1] && o[2], 'no horizontal overflow ' + o);
  await pg.click('#askClear'); assert.strictEqual(await pg.locator('.msg').count(), 0);
  await pg.click('.tab[data-tab=all]'); assert.ok(await pg.isVisible('#goalForm') && !(await pg.isVisible('#askPane')));
  await pg.setViewportSize({ width: 390, height: 800 }); await pg.waitForTimeout(300);
  assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone width ok');
  console.log('errors:', errs.length ? errs : 'none'); assert.strictEqual(errs.length, 0);
  await pg.screenshot({ path: '/tmp/rgd/ask-phone.png' });
  await b.close(); console.log('ASK UI PASS');
})().catch(e => { console.error(e); process.exit(1); });
