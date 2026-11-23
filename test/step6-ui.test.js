// usage: node test/step6-ui.test.js <url>   (needs a fresh server: RG_SYNC_FILE=/tmp/x.json PORT=3201 node server.js)
const { chromium } = require('playwright');
const assert = require('assert');
(async () => {
  const b = await chromium.launch(), url = process.argv[2];
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }), pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|tailwind|Fetch API|fonts/i.test(m.text())) errs.push(m.text()); });
  await pg.goto(url + '#workspace', { waitUntil: 'load' }); await pg.addStyleTag({ content: '[hidden]{display:none!important}' }); await pg.waitForTimeout(1800); await pg.uncheck('#autoAdd');
  const C = s => pg.locator(s).count(), T = async s => (await pg.locator(s).first().innerText()).replace(/\s+/g, ' ').trim();
  const click = s => pg.locator(s).first().evaluate(e => e.click());
  const toastTxt = async () => (await pg.textContent('#toast')).trim();
  // header
  assert.match(await T('#status'), /Local-First Synced/); console.log('pill:', await T('#status'));
  assert.equal(await C('#btnDemo'), 1); assert.match(await pg.getAttribute('#btnExport', 'title'), /Markdown/);
  assert.equal(await T('#clusterLbl'), 'Cluster');
  console.log('telemetry:', await T('#tNodes'), await T('#tSrc'), await T('#tHrs'));
  assert(+(await T('#tNodes')) > 10 && +(await T('#tSrc')) >= 8);
  // quick filters
  assert.equal(await C('#pills [data-pill]'), 4);
  await click('[data-pill=AgentThought]'); let dim = await pg.locator('.node.dim').count(), all = await C('.node'); assert.equal(all - dim, 1, 'one AI node in w1'); await click('[data-pill=AgentThought]');
  await click('[data-pill=Datasets]'); dim = await pg.locator('.node.dim').count(); console.log('datasets pill matches', all - dim); assert(all - dim >= 3); await click('[data-pill=Datasets]');
  assert.equal(await pg.locator('.node.dim').count(), 0);
  // artifacts list
  assert((await C('#artList [data-art]')) >= 12); await click('#artList [data-art=p3]'); assert.equal(await pg.locator('.node[data-id=p3]').evaluate(e => e.classList.contains('sel')), true);
  // grounding + trace
  const gb = pg.locator('.node[data-id=x1] .gbadge'); const gt = (await gb.innerText()).trim(); console.log('badge:', gt); assert.match(gt, /^\d+% Grounded • Ref: Source #\d+$/);
  await gb.evaluate(e => e.click()); await pg.waitForTimeout(150); await pg.uncheck('#autoAdd'); assert(await pg.locator('.node.hl').count() >= 1); console.log('toast:', await toastTxt());
  await click('.node[data-id=x1] .trace-btn'); assert.equal(await C('#trSteps li'), 6); console.log('trace:', await T('#trSub')); await pg.keyboard.press('Escape'); assert.equal(await pg.locator('#traceModal').isHidden(), true);
  // what-if has context window slider
  await pg.locator('.node[data-id=x1] .n-title').click(); await pg.waitForSelector('#wiAcc');
  assert.equal(await C('#whatif .prm'), 7); console.log('what-if params:', (await pg.locator('#whatif .prm label').allInnerTexts()).join(', ')); await click('#wiClose');
  // approve flow shows critic + new label
  await pg.fill('#goalIn', 'Review related work on retrieval'); await pg.keyboard.press('Enter');
  await pg.waitForSelector('.prop.pending .critic', { timeout: 20000 });
  const lab = await T('.prop.pending [data-act=approve]'); assert.match(lab, /Approve & (Spawn Node|Run)/); console.log('approve label:', lab, '|', await T('.prop.pending .critic'));
  // workspaces delete
  assert.equal(await C('#wsList .ws-wrap'), 3);
  await pg.locator('#wsList .ws-wrap').nth(2).hover(); await click('#wsList .ws-wrap:nth-child(3) .ws-del');
  assert.equal(await C('#wsList .ws-wrap'), 3); assert.match(await T('#wsList .ws-del.armed'), /Delete\?/); console.log('armed toast:', await toastTxt());
  await click('#wsList .ws-del.armed'); await pg.waitForTimeout(200); await pg.uncheck('#autoAdd'); assert.equal(await C('#wsList .ws-wrap'), 2); console.log('deleted ->', await pg.locator('#wsList .ws-name').allInnerTexts());
  // delete the active one
  await click('#wsList .ws-wrap:nth-child(1) .ws-del'); await click('#wsList .ws-del.armed'); await pg.waitForTimeout(250); await pg.uncheck('#autoAdd');
  assert.equal(await C('#wsList .ws-wrap'), 1); assert.match(await T('#wsName'), /Protein/); assert((await C('.node')) > 0);
  // last one cannot be deleted
  await click('#wsList .ws-del'); assert.match(await toastTxt(), /at least one/); assert.equal(await C('#wsList .ws-wrap'), 1);
  // persistence: reload keeps deletion
  await pg.waitForTimeout(1500); await pg.uncheck('#autoAdd'); await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(1800);
  assert.equal(await C('#wsList .ws-wrap'), 1); console.log('after reload:', await pg.locator('#wsList .ws-name').allInnerTexts());
  // server snapshot respects deletion
  const snap = await pg.evaluate(async () => (await (await fetch('/api/sync')).json()));
  if (snap && snap.snapshot) { console.log('server ws:', snap.snapshot.ws.map(w => w.id), 'gone:', Object.keys(snap.snapshot.gone || {})); assert(!snap.snapshot.ws.some(w => w.id === 'w1' || w.id === 'w3')); }
  // demo
  await click('#btnDemo'); await pg.waitForTimeout(400); await pg.uncheck('#autoAdd');
  await pg.waitForFunction(() => document.querySelectorAll('#wsList .ws-wrap').length === 3, null, { timeout: 8000 }); await pg.waitForTimeout(900); await pg.uncheck('#autoAdd');
  console.log('demo: workspaces back to', await C('#wsList .ws-wrap'), '| timeline open:', await pg.locator('#tl').isVisible());
  assert.equal(await pg.locator('#tl').isVisible(), true);
  const ov = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); assert(ov.sw <= ov.cw + 1);
  console.log('errors:', errs.length ? errs : 'none'); assert.equal(errs.length, 0);
  await b.close(); console.log('STEP6 UI PASS');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
