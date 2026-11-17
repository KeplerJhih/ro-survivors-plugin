// v0.9.12 面板縮小時右下角也能左右拉寬窄；縮小寬度另存 mw，展開回到原本寬高
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 900 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('https://ro-survivors.com/', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><meta charset="utf-8"></head><body></body></html>' }));
  await p.addInitScript(() => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: false, pick: false, loop: false, v: 3, activeProfile: 'A', profiles: { A: {} } }));
    localStorage.setItem('roBot.pos', JSON.stringify({ left: 20, top: 20, w: 420, h: 600 }));
    window.__roHook = { run: null, lobby: null, runs: 0, runSeq: 0, drops: 0, stuck: 0 };
  });
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  await p.waitForTimeout(1200);
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  const pos = () => p.evaluate(() => JSON.parse(localStorage.getItem('roBot.pos')));
  await p.click('#rb-min'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => getComputedStyle(document.getElementById('robot-panel')).resize) === 'horizontal', '縮小時可以左右拉');
  // 模擬拖右下角：pointerdown 在角落 → 改寬 → pointerup
  const r = await p.evaluate(() => { const r = document.getElementById('robot-panel').getBoundingClientRect(); return { x: r.right - 5, y: r.bottom - 5 }; });
  await p.mouse.move(r.x, r.y); await p.mouse.down(); await p.evaluate(() => { document.getElementById('robot-panel').style.width = '520px'; }); await p.mouse.up(); await p.waitForTimeout(200);
  let o = await pos();
  ok(o.mw === 520 && o.w === 420 && o.h === 600, '縮小寬度另存 mw，展開寬高不變 ' + JSON.stringify(o));
  await p.click('#rb-min'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => { const e = document.getElementById('robot-panel'); return e.offsetWidth === 420 && e.offsetHeight === 600; }), '展開回到 420×600');
  await p.click('#rb-min'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => document.getElementById('robot-panel').offsetWidth) === 520, '再縮小用記住的 520 寬');
  ok(!errs.length, 'no page errors ' + errs.join(';'));
  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
