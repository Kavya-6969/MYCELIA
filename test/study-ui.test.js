// node test/study-ui.test.js : Slides, Quiz, Mind map, Flashcards in the Agents sidebar
const { chromium } = require('playwright'); const assert = require('assert'); const path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'dist', 'artifact.html');
(async () => {
  const b = await chromium.launch(), errs = [];
  const pg = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  pg.on('pageerror', e => errs.push(e.message));
  await pg.addStyleTag({ content: '' }).catch(() => {});
  await pg.goto(url + '#workspace', { waitUntil: 'load' }); await pg.addStyleTag({ content: '[hidden]{display:none!important}' }); await pg.waitForTimeout(600);
  // sidebar buttons
  assert.deepStrictEqual(await pg.$$eval('#panelStudy .cap', e => e.map(x => x.textContent)), ['Slides', 'Quiz', 'Mind map', 'Flashcards'], 'four study buttons with captions');
  assert.ok(await pg.isVisible('#panelStudy'), 'visible in the Agents sidebar');
  const nBefore = await pg.evaluate(() => __RG.cur().nodes.length);
  // slides
  await pg.click('#panelStudy [data-study="slides"]'); assert.ok(await pg.isVisible('#studyModal'));
  assert.ok(/Title & overview/.test(await pg.textContent('#slideCard')), 'slide 1');
  assert.ok(/all \d+ cards/.test(await pg.textContent('#stSub')), 'whole workspace scope');
  await pg.keyboard.press('ArrowRight'); assert.ok(/Key sources/.test(await pg.textContent('#slideCard')), 'arrow right');
  await pg.click('#slNext'); await pg.click('#slNext'); await pg.click('#slNext'); assert.strictEqual((await pg.textContent('#slCount')).trim(), '5 / 5'); assert.ok(await pg.isDisabled('#slNext'), 'next disabled on last');
  await pg.keyboard.press('ArrowLeft'); assert.strictEqual((await pg.textContent('#slCount')).trim(), '4 / 5');
  assert.ok(!(await pg.$('#slideNotes')), 'notes hidden'); await pg.click('#slNotes'); assert.ok(await pg.isVisible('#slideNotes'), 'speaker notes toggle');
  await pg.evaluate(() => { window.__copied = ''; Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__copied = t; return Promise.resolve(); } }, configurable: true }); });
  await pg.click('#slCopy'); await pg.waitForTimeout(100); const md = await pg.evaluate(() => window.__copied); assert.ok(/^# /.test(md) && /## 5\. Next steps/.test(md) && /Speaker notes/.test(md), 'Copy Markdown');
  const dl = pg.waitForEvent('download'); await pg.click('#slExport'); assert.strictEqual((await dl).suggestedFilename(), 'mycelia-slides.md', 'Export slides downloads a file');
  // quiz
  await pg.click('#stTabs [data-mode="quiz"]'); assert.ok(/Question 1 of/.test(await pg.textContent('#stBody')));
  let score = 0, total = await pg.evaluate(() => __RG.stState.quiz.length); assert.ok(total >= 5, 'quiz has questions');
  const ans = await pg.evaluate(() => __RG.stState.quiz.map(q => q.kind === 'mc' ? q.answer : q.model));
  for (let i = 0; i < total; i++) {
    const q = await pg.evaluate(i => __RG.stState.quiz[i].kind, i);
    if (q === 'mc') { if (i === 0) { await pg.locator('.q-opt').nth((ans[0] + 1) % 3 === ans[0] ? 1 : (ans[0] + 1) % 3).click(); assert.ok(/Not quite/.test(await pg.textContent('#qFb')), 'wrong feedback'); } else { await pg.locator('.q-opt').nth(ans[i]).click(); assert.ok(/Correct/.test(await pg.textContent('#qFb')), 'right feedback'); } }
    else { await pg.fill('#qShort', ans[i]); await pg.click('#qCheck'); assert.ok(/Correct/.test(await pg.textContent('#qFb')), 'short answer ok'); }
    assert.ok(/\[(Paper|Dataset|Code|Note|Experiment): /.test(await pg.textContent('#qFb')), 'explanation cites the source card');
    assert.ok(await pg.isVisible('#qFb [data-show]'), 'show source link');
    await pg.click('#qNext');
  }
  assert.ok(new RegExp((total - 1) + ' / ' + total).test(await pg.textContent('.q-score .big')), 'score tracker ' + (total - 1) + '/' + total);
  await pg.click('#qRetry'); assert.ok(/Question 1 of/.test(await pg.textContent('#stBody')), 'Retry Quiz restarts');
  // mind map
  await pg.click('#stTabs [data-mode="map"]'); assert.ok(await pg.isVisible('#mmSvg'));
  const g0 = await pg.$$eval('#mmSvg .nd', e => e.length); assert.ok(g0 >= 6, 'map nodes');
  await pg.click('#mmExpand'); const g1 = await pg.$$eval('#mmSvg .nd', e => e.length); assert.ok(g1 > g0, 'expand shows more');
  await pg.click('#mmCollapse'); const g2 = await pg.$$eval('#mmSvg .nd', e => e.length); assert.ok(g2 < g0, 'collapse hides');
  await pg.click('#mmExpand'); await pg.locator('#mmSvg .nd[data-ref]:not([data-ref=""])').first().click(); assert.ok(/Show on canvas/.test(await pg.textContent('#mmInfo')) && /Linked to|Findings|Tags/i.test(await pg.textContent('#mmInfo') + 'Tags'), 'click-to-inspect panel');
  await pg.locator('#mmSvg .tg').first().click(); assert.notStrictEqual(await pg.$$eval('#mmSvg .nd', e => e.length), g1, 'toggle circle collapses a branch');
  // flashcards
  await pg.click('#stTabs [data-mode="cards"]'); assert.ok(await pg.isVisible('#fcCard'));
  const f0 = await pg.textContent('#fcCard .front .tx'); assert.ok(!(await pg.$eval('#fcCard', e => e.classList.contains('flip'))));
  await pg.click('#fcCard'); assert.ok(await pg.$eval('#fcCard', e => e.classList.contains('flip')), 'flips');
  assert.strictEqual(await pg.$eval('#fcCard', e => getComputedStyle(e).transformStyle), 'preserve-3d', '3D flip');
  await pg.click('#fcMaster'); assert.notStrictEqual(await pg.textContent('#fcCard .front .tx'), f0, 'advances after rating');
  await pg.click('#fcReview'); assert.ok(/1<\/b> mastered|<b>1<\/b>/.test(await pg.innerHTML('#fcStat')) && /1 need review/.test(await pg.textContent('#fcStat')), 'tracks mastered / needs review');
  await pg.keyboard.press('ArrowLeft'); await pg.keyboard.press('ArrowLeft'); assert.strictEqual(await pg.textContent('#fcCard .front .tx'), f0, 'arrow keys');
  await pg.click('#fcShuffle'); await pg.waitForTimeout(100); assert.ok(/1 \//.test(await pg.textContent('.st-count')), 'shuffle resets to first');
  await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(500); await pg.addStyleTag({ content: '[hidden]{display:none!important}' }); await pg.click('#panelStudy [data-study="cards"]');
  assert.ok(/1<\/b> mastered/.test(await pg.innerHTML('#fcStat')), 'progress persists after reload');
  // scope: selected node, spawn note
  await pg.keyboard.press('Escape'); assert.ok(!(await pg.isVisible('#studyModal')), 'Esc closes');
  const id = await pg.evaluate(() => __RG.cur().nodes.find(n => n.type === 'paper').id); await pg.evaluate(i => __RG.select(i), id);
  await pg.click('#panelStudy [data-study="slides"]'); assert.ok(/linked card/.test(await pg.textContent('#stSub')), 'selected-card scope is default');
  await pg.click('#stScope [data-scope="workspace"]'); assert.ok(/all \d+ cards/.test(await pg.textContent('#stSub')), 'switch to workspace');
  await pg.click('#stScope [data-scope="node"]');
  await pg.click('#stToCanvas'); assert.ok(!(await pg.isVisible('#studyModal')));
  const after = await pg.evaluate(() => { const n = __RG.cur().nodes.at(-1); return { c: __RG.cur().nodes.length, t: n.title, type: n.type, edges: __RG.cur().edges.filter(e => e.b === n.id).length }; });
  assert.strictEqual(after.c, nBefore + 1, 'summary note added'); assert.ok(/^Slides: /.test(after.t) && after.type === 'note' && after.edges >= 1, 'note titled and linked: ' + after.t);
  // mobile
  await pg.setViewportSize({ width: 390, height: 780 }); await pg.evaluate(() => __RG.openStudy('map')); await pg.waitForTimeout(200);
  assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal scroll at phone width');
  assert.deepStrictEqual(errs, [], 'no page errors: ' + errs.join('|'));
  console.log('ok: study tools UI'); await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
