const { chromium } = require('playwright');
const assert = require('assert');
(async () => {
  const b = await chromium.launch(); const url = process.argv[2], tag = process.argv[3] || 'x', W = +process.argv[4] || 1440, H = +process.argv[5] || 900;
  const ctx = await b.newContext({ viewport: { width: W, height: H }, permissions: ['clipboard-read', 'clipboard-write'] }); const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url + '#workspace', { waitUntil: 'load' }); await pg.addStyleTag({ content: '[hidden]{display:none!important}' }); await pg.waitForTimeout(2200); await pg.uncheck('#autoAdd');
  const mobile = W < 700; if (mobile) { /* panels are drawers; nothing open by default */ }
  const accOf = async () => parseFloat((await pg.textContent('#wiAcc')));
  // 1. node on canvas
  const cards = await pg.locator('.node.t-experiment').count(); console.log('experiment nodes:', cards, '| card:', (await pg.locator('.node.t-experiment .n-metrics').first().innerText()).replace(/\s+/g, ' '));
  assert(cards >= 1);
  // 2. open drawer by clicking
  const box = await pg.locator('.node.t-experiment').first().boundingBox(); await pg.mouse.click(box.x + box.width / 2, box.y + 20);
  await pg.waitForSelector('#whatif:not([hidden]) #wiAcc'); const a0 = await accOf(); console.log('drawer open, predicted accuracy', a0, '| saved runs:', await pg.locator('.run').count());
  await pg.screenshot({ path: `/tmp/exp-${tag}-drawer.png` });
  // live update via number input
  await pg.fill('#wn-learningRate', '0.05'); await pg.waitForTimeout(120); await pg.uncheck('#autoAdd'); const a1 = await accOf(); console.log('lr 0.05 ->', a1, '| delta chip:', (await pg.textContent('#wiAccD')).trim(), '| warnings:', await pg.locator('.warn').count());
  assert(a1 < a0 - 10, 'accuracy falls with a high learning rate'); assert(await pg.locator('.warn').count() >= 1);
  // live update via slider
  await pg.fill('#wn-learningRate', '5e-4'); await pg.evaluate(() => { const r = document.getElementById('ws-layers'); r.value = 700; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await pg.waitForTimeout(120); await pg.uncheck('#autoAdd'); console.log('layers slider ->', await pg.inputValue('#wn-layers'), 'layers; latency', (await pg.textContent('#tLat')).trim(), (await pg.textContent('#tLatD')).trim());
  // auto-tune
  const before = await accOf(); await pg.click('#wiTune'); await pg.waitForTimeout(900); await pg.uncheck('#autoAdd'); const tuned = await accOf(); console.log('auto-tune', before, '->', tuned); assert(tuned > before);
  // save run
  const runsBefore = await pg.locator('.run').count(); await pg.click('#wiSave'); await pg.waitForTimeout(250); await pg.uncheck('#autoAdd');
  console.log('saved run:', await pg.locator('.run').count() === runsBefore + 1, '| card now:', (await pg.locator('.node.t-experiment .n-metrics').first().innerText()).replace(/\s+/g, ' '));
  assert(await pg.locator('.run').count() === runsBefore + 1); assert(await pg.isDisabled('#wiSave'));
  await pg.click('[data-preset=fast]'); await pg.waitForTimeout(120); await pg.uncheck('#autoAdd'); console.log('fast preset ->', await accOf(), '| reset enabled:', !(await pg.isDisabled('#wiReset')));
  await pg.screenshot({ path: `/tmp/exp-${tag}-tuned.png` });
  await pg.click('#wiClose'); await pg.waitForTimeout(150); await pg.uncheck('#autoAdd'); assert(await pg.isHidden('#whatif'));
  // 3. export
  await pg.click('#btnExport'); await pg.waitForSelector('#exportModal:not([hidden])'); let txt = await pg.textContent('#exPre');
  console.log('markdown export:', txt.length, 'chars | has Experiments:', /## Experiments/.test(txt), '| has Reranker:', /Reranker learning-rate study/.test(txt), '| mermaid:', /```mermaid/.test(txt));
  assert(/## Experiments/.test(txt) && /Run 1/.test(txt));
  await pg.screenshot({ path: `/tmp/exp-${tag}-export.png` });
  await pg.click('[data-fmt=json]'); txt = await pg.textContent('#exPre'); const js = JSON.parse(txt); console.log('json export ok:', js.schema, '| nodes', js.summary.nodes, '| experiments', js.experiments.length, '| download button visible:', await pg.isVisible('#exDownload'));
  await pg.uncheck('#ex-experiments', { force: true }); await pg.waitForTimeout(100); await pg.uncheck('#autoAdd'); assert(!JSON.parse(await pg.textContent('#exPre')).experiments);
  await pg.click('#exCopy'); await pg.waitForTimeout(300); await pg.uncheck('#autoAdd'); const clip = await pg.evaluate(() => navigator.clipboard.readText().catch(() => 'ERR')); console.log('clipboard has json:', clip.startsWith('{'), '| toast:', (await pg.textContent('#toast')).slice(0, 40));
  await pg.keyboard.press('Escape'); assert(await pg.isHidden('#exportModal'));
  // 4. new experiment from Add Source
  const n0 = await pg.locator('.node').count(); await pg.click('#btnAdd'); await pg.click('.m-tab[data-mode=experiment]'); await pg.fill('#fExpName', 'Depth vs latency study'); await pg.selectOption('#fExpPreset', 'accurate'); await pg.click('#mSubmit');
  await pg.waitForSelector('#whatif:not([hidden])'); await pg.waitForTimeout(500); await pg.uncheck('#autoAdd'); console.log('new experiment created: nodes', n0, '->', await pg.locator('.node').count(), '| drawer title:', (await pg.textContent('.wi-title')).trim());
  await pg.keyboard.press('Escape');
  // 5. agent sweep produces an experiment node
  if (!mobile) {
    // The simulated runner crashes ~12% of runs on purpose, so retry the goal until it completes.
    let ok = false;
    for (let attempt = 1; attempt <= 5 && !ok; attempt++) {
      await pg.click('#goalChips .chip-s >> nth=2');
      await pg.waitForSelector('.prop.pending', { timeout: 20000 }); console.log('agent proposal:', (await pg.locator('.prop.pending .prop-kind').first().textContent()), '-', (await pg.locator('.prop.pending .prop-title').first().textContent()).slice(0, 70)); await pg.click('.prop.pending .app');
      const r = await Promise.race([pg.waitForSelector('.prop.pending', { timeout: 20000 }).then(() => 'proposal').catch(() => 'none'), pg.waitForFunction(() => document.querySelectorAll('.fi.k-failed').length > 0, null, { timeout: 20000 }).then(() => 'failed').catch(() => 'none')]);
      if (r === 'proposal') { console.log('agent proposal:', (await pg.locator('.prop.pending .prop-kind').first().textContent()), '-', (await pg.locator('.prop.pending .prop-title').first().textContent()).slice(0, 70)); await pg.click('.prop.pending .app'); ok = true; }
      else { console.log('simulated crash on attempt', attempt, '-', ((await pg.locator('.fi.k-failed .fi-text').first().textContent()) || '').slice(0, 80)); await pg.waitForTimeout(6500); await pg.uncheck('#autoAdd'); await pg.evaluate(() => document.querySelectorAll('.fi.k-failed').forEach(e => e.classList.remove('k-failed'))); }
    }
    assert(ok);
    await pg.waitForTimeout(600); await pg.uncheck('#autoAdd'); const agentNodes = await pg.locator('.node.t-experiment .n-by').count(); console.log('agent-made experiment nodes:', agentNodes); assert(agentNodes >= 1);
    await pg.screenshot({ path: `/tmp/exp-${tag}-agent.png` });
  }
  const m = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); console.log('overflow', JSON.stringify(m), '| errors:', errs.join(' | ') || 'none'); assert(m.sw <= m.cw);
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
