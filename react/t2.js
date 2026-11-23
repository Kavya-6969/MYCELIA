const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('file://'+process.cwd()+'/test.html');await p.waitForSelector('[data-node]');
await p.waitForSelector('[data-act=approve]',{timeout:8000});
const r=await p.evaluate(()=>{const all=[...document.querySelectorAll('svg[data-i]')];return {n:all.length,empty:[...new Set(all.filter(s=>!s.innerHTML.trim()).map(s=>s.dataset.i))]}});
console.log(r);await b.close()})();
