const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const assert = require('assert');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + process.cwd() + '/test.html'); await p.waitForSelector('[data-node]');
  const C = s => p.locator(s).count(), T = s => p.locator(s).first().innerText();
  const click = s => p.locator(s).first().evaluate(e => e.click());
  assert.equal(await C('[data-node]'), 8); console.log('8 nodes');
  assert.equal(await C('[data-type=paper]'), 3); assert.equal(await C('[data-type=thought]'), 1); assert.equal(await C('[data-type=experiment]'), 1);
  assert.equal(await C('[data-type=dataset]'), 2); assert.equal(await C('[data-type=code]'), 1);
  assert.equal(await T('#tNodes'), '9'); const s0 = await T('#tSrc'), h0 = await T('#tHrs'); console.log('telemetry', await T('#tNodes'), s0, h0);
  // grounded badge text + highlight
  const g = await p.locator('[data-ground=x1]').innerText(); assert.match(g, /96% Grounded • Ref: Source #\d/); console.log(g);
  // tags filter
  await click('[data-tag=Datasets]'); const dimmed = await p.locator('[data-node]').evaluateAll(es => es.filter(e => e.style.opacity === '0.22').length); assert.equal(dimmed, 5); await click('[data-tag=Datasets]');
  await p.fill('#search', 'reranker'); assert.match(await T('#hits'), /1 of 8/); await p.fill('#search', '');
  // artifact click selects + centers
  await click('[data-art=p3]'); assert.equal(await p.locator('[data-node=p3]').evaluate(e => e.style.borderColor), 'rgb(129, 140, 248)');
  // trace modal
  await click('[data-trace=t1]'); assert.equal(await C('#traceModal li'), 5); await p.keyboard.press('Escape'); assert.equal(await C('#traceModal'), 0);
  // what-if
  await p.locator('[data-node=x1]').dispatchEvent('pointerdown', { button: 0, pointerId: 1 }).catch(()=>{});
  await p.evaluate(() => { const el = document.querySelector('[data-node=x1]'); const o = { bubbles: true, button: 0, pointerId: 5, clientX: 500, clientY: 400 }; el.setPointerCapture = () => {}; el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); });
  await p.waitForSelector('#whatif'); const a0 = await T('#wiAcc'); console.log('what-if open', a0);
  await p.locator('#sl-lr').evaluate(e => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, '10'); e.dispatchEvent(new Event('input', { bubbles: true })); });
  const a1 = await T('#wiAcc'); assert.notEqual(a0, a1); console.log('lr moved', a1, await T('#wiAccD'), await T('#wiLatD'));
  await p.locator('#sl-ctx').evaluate(e => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, '5'); e.dispatchEvent(new Event('input', { bubbles: true })); });
  console.log('ctx', await T('#val-ctx'), await T('#wiLat'));
  await click('#wiApply'); await click('#wiReset'); await p.keyboard.press('Escape'); assert.equal(await C('#whatif'), 0);
  // approval flow
  await p.waitForSelector('[data-act=approve]', { timeout: 8000 }); assert.match(await T('[data-proposal=pending]'), /Critic:/);
  console.log('proposal', (await T('[data-proposal=pending]')).split('\n').slice(0, 3).join(' | '));
  const lit0 = await T('[data-score=lit]'); await click('[data-act=approve]');
  await p.waitForFunction(() => document.querySelectorAll('[data-node]').length === 9); assert.equal(await T('#tNodes'), '10'); console.log('spawned; nodes linked', await T('#tNodes'), await T('#tSrc'), await T('#tHrs'), 'score', lit0, '->', await T('[data-score=lit]'));
  // next proposal then reject
  await p.waitForSelector('[data-act=reject]', { timeout: 10000 }); const e0 = await T('[data-score=env]'); await click('[data-act=reject]');
  await p.waitForFunction(() => document.querySelectorAll('[data-node]').length === 9); console.log('rejected', e0, '->', await T('[data-score=env]'));
  // cluster
  await click('#btnCluster'); await p.waitForTimeout(300);
  const xs = await p.locator('[data-type=paper]').evaluateAll(es => es.map(e => e.style.left)); assert.equal(new Set(xs).size, 1); console.log('clustered paper col', xs[0]);
  await click('#btnCluster'); await p.waitForTimeout(100);
  // timeline
  await click('#tlToggle'); assert.match(await T('#tlCount'), /9 \/ 9/);
  await p.locator('#tlRange').evaluate(e => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, '2'); e.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await C('[data-node]'), 3); console.log('scrub 2 ->', await T('#tlCaption'));
  await click('#tlNext'); assert.equal(await C('[data-node]'), 4); await click('#tlPrev'); assert.equal(await C('[data-node]'), 3);
  await click('#tlPlay'); await p.waitForFunction(() => document.querySelectorAll('[data-node]').length === 9, null, { timeout: 8000 }); console.log('replay reached live');
  // add source
  await click('#btnAdd'); await p.fill('#fTitle', 'Scaling laws for dense retrieval'); await click('#addSubmit');
  await p.waitForFunction(() => document.querySelectorAll('[data-node]').length === 10); console.log('added; linked', await T('#tNodes'));
  // export
  await click('#btnExport'); const md = await T('#md-pre'); assert.match(md, /## Papers/); assert.match(md, /→ _simulates_ →/); assert.match(md, /Scaling laws/); await p.keyboard.press('Escape');
  // demo reload
  await click('#btnDemo'); await p.waitForFunction(() => document.querySelectorAll('[data-node]').length === 1, null, { timeout: 3000 }).catch(()=>{});
  await p.waitForFunction(() => document.querySelectorAll('[data-node]').length === 8, null, { timeout: 12000 }); console.log('demo replayed to 8');
  // narrow viewport smoke
  await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(200); assert.ok(await C('[data-node]') > 0);
  console.log('errors:', errs.length ? errs : 'none'); assert.equal(errs.length, 0);
  await b.close(); console.log('ALL PASS');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
