// node test/help-ui.test.js : Help & Ask AI window
const { chromium } = require('playwright'); const assert = require('assert'); const path = require('path');
const url = 'file://' + path.join(__dirname, '..', 'dist', 'artifact.html');
const FAKE = `window.__prompts = []; window.claude = { use: async n => n === 'sample' ? Object.assign(async (input) => {
  const t = typeof input === 'string' ? input : input.map(x => x.content).join('\\n'); window.__prompts.push(t);
  return { text: /sky/i.test(t.split('Question:').pop()) ? 'The sky looks blue because air scatters blue light more than red light.' : 'Press **Connect** and click two cards.', truncated: false };
}, { json: async () => ({}), limits: async () => ({}) }) : null };`;
const open = async (b, fake) => { const pg = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); if (fake) await pg.addInitScript(fake); await pg.goto(url + '#workspace', { waitUntil: 'load' }); await pg.addStyleTag({ content: '[hidden]{display:none!important}' }); await pg.waitForTimeout(1300); return pg; };
(async () => {
  const b = await chromium.launch(), errs = [];
  // without a model: built-in help
  let pg = await open(b, null); pg.on('pageerror', e => errs.push(e.message));
  assert.strictEqual((await pg.textContent('#btnHelp .cap')).trim(), 'Help', 'Help button with caption');
  await pg.click('#btnHelp'); assert.ok(await pg.isVisible('#helpModal')); assert.ok(/Built-in help/.test(await pg.textContent('#hlpMode')));
  await pg.click('[data-htopic="link"]'); await pg.waitForSelector('#hlpLog .msg.bot:not(.pending)');
  assert.ok(/Connect mode/.test(await pg.textContent('#hlpLog')), 'topic answer'); assert.ok(/Built-in help/.test(await pg.textContent('#hlpLog .msg-foot')));
  await pg.fill('#hlpIn', 'how do I delete a note?'); await pg.press('#hlpIn', 'Enter'); await pg.waitForFunction(() => document.querySelectorAll('#hlpLog .msg.bot').length === 2 && !document.querySelector('#hlpLog .pending'));
  assert.ok(/Delete/.test(await pg.locator('#hlpLog .msg.bot').nth(1).textContent()), 'delete answer');
  await pg.fill('#hlpIn', 'why is the sky blue'); await pg.press('#hlpIn', 'Enter'); await pg.waitForFunction(() => document.querySelectorAll('#hlpLog .msg.bot').length === 3 && !document.querySelector('#hlpLog .pending'));
  assert.ok(/no AI model is connected/i.test(await pg.locator('#hlpLog .msg.bot').nth(2).textContent()), 'honest when it cannot answer');
  await pg.keyboard.press('Escape'); assert.ok(!(await pg.isVisible('#helpModal')), 'Esc closes');
  await pg.keyboard.press('?'); assert.ok(await pg.isVisible('#helpModal'), '? opens'); await pg.keyboard.press('Escape');
  await pg.context().close();
  console.log('ok: built-in help without a model');
  // with a model: any question
  pg = await open(b, FAKE); pg.on('pageerror', e => errs.push(e.message));
  await pg.click('#btnHelp'); assert.ok(/AI model connected/.test(await pg.textContent('#hlpMode')));
  await pg.fill('#hlpIn', 'why is the sky blue'); await pg.press('#hlpIn', 'Enter'); await pg.waitForFunction(() => document.querySelectorAll('#hlpLog .msg.bot').length === 1 && !document.querySelector('#hlpLog .pending'));
  assert.ok(/scatters blue light/.test(await pg.textContent('#hlpLog')), 'general question answered by the model'); assert.ok(/Claude/.test(await pg.textContent('#hlpLog .msg-foot')));
  const sent = await pg.evaluate(() => window.__prompts.pop()); assert.ok(/Connect mode/.test(sent) && /any question/.test(sent) && /Question: why is the sky blue/.test(sent), 'prompt carries the user guide and the question');
  await pg.fill('#hlpIn', 'how do I link nodes'); await pg.press('#hlpIn', 'Enter'); await pg.waitForFunction(() => document.querySelectorAll('#hlpLog .msg.bot').length === 2 && !document.querySelector('#hlpLog .pending'));
  assert.ok(/Press Connect/.test(await pg.textContent('#hlpLog')));
  console.log('ok: model answers anything');
  assert.deepStrictEqual(errs, [], errs.join('|')); await b.close(); console.log('PASS help-ui');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
