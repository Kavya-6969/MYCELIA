// node test/home-ui.test.js : the mycelia homepage in front of the real workspace
const { chromium } = require('playwright'); const assert = require('assert'); const path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'dist', 'artifact.html');
// a stand-in for Three.js (the real library loads from cdnjs); it only lets the hero code run end to end
const STUB = `(function(){function U(){const f=function(){return U()};return new Proxy(f,{get:(t,p)=>{if(p===Symbol.toPrimitive)return()=>0;if(p==='then')return undefined;if(typeof p==='symbol')return undefined;if(p==='length')return 0;if(p==='x'||p==='y'||p==='z')return 0;return U()},set:()=>true,apply:()=>U(),construct:()=>U()})}
window.__r=0;window.THREE=new Proxy({},{get:(_,n)=>{if(typeof n==='symbol')return undefined;if(n==='WebGLRenderer')return function(){return new Proxy({},{get:(t,p)=>p==='getContext'?()=>({}):(p==='render'?function(){window.__r++}:U())})};return U()}})})();`;
(async () => {
  const b = await chromium.launch(), errs = [];
  async function page(w, h, o = {}) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: o.rm ? 'reduce' : 'no-preference' }), pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await pg.route('**/*', r => { const u = r.request().url(); if (u.includes('three.min.js')) return o.noThree ? r.abort() : r.fulfill({ contentType: 'application/javascript', body: STUB }); if (u.startsWith('file:')) return r.continue(); return r.abort(); });
    await pg.goto(url + (o.hash || ''), { waitUntil: 'load' }); await pg.addStyleTag({ content: '[hidden]{display:none!important}' }); await pg.waitForTimeout(o.wait || 900); return pg;
  }
  const homeOn = pg => pg.evaluate(() => { const h = document.getElementById('home'); return !h.classList.contains('h-off') && getComputedStyle(h).visibility === 'visible'; });
  const inApp = async pg => (await pg.evaluate(() => document.querySelector('.shell').hasAttribute('inert')) === false) && !(await homeOn(pg));
  let pg = await page(1440, 900);
  // 1. the homepage is the front door
  assert.ok(await homeOn(pg), 'homepage visible first'); assert.ok(await pg.evaluate(() => document.querySelector('.shell').hasAttribute('inert')), 'workspace is inert behind it');
  const r0 = await pg.evaluate(() => window.__r); await pg.waitForTimeout(800); assert.ok(r0 > 0 && (await pg.evaluate(() => window.__r)) > r0, '3D hero render loop runs');
  assert.deepStrictEqual(await pg.$$eval('h1.h-hl span', e => e.map(x => x.textContent)), ['Connected.', 'Autonomous.', 'Discovered.']);
  assert.deepStrictEqual(await pg.$$eval('#home section[id]', e => e.map(s => s.id)), ['hm-how', 'hm-canvas-demo', 'hm-tech', 'hm-ideas', 'hm-start']);
  assert.strictEqual(await pg.$$eval('.h-step', e => e.length), 6); assert.strictEqual(await pg.$$eval('#hm-tech .h-card', e => e.length), 4); assert.strictEqual(await pg.$$eval('#hm-ideas .h-card', e => e.length), 6);
  await pg.screenshot({ path: '/tmp/home-hero.png' });
  await pg.keyboard.press('?'); assert.ok(!(await pg.isVisible('#helpModal')), 'workspace shortcuts blocked behind the homepage');
  const s0 = await pg.textContent('#hm-wStatus'); await pg.waitForTimeout(2800); assert.notStrictEqual(s0, await pg.textContent('#hm-wStatus'), 'widget status cycles');
  // nav link scrolls inside the homepage without touching the URL
  await pg.click('.h-nav a[href="#hm-tech"]'); await pg.waitForTimeout(1300); assert.ok(await pg.evaluate(() => document.getElementById('home').scrollTop > 800), 'nav scrolls'); assert.strictEqual(await pg.evaluate(() => location.hash), '', 'URL untouched');
  // live canvas is scroll-linked and reversible
  const cs = () => pg.evaluate(() => ({ cards: [...document.querySelectorAll('.h-ncard')].map(c => +c.style.opacity), snips: [...document.querySelectorAll('.h-snip')].map(c => +c.style.opacity) }));
  const goto = async f => { await pg.evaluate(f => { const h = document.getElementById('home'), r = document.getElementById('hm-stage').getBoundingClientRect(); h.style.scrollBehavior = 'auto'; h.scrollTop += r.top - innerHeight * f; }, f); await pg.waitForTimeout(1500); };
  await goto(.9); let c = await cs(); assert.ok(c.cards.every(x => x === 0) && c.snips.every(x => x > .9), 'canvas start state');
  await goto(.1); c = await cs(); assert.ok(c.cards.every(x => x > .99) && c.snips.every(x => x === 0), 'canvas end state'); await pg.screenshot({ path: '/tmp/home-canvas.png' });
  await goto(.9); c = await cs(); assert.ok(c.cards.every(x => x === 0), 'canvas reverses');
  // 2. every CTA opens the REAL workspace
  const nodesBefore = await pg.evaluate(() => document.querySelectorAll('#viewport .node').length); assert.ok(nodesBefore >= 6, 'real workspace has its nodes: ' + nodesBefore);
  for (const sel of ['.h-hero .h-top [data-hm-open]', '.h-hero .h-widget [data-hm-open]', '#hm-start [data-hm-open]']) {
    await pg.evaluate(s => { const h = document.getElementById('home'); h.style.scrollBehavior = 'auto'; document.querySelector(s).scrollIntoView({ block: 'center' }); }, sel); await pg.waitForTimeout(500);
    await pg.click(sel); await pg.waitForTimeout(1500);
    assert.ok(await inApp(pg), sel + ' opens the workspace'); assert.strictEqual(await pg.evaluate(() => location.hash), '#workspace');
    assert.ok(await pg.isVisible('#viewport') && await pg.isVisible('#btnAdd'), 'workspace UI visible');
    assert.strictEqual(await pg.evaluate(() => document.querySelectorAll('#viewport .node').length), nodesBefore, 'same data, nothing lost');
    if (sel.startsWith('.h-hero .h-top')) {
      // the workspace still works: add-source dialog, Help, Study tools, theme
      await pg.click('#btnAdd'); assert.ok(await pg.isVisible('#modal'), 'Add source opens'); await pg.keyboard.press('Escape'); assert.ok(!(await pg.isVisible('#modal')));
      await pg.click('#btnHelp'); assert.ok(await pg.isVisible('#helpModal')); await pg.keyboard.press('Escape');
      await pg.click('#panelStudy [data-study="slides"]'); assert.ok(await pg.isVisible('#studyModal')); await pg.keyboard.press('Escape');
    }
    // 3. the brand leads back to the homepage; browser Back does too
    await pg.click('.topbar .brand-name'); await pg.waitForTimeout(1500); assert.ok(await homeOn(pg), 'brand returns home'); assert.ok(await pg.evaluate(() => document.querySelector('.shell').hasAttribute('inert')));
    assert.strictEqual(await pg.evaluate(() => document.getElementById('home').scrollTop), 0, 'homepage restarts at the top');
  }
  await pg.click('.h-hero .h-top [data-hm-open]'); await pg.waitForTimeout(1500); assert.ok(await inApp(pg)); await pg.goBack(); await pg.waitForTimeout(1500); assert.ok(await homeOn(pg), 'browser Back returns to the homepage');
  await pg.goForward(); await pg.waitForTimeout(1500); assert.ok(await inApp(pg), 'Forward re-enters');
  assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no page scroll in the workspace'); await pg.context().close();
  // 4. deep link straight into the workspace
  pg = await page(1440, 900, { hash: '#workspace' }); assert.ok(await inApp(pg), '#workspace skips the homepage'); assert.ok(await pg.isVisible('#viewport')); await pg.context().close();
  // 5. phone
  pg = await page(390, 800); assert.ok(!(await pg.isVisible('.h-nav')), 'nav collapsed'); await pg.click('#hm-menuBtn'); assert.ok(await pg.isVisible('#hm-mnav')); await pg.screenshot({ path: '/tmp/home-m.png' }); await pg.click('#hm-menuBtn');
  assert.ok(await pg.evaluate(() => { const w = document.querySelector('.h-widget').getBoundingClientRect(), h = document.querySelector('h1.h-hl').getBoundingClientRect(); return w.top >= h.bottom - 1; }), 'widget restacks under the headline');
  assert.ok(await pg.evaluate(() => { const h = document.getElementById('home'); return h.scrollWidth <= h.clientWidth; }), 'no horizontal scroll at 390');
  await pg.click('.h-hero [data-hm-open]'); await pg.waitForTimeout(1500); assert.ok(await inApp(pg), 'phone: workspace opens'); await pg.context().close();
  // 6. reduced motion: instant, content visible
  pg = await page(1440, 900, { rm: true }); assert.ok(await pg.$$eval('.h-rv', e => e.every(x => getComputedStyle(x).opacity === '1')), 'reduced motion: content visible');
  await pg.click('.h-hero [data-hm-open]'); await pg.waitForTimeout(300); assert.ok(await inApp(pg), 'reduced motion: enters at once'); await pg.context().close();
  // 7. no Three.js: the hero degrades, the workspace is untouched
  pg = await page(1440, 900, { noThree: true }); assert.strictEqual(await pg.$eval('#hm-gl', e => getComputedStyle(e).display), 'none', '3D canvas hidden without WebGL'); await pg.click('.h-hero [data-hm-open]'); await pg.waitForTimeout(1500); assert.ok(await inApp(pg)); await pg.context().close();
  const real = errs.filter(e => !/Failed to load resource|net::ERR|api\/health/.test(e)); assert.deepStrictEqual(real, [], 'no page errors: ' + real.join(' | '));
  console.log('ok: homepage + real workspace'); await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
