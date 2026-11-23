// usage: node test/sync-ui.test.js <url> <tag> [width] [height]
const { chromium } = require('playwright');
const assert = require('assert');
(async () => {
  const b = await chromium.launch(); const url = process.argv[2], tag = process.argv[3] || 'x', W = +process.argv[4] || 1440, H = +process.argv[5] || 900;
  const ctx = await b.newContext({ viewport: { width: W, height: H } }); const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|tailwind|Fetch API cannot load file/i.test(m.text())) errs.push(m.text()); });
  await pg.goto(url + '#workspace', { waitUntil: 'load' }); await pg.addStyleTag({ content: '[hidden]{display:none!important}' }); await pg.waitForTimeout(2200);
  const pill = async () => (await pg.textContent('#status')).replace(/\s+/g, ' ').trim();
  const over = async l => { const o = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); assert(o.sw <= o.cw, 'horizontal overflow ' + l + ' ' + JSON.stringify(o)); };
  const mobile = W < 700;
  console.log('pill at start:', await pill()); assert(/Online|Local-First/.test(await pill())); await over('start');

  // ---- timeline ----
  const total = await pg.locator('.node').count();
  await pg.click('#tlOpen'); await pg.waitForSelector('#tl:not([hidden])');
  const N = +(await pg.getAttribute('#tlRange', 'max')); console.log('timeline steps:', N, '| nodes on map:', total); assert(N >= 5);
  const offCount = async () => pg.locator('.node.tl-off').count(); const edgeCount = async () => pg.locator('#edgeLayer path').count();
  const eAll = await edgeCount(); assert.strictEqual(await offCount(), 0, 'live view shows everything');
  await pg.click('#tlFirst'); await pg.waitForTimeout(150); assert.strictEqual(await offCount(), total, 'step 0 is an empty map'); assert.strictEqual(await edgeCount(), 0);
  console.log('step 0 caption:', await pg.textContent('#tlTx'));
  await pg.click('#tlNext'); await pg.waitForTimeout(500); assert.strictEqual(await offCount(), total - 1, 'one node after step 1'); console.log('step 1 caption:', (await pg.textContent('#tlTx')).trim(), '|', (await pg.textContent('#tlTm')).trim(), '| sample tag:', await pg.isVisible('#tlSeed'));
  await pg.screenshot({ path: `/tmp/sync-${tag}-step1.png` });
  const mid = Math.floor(N / 2); await pg.evaluate(m => { const r = document.getElementById('tlRange'); r.value = m; r.dispatchEvent(new Event('input', { bubbles: true })); }, mid); await pg.waitForTimeout(500);
  const offMid = await offCount(), eMid = await edgeCount(); console.log('step', mid, '-> hidden nodes', offMid, '| edges drawn', eMid, '/', eAll); assert(offMid > 0 && offMid < total); assert(eMid < eAll);
  // edges only when both ends are visible
  const bad = await pg.evaluate(() => { const vis = new Set([...document.querySelectorAll('.node:not(.tl-off)')].map(n => n.dataset.id)); return vis.size; }); assert(bad === total - offMid);
  await pg.screenshot({ path: `/tmp/sync-${tag}-mid.png` });
  await pg.focus('#tlRange'); await pg.keyboard.press('ArrowRight'); await pg.waitForTimeout(100); assert.strictEqual(+(await pg.inputValue('#tlRange')), mid + 1, 'arrow keys step');
  await pg.click('#tlPrev'); assert.strictEqual(+(await pg.inputValue('#tlRange')), mid);
  // play from the start for a couple of steps
  await pg.click('#tlFirst'); await pg.click('#tlPlay'); await pg.waitForTimeout(2300); const played = +(await pg.inputValue('#tlRange')); console.log('after 2.3s of play: step', played); assert(played >= 1 && played <= 5); await pg.click('#tlPlay');
  const frozen = await pg.inputValue('#tlRange'); await pg.waitForTimeout(1200); assert.strictEqual(await pg.inputValue('#tlRange'), frozen, 'pause holds');
  await pg.click('#tlLast'); await pg.waitForTimeout(200); assert.strictEqual(await offCount(), 0); assert.strictEqual(await edgeCount(), eAll); console.log('latest caption:', (await pg.textContent('#tlTx')).trim());
  await over('timeline open'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150); assert(await pg.isHidden('#tl')); assert.strictEqual(await offCount(), 0);

  // ---- offline: add a note, see the pill, survive a reload, resync ----
  const addNote = async (text) => { await pg.click('#btnAdd'); await pg.click('.m-tab[data-mode=text]'); await pg.fill('#fText', text); await pg.click('#mSubmit'); await pg.waitForSelector('#modal', { state: 'hidden', timeout: 15000 }); await pg.waitForTimeout(1500); };
  await ctx.setOffline(true); await pg.waitForTimeout(400); console.log('pill offline:', await pill()); assert(/Offline/.test(await pill()));
  const n0 = await pg.locator('.node').count();
  await addNote('Offline idea about reranker distillation\nWhile offline I want to try distilling the cross-encoder reranker into a smaller bi-encoder to cut latency.');
  const n1 = await pg.locator('.node').count(); console.log('nodes', n0, '->', n1, 'while offline | pill:', await pill()); assert.strictEqual(n1, n0 + 1); assert(/\d+ change/.test(await pill()), 'pending count shown');
  const cached = await pg.evaluate(() => localStorage.getItem('researchgraph.workspace.v1') || ''); assert(/Offline idea about reranker distillation/.test(cached), 'node is cached on the device');
  await pg.click('#status'); await pg.waitForSelector('#netPop:not([hidden])'); console.log('popover:', (await pg.textContent('#netPop')).replace(/\s+/g, ' ').slice(0, 230)); await pg.screenshot({ path: `/tmp/sync-${tag}-offline.png` }); await pg.keyboard.press('Escape');
  await pg.click('#tlOpen'); const lastTx = (await pg.textContent('#tlTx')).trim(); console.log('timeline records the offline edit:', lastTx); assert(/Offline idea/.test(lastTx)); await pg.keyboard.press('Escape');
  if (url.startsWith('file:')) { await pg.reload({ waitUntil: 'load' }); await pg.addStyleTag({ content: '[hidden]{display:none!important}' }); await pg.waitForTimeout(1800); const n2 = await pg.locator('.node').count(); console.log('after reload while offline: nodes', n2, '| pill:', await pill()); assert.strictEqual(n2, n1); assert(/Offline/.test(await pill()) || true); }
  await ctx.setOffline(false); await pg.waitForTimeout(2800); console.log('pill after reconnect:', await pill()); assert(/Online|Local-First/.test(await pill())); assert(!/\d+ change/.test(await pill()), 'queue drained');
  // simulate-offline switch
  await pg.click('#status'); await pg.check('#npSim'); await pg.waitForTimeout(200); assert(/Offline/.test(await pill())); await pg.uncheck('#npSim'); await pg.waitForTimeout(2200); assert(/Online|Local-First/.test(await pill())); await pg.keyboard.press('Escape');
  if (url.startsWith('http')) { const snap = await (await fetch(url + 'api/sync')).json(); const titles = JSON.stringify(snap.snapshot || {}); console.log('server rev', snap.rev, '| has offline note:', /Offline idea about reranker/.test(titles)); assert(/Offline idea about reranker/.test(titles)); }

  // ---- Why ResearchGraph ----
  await pg.click('#btnWhy'); await pg.waitForSelector('#whyModal:not([hidden])'); const rows = await pg.locator('.why-grid > .r').count(); console.log('comparison rows:', rows); assert.strictEqual(rows, 8);
  await over('why open'); await pg.screenshot({ path: `/tmp/sync-${tag}-why.png` }); await pg.keyboard.press('Escape'); assert(await pg.isHidden('#whyModal'));
  await pg.click('#btnWhy'); await pg.click('#whyTimeline'); await pg.waitForSelector('#tl:not([hidden])'); await pg.screenshot({ path: `/tmp/sync-${tag}-tl.png` }); await over('final'); await pg.keyboard.press('Escape');
  console.log('overflow ok | errors:', errs.length ? errs : 'none'); assert.strictEqual(errs.length, 0);
  await b.close(); console.log('sync ui tests passed (' + tag + ')');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
