// node test/edit-ui.test.js : Edit / Delete menu on paper, note and code cards only
const { chromium } = require('playwright'); const assert = require('assert'); const path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'dist', 'artifact.html');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const pg = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url + '#workspace', { waitUntil: 'load' }); await pg.addStyleTag({ content: '[hidden]{display:none!important}' }); await pg.waitForTimeout(1200);
  const types = await pg.evaluate(() => [...document.querySelectorAll('.node')].map(n => [n.className.match(/t-(\w+)/)[1], !!n.querySelector('.n-edit')]));
  assert.ok(types.length > 0, 'nodes exist');
  types.forEach(([t, has]) => assert.strictEqual(has, ['paper', 'note', 'code'].includes(t), t + ' edit button only on paper/note/code'));
  assert.strictEqual(await pg.locator('.right .n-edit, .sidebar .n-edit, #inspector .n-edit').count(), 0, 'nothing in other columns');
  console.log('ok: button only on paper, note, code');
  // add a note first so we always have one
  const sel = '.node.t-paper';
  const id = await pg.getAttribute(sel + ' >> nth=0', 'data-id');
  const count0 = await pg.locator('.node').count();
  const edges0 = await pg.locator('#edgeLayer path, #edgeLayer line').count();
  // open menu, edit
  await pg.hover(`.node[data-id="${id}"]`); await pg.click(`.node[data-id="${id}"] .n-edit`);
  assert.ok(await pg.isVisible('#nmenu'), 'menu opens'); assert.ok(await pg.isVisible('#nmEdit') && await pg.isVisible('#nmDel'), 'edit and delete in menu');
  await pg.click('#nmEdit'); assert.ok(await pg.isVisible('#editModal'), 'edit modal opens');
  await pg.fill('#edName', 'My edited paper'); await pg.fill('#edUrl', 'example.com/my-paper');
  await pg.fill('#edText', 'First line\nSee https://example.org/docs for details'); await pg.fill('#edTags', '#Idea, todo, idea');
  await pg.keyboard.press('Control+Enter'); await pg.waitForTimeout(300);
  assert.ok(!(await pg.isVisible('#editModal')), 'modal closes on Ctrl+Enter');
  const card = pg.locator(`.node[data-id="${id}"]`);
  assert.strictEqual((await card.locator('.n-title').textContent()).trim(), 'My edited paper');
  assert.ok(/First line/.test(await card.locator('.n-body').textContent()), 'text on card');
  assert.strictEqual(await card.locator('.n-body a.txt-link').getAttribute('href'), 'https://example.org/docs');
  assert.strictEqual(await card.locator('a.n-link').getAttribute('href'), 'https://example.com/my-paper', 'bare domain gets https');
  assert.deepStrictEqual(await card.locator('.tag').allTextContents(), ['#idea', '#todo'], 'tags cleaned');
  assert.ok(await pg.isVisible('#inspector'), 'inspector open'); assert.ok(/First line/.test(await pg.textContent('#inspector')));
  console.log('ok: edit saves title, link, text, tags');
  // validation
  await pg.click('#inspClose');
  await pg.hover(`.node[data-id="${id}"]`); await pg.click(`.node[data-id="${id}"] .n-edit`); await pg.click('#nmEdit');
  await pg.fill('#edName', '   '); await pg.click('#edSave'); assert.ok(/title/i.test(await pg.textContent('#edErr')), 'empty title rejected'); assert.ok(await pg.isVisible('#editModal'));
  await pg.fill('#edName', 'Ok'); await pg.fill('#edUrl', 'not a link'); await pg.click('#edSave'); assert.ok(/link/i.test(await pg.textContent('#edErr')), 'bad link rejected');
  await pg.keyboard.press('Escape'); assert.ok(!(await pg.isVisible('#editModal')), 'Esc closes');
  assert.strictEqual((await card.locator('.n-title').textContent()).trim(), 'My edited paper', 'cancel changes nothing');
  console.log('ok: validation and cancel');
  // persists across reload
  await pg.waitForTimeout(900); await pg.reload({ waitUntil: 'load' }); await pg.addStyleTag({ content: '[hidden]{display:none!important}' }); await pg.waitForTimeout(1000);
  assert.strictEqual((await pg.locator(`.node[data-id="${id}"] .n-title`).textContent()).trim(), 'My edited paper', 'edit survives reload');
  assert.ok(await pg.locator(`.node[data-id="${id}"] .n-body`).count(), 'text survives reload');
  console.log('ok: persists');
  // delete needs a second click
  if (await pg.isVisible('#inspClose')) await pg.click('#inspClose');
  await pg.hover(`.node[data-id="${id}"]`); await pg.click(`.node[data-id="${id}"] .n-edit`); await pg.click('#nmDel');
  assert.ok(await pg.locator(`.node[data-id="${id}"]`).count() === 1, 'first click only arms'); assert.ok(/again/i.test(await pg.textContent('#nmDelTxt')));
  await pg.click('#nmDel'); await pg.waitForTimeout(300);
  assert.strictEqual(await pg.locator(`.node[data-id="${id}"]`).count(), 0, 'node deleted');
  assert.strictEqual(await pg.locator('.node').count(), count0 - 1);
  assert.ok(!(await pg.isVisible('#nmenu')), 'menu closed');
  await pg.waitForTimeout(900); await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(900);
  assert.strictEqual(await pg.locator(`.node[data-id="${id}"]`).count(), 0, 'deletion survives reload');
  const edgeIds = await pg.evaluate(id => JSON.parse(localStorage.getItem('researchgraph.workspace.v1')).ws.flatMap(w => w.edges).filter(e => e.a === id || e.b === id).length, id);
  assert.strictEqual(edgeIds, 0, 'its links are gone too');
  const tomb = await pg.evaluate(id => JSON.parse(localStorage.getItem('researchgraph.workspace.v1')).ws.some(w => w.tomb && w.tomb[id]), id);
  assert.ok(tomb, 'tombstone recorded so sync deletes it everywhere');
  console.log('ok: delete (two clicks), links removed, tombstone');
  // dataset / experiment do not get a button even when selected
  assert.strictEqual(await pg.locator('.node.t-dataset .n-edit, .node.t-experiment .n-edit').count(), 0);
  assert.deepStrictEqual(errs, [], 'no page errors: ' + errs.join('|'));
  await b.close(); console.log('PASS edit-ui');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
