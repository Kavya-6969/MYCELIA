const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const url = process.argv[2]; const mode = process.argv[3] || 'x';
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url + '#workspace', { waitUntil: 'load' }); await pg.addStyleTag({ content: '[hidden]{display:none!important}' }); await pg.waitForTimeout(2500); await pg.uncheck('#autoAdd');
  const txt = s => pg.textContent(s);
  const card = id => pg.locator(`.ag[data-agent=${id}]`);
  console.log('mode chip:', await txt('#engineMode'));
  await pg.click('.chip-s >> nth=0');
  await pg.waitForSelector('.prop.pending', { timeout: 15000 });
  console.log('lit status:', (await card('literature').locator('.pill.st').textContent()).trim(), '| ghosts:', await pg.locator('.node.pending').count(), '| edges pending:', await pg.locator('.edge.pend').count());
  await pg.screenshot({ path: `/tmp/agents-${mode}-waiting.png` });
  await pg.click('.prop.pending .app'); await pg.waitForTimeout(500); await pg.uncheck('#autoAdd');
  console.log('after approve: ghosts', await pg.locator('.node.pending').count(), 'score', (await card('literature').locator('.score').textContent()).trim());
  await pg.waitForSelector('.prop.pending', { timeout: 15000 });
  await pg.click('.prop.pending .rej'); await pg.waitForTimeout(600); await pg.uncheck('#autoAdd');
  console.log('after reject: ghosts', await pg.locator('.node.pending').count(), 'score', (await card('literature').locator('.score').textContent()).trim(), 'nodes', await pg.locator('.node').count());
  await pg.waitForTimeout(1500); await pg.uncheck('#autoAdd');
  console.log('lit status after done:', (await card('literature').locator('.pill.st').textContent()).trim(), '| controller:', (await card('controller').locator('.pill.st').textContent()).trim());
  await pg.screenshot({ path: `/tmp/agents-${mode}-done.png` });
  // setup flow
  await pg.fill('#goalIn', 'Set up rag-eval-harness'); await pg.press('#goalIn', 'Enter');
  for (let i = 0; i < 2; i++) { await pg.waitForSelector('.prop.pending', { timeout: 15000 }); console.log('setup proposal:', (await pg.locator('.prop.pending .prop-kind').first().textContent()), '-', (await pg.locator('.prop.pending .prop-title').first().textContent())); await pg.click('.prop.pending .app'); await pg.waitForTimeout(400); await pg.uncheck('#autoAdd'); }
  await pg.waitForTimeout(2200); await pg.uncheck('#autoAdd');
  console.log('setup score', (await card('setup').locator('.score').textContent()).trim(), 'status', (await card('setup').locator('.pill.st').textContent()).trim());
  // failure + retire: experiment with no match? use rejects on literature until retired
  for (let g = 0; g < 4; g++) {
    if (await card('literature').locator('.reinstate').count()) break;
    await pg.fill('#goalIn', 'Find papers on graph neural networks'); await pg.press('#goalIn', 'Enter');
    for (let k = 0; k < 2; k++) {
      const got = await pg.waitForSelector('.prop.pending', { timeout: 14000 }).catch(() => null); if (!got) break;
      await pg.click('.prop.pending .rej'); await pg.waitForTimeout(500); await pg.uncheck('#autoAdd');
      if (await card('literature').locator('.reinstate').count()) break;
    }
    await pg.waitForTimeout(800); await pg.uncheck('#autoAdd');
  }
  console.log('retired?', await card('literature').locator('.reinstate').count(), 'score', (await card('literature').locator('.score').textContent()).trim(), 'status', (await card('literature').locator('.pill.st').textContent()).trim());
  await pg.screenshot({ path: `/tmp/agents-${mode}-retired.png` });
  if (await card('literature').locator('.reinstate').count()) { await card('literature').locator('.reinstate').dispatchEvent('click'); await pg.waitForTimeout(400); await pg.uncheck('#autoAdd'); console.log('reinstated score', (await card('literature').locator('.score').textContent()).trim()); }
  const m = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  console.log('overflow', m, 'errors:', errs.join('|') || 'none');
  await b.close();
})();
