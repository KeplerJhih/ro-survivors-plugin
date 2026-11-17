// v0.9.16 玩法「先巡邏（拿神祇），之後一直遊走」：gate.on + gate.after=keep + mode=roam；達成後仍遊走、不切原地掛機
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('https://ro-survivors.com/', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><meta charset="utf-8"></head><body></body></html>' }));
  await p.addInitScript(() => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: false, pick: false, loop: false, v: 3, tab: 'main', activeProfile: 'A', profiles: { A: { mode: 'idle', gate: { on: false, deity: true } } } }));
    window.__roHook = { run: null, lobby: null, runs: 0, runSeq: 0, drops: 0, stuck: 0 };
  });
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  await p.waitForTimeout(1200);
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  await p.selectOption('#rb-flow', 'gate_roam'); await p.waitForTimeout(300);
  const A = await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.cfg')).profiles.A);
  ok(A.gate.on === true && A.gate.after === 'keep' && A.mode === 'roam', '選「先巡邏，之後一直遊走」→ gate.on、after=keep、mode=roam ' + JSON.stringify({ on: A.gate.on, after: A.gate.after, mode: A.mode }));
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('[data-show="gate.after=keep"]')).display !== 'none' && getComputedStyle(document.querySelector('[data-show="!gate.after=keep"]')).display === 'none'), '說明改成「切換一般遊走」');
  ok(await p.evaluate(() => [...document.querySelectorAll('[data-show="@idle"]')].every((e) => getComputedStyle(e).display === 'none')), '不顯示原地掛機細節');
  await p.selectOption('#rb-flow', 'gate'); await p.waitForTimeout(300);
  const B = await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.cfg')).profiles.A);
  ok(B.gate.after === 'idle' && await p.evaluate(() => document.getElementById('rb-flow').value) === 'gate', '切回「先巡邏，再原地掛機」→ after=idle');
  ok(!errs.length, 'no page errors ' + errs.join(';'));
  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
