// node test/link-ui.test.js : drag or click to connect any two nodes; relabel, reverse and remove links
const { chromium } = require('playwright'); const assert = require('assert'); const path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'dist', 'artifact.html');
(async () => {
  const b = await chromium.launch(), errs = [];
  const pg = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url + '#workspace', { waitUntil: 'load' }); await pg.addStyleTag({ content: '[hidden]{display:none!important}' }); await pg.waitForTimeout(1200);
  const edgesOf = () => pg.evaluate(() => JSON.parse(localStorage.getItem('researchgraph.workspace.v1')).ws.flatMap(w => w.edges));
  const ids = await pg.evaluate(() => [...document.querySelectorAll('.node:not(.pending)')].map(n => n.dataset.id));
  // find a pair with no link and well apart
  const pair = await pg.evaluate(() => { const ws = JSON.parse(localStorage.getItem('researchgraph.workspace.v1')).ws; const w = ws[0] || ws; const ns = w.nodes.filter(n => !n.pending), has = (a, b) => w.edges.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a)); for (const a of ns) for (const b of ns) if (a.id !== b.id && !has(a.id, b.id) && Math.abs(a.x - b.x) > 300) return [a.id, b.id]; return null; });
  assert.ok(pair, 'an unlinked pair exists');
  const [A, B] = pair; await pg.evaluate(() => document.querySelectorAll('.node').forEach(n => n.scrollIntoView && 0));
  const n0 = (await edgesOf()).length;
  const centre = async id => { const r = await pg.locator(`.node[data-id="${id}"]`).boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, r }; };
  // every card, of any type, has a link dot
  assert.strictEqual(await pg.locator('.node:not(.pending)').count(), await pg.locator('.node:not(.pending) .n-port.p-r').count(), 'dot on every node');
  // 1. drag from the dot to another node
  await pg.hover(`.node[data-id="${A}"]`); const pa = await pg.locator(`.node[data-id="${A}"] .n-port.p-r`).boundingBox(), cb = await centre(B);
  await pg.mouse.move(pa.x + 7, pa.y + 7); await pg.mouse.down(); await pg.mouse.move(cb.x - 100, cb.y, { steps: 8 }); await pg.mouse.move(cb.x, cb.y, { steps: 6 });
  assert.ok(await pg.locator('.link-preview').count() === 1, 'preview line while dragging'); assert.ok(await pg.locator(`.node[data-id="${B}"].link-target`).count() === 1, 'target highlighted');
  await pg.mouse.up(); await pg.waitForTimeout(900);
  let es = await edgesOf(); assert.strictEqual(es.length, n0 + 1, 'edge created by drag'); const made = es.find(e => e.a === A && e.b === B && e.manual); assert.ok(made, 'directed A -> B, flagged manual');
  assert.ok(await pg.locator('.edge.man').count() >= 1, 'drawn as a link');
  console.log('ok: drag to connect');
  // 2. dropping on empty canvas makes nothing
  await pg.hover(`.node[data-id="${A}"]`); const pa2 = await pg.locator(`.node[data-id="${A}"] .n-port.p-r`).boundingBox();
  await pg.mouse.move(pa2.x + 7, pa2.y + 7); await pg.mouse.down(); await pg.mouse.move(700, 880, { steps: 8 }); await pg.mouse.up(); await pg.waitForTimeout(700);
  assert.strictEqual((await edgesOf()).length, n0 + 1, 'empty drop makes no link'); assert.strictEqual(await pg.locator('.link-preview').count(), 0, 'preview cleared');
  // 3. duplicate is refused
  await pg.hover(`.node[data-id="${B}"]`); const pb = await pg.locator(`.node[data-id="${B}"] .n-port.p-l`).boundingBox(), ca = await centre(A);
  await pg.mouse.move(pb.x + 7, pb.y + 7); await pg.mouse.down(); await pg.mouse.move(ca.x, ca.y, { steps: 10 });
  assert.ok(await pg.locator(`.node[data-id="${A}"].link-bad`).count() === 1, 'already-linked pair shows red'); await pg.mouse.up(); await pg.waitForTimeout(700);
  assert.strictEqual((await edgesOf()).length, n0 + 1, 'no duplicate');
  console.log('ok: empty drop and duplicates refused');
  // 4. click label / reverse / remove
  const hit = pg.locator(`.edge-hit[data-eid="${made.id}"]`); const hb = await hit.evaluate(el => { const l = el.getTotalLength(), pt = el.getPointAtLength(l / 2), m = el.getScreenCTM(); return { x: pt.x * m.a + m.e, y: pt.y * m.d + m.f }; });
  await pg.mouse.click(hb.x, hb.y); assert.ok(await pg.isVisible('#emenu'), 'line click opens the link menu');
  await pg.fill('#emLabel', 'extends'); await pg.press('#emLabel', 'Enter'); await pg.waitForTimeout(900);
  assert.ok(/extends/.test(await pg.locator('.edge-label').first().textContent()), 'label drawn on the canvas');
  assert.strictEqual((await edgesOf()).find(e => e.id === made.id).reason, 'extends', 'label saved');
  await pg.mouse.click(hb.x, hb.y); await pg.click('#emFlip'); await pg.waitForTimeout(900);
  const fl = (await edgesOf()).find(e => e.id === made.id); assert.ok(fl.a === B && fl.b === A, 'direction reversed');
  await pg.click('#emDel'); assert.strictEqual((await edgesOf()).length, n0 + 1, 'first click only arms'); await pg.click('#emDel'); await pg.waitForTimeout(900);
  assert.strictEqual((await edgesOf()).length, n0, 'link removed'); assert.ok(!(await pg.isVisible('#emenu')));
  console.log('ok: label, reverse, remove');
  // 5. click-then-pick (no dragging), then Esc cancel
  await pg.hover(`.node[data-id="${B}"]`); const pb3 = await pg.locator(`.node[data-id="${B}"] .n-port.p-r`).boundingBox();
  await pg.mouse.click(pb3.x + 7, pb3.y + 7); await pg.waitForTimeout(200); assert.ok(await pg.isVisible('#linkBar'), 'click arms link mode');
  await pg.keyboard.press('Escape'); assert.ok(!(await pg.isVisible('#linkBar')), 'Esc cancels');
  await pg.hover(`.node[data-id="${B}"]`); const pb4 = await pg.locator(`.node[data-id="${B}"] .n-port.p-r`).boundingBox(); await pg.mouse.click(pb4.x + 7, pb4.y + 7);
  const ca2 = await centre(A); await pg.mouse.click(ca2.x, ca2.y); await pg.waitForTimeout(900);
  es = await edgesOf(); assert.ok(es.some(e => e.a === B && e.b === A && e.manual), 'click, then click target creates link'); assert.strictEqual(es.length, n0 + 1);
  console.log('ok: click-to-link');
  // 5b. Connect mode: click one node, then another, and keep going; L toggles, Esc leaves
  const pair2 = await pg.evaluate(() => { const w = JSON.parse(localStorage.getItem('researchgraph.workspace.v1')).ws[0]; const has = (a, b) => w.edges.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a)); const ns = w.nodes.filter(n => !n.pending); const out = []; for (const a of ns) for (const b of ns) if (a.id < b.id && !has(a.id, b.id) && Math.abs(a.x - b.x) > 250) out.push([a.id, b.id]); return out.slice(0, 2); });
  assert.ok(pair2.length === 2, 'two more pairs');
  const nBefore = (await edgesOf()).length;
  await pg.click('#linkToggle'); assert.ok(await pg.isVisible('#linkBar') && /Connect mode/.test(await pg.textContent('#linkMsg')), 'connect mode bar');
  for (const [x, y] of pair2) { const cx = await centre(x), cy = await centre(y); await pg.mouse.click(cx.x, cx.y); await pg.waitForTimeout(150); assert.ok(/Linking from/.test(await pg.textContent('#linkMsg')), 'source picked'); await pg.mouse.click(cy.x, cy.y); await pg.waitForTimeout(500); assert.ok(/Connect mode/.test(await pg.textContent('#linkMsg')), 'ready for the next link'); }
  await pg.waitForTimeout(700); assert.strictEqual((await edgesOf()).length, nBefore + 2, 'two links made in one connect session');
  await pg.keyboard.press('Escape'); assert.ok(!(await pg.isVisible('#linkBar')), 'Esc leaves connect mode'); assert.strictEqual(await pg.getAttribute('#linkToggle', 'aria-pressed'), 'false');
  await pg.keyboard.press('l'); assert.strictEqual(await pg.getAttribute('#linkToggle', 'aria-pressed'), 'true', 'L toggles'); await pg.keyboard.press('l');
  console.log('ok: connect mode');
  // 6. survives reload
  await pg.reload({ waitUntil: 'load' }); await pg.addStyleTag({ content: '[hidden]{display:none!important}' }); await pg.waitForTimeout(1200);
  assert.ok((await edgesOf()).some(e => e.a === B && e.b === A && e.manual), 'link survives reload'); assert.ok(await pg.locator('.edge.man').count() >= 1);
  assert.deepStrictEqual(errs, [], errs.join('|')); await b.close(); console.log('PASS link-ui');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
