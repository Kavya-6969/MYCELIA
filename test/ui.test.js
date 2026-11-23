const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const out = [];
  async function run(name, url, w, h) {
    const pg = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|tailwind|ERR_/.test(m.text())) errs.push(m.text()); });
    await pg.goto(url, { waitUntil: 'load' }).catch(() => {}); await pg.addStyleTag({ content: '[hidden]{display:none!important}' }); await pg.waitForTimeout(800);
    await pg.click('#btnAdd'); await pg.waitForTimeout(500);
    await pg.screenshot({ path: `/tmp/${name}-modal.png` });
    // text note
    await pg.click('.m-tab[data-mode=text]');
    await pg.fill('#fText', 'Late interaction retrieval for long-tail entities\nWe show that late-interaction retrievers outperform dense retrieval on rare entity questions. Our results indicate a 6 point gain in exact match on Natural Questions.');
    await pg.click('#mSubmit'); await pg.waitForTimeout(400); await pg.screenshot({ path: `/tmp/${name}-busy.png` });
    await pg.waitForSelector('#modal', { state: 'hidden', timeout: 8000 });
    await pg.waitForTimeout(900);
    // PDF upload
    await pg.click('#btnAdd'); await pg.waitForTimeout(300);
    await pg.setInputFiles('#fFile', '/home/claude/researchgraph/test/sample.pdf');
    await pg.click('#mSubmit'); await pg.waitForSelector('#modal', { state: 'hidden', timeout: 10000 }).catch(async () => { console.log('STUCK', await pg.evaluate(() => [document.getElementById('mErr').textContent, document.getElementById('mSubmit').textContent, document.getElementById('mSubmit').disabled, document.activeElement && document.activeElement.id])); throw 1; }); await pg.waitForTimeout(900);
    await pg.screenshot({ path: `/tmp/${name}-after.png` });
    const info = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, nodes: document.querySelectorAll('.node').length, insp: !document.getElementById('inspector').hidden, title: (document.querySelector('#inspector .insp-title') || {}).textContent, tags: Array.from(document.querySelectorAll('#inspector .tag')).map(x => x.textContent), badge: null }));
    // URL error path
    await pg.click('#btnAdd'); await pg.click('.m-tab[data-mode=url]'); await pg.fill('#fUrl', 'http://127.0.0.1/secret'); await pg.click('#mSubmit'); await pg.waitForTimeout(1500);
    info.urlErr = await pg.evaluate(() => document.getElementById('mErr').hidden ? null : document.getElementById('mErr').textContent);
    out.push([name, JSON.stringify(info), errs.join(' | ')]);
    await pg.close();
  }
  await run('server', 'http://localhost:3111/', 1440, 860);
  await run('mobile', 'http://localhost:3111/', 390, 800);
  await run('offline', 'file:///home/claude/researchgraph/dist/artifact.html', 1440, 860);
  out.forEach(o => console.log(o.join('\n  '))); await b.close();
})();
