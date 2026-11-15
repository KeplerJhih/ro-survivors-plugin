// v0.7.5：面板可拖右下角改大小，放開才記住寬高；切分頁不會把高度存起來；收合時不留空白
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1000, height: 760 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><meta charset="utf-8"></head><body style="background:#334"></body></html>' }));
  await p.addInitScript(() => {
    if (!sessionStorage.getItem('init')) { sessionStorage.setItem('init', '1'); localStorage.setItem('roBot.cfg', JSON.stringify({ v: 3, tab: 'main', activeProfile: 'A', profiles: { A: {} } })); localStorage.setItem('roBot.pos', JSON.stringify({ left: 20, top: 20 })); }
    window.__roHook = { run: null, lobby: null, runs: 0, runSeq: 0, drops: 0, stuck: 0 };
  });
  const load = async () => { await p.goto('https://ro-survivors.com/'); await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') }); await p.waitForTimeout(500); };
  await load();
  const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
  const pos = () => p.evaluate(() => JSON.parse(localStorage.getItem('roBot.pos') || '{}'));
  ok(await p.evaluate(() => getComputedStyle(document.getElementById('robot-panel')).resize) === 'both', '面板可調整大小 (resize: both)');
  await p.click('nav button[data-tab=log]'); await p.click('nav button[data-tab=skill]'); await p.waitForTimeout(300);
  ok((await pos()).h === undefined, '切分頁不記高度');
  // 模擬拖右下角：在角落按下 → 改尺寸 → 放開
  const r = await p.evaluate(() => { const r = document.getElementById('robot-panel').getBoundingClientRect(); return { x: r.right - 5, y: r.bottom - 5 }; });
  await p.mouse.move(r.x, r.y); await p.mouse.down();
  await p.evaluate(() => { const el = document.getElementById('robot-panel'); el.style.width = '360px'; el.style.height = '500px'; });
  await p.mouse.up(); await p.waitForTimeout(200);
  const s = await pos();
  ok(s.w === 360 && s.h === 500, '放開後記住寬高 ' + JSON.stringify(s));
  await load();
  ok(await p.evaluate(() => document.getElementById('robot-panel').offsetWidth) === 360, '重新載入後套用寬度');
  await p.click('#rb-min'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.getElementById('robot-panel').offsetHeight) < 80, '收合時高度變小（不留空白）');
  await p.click('#rb-min'); await p.waitForTimeout(300);
  await p.click('nav button[data-tab=log]'); await p.waitForTimeout(300);
  await p.screenshot({ path: __dirname + '/out/panel-resize.png', clip: { x: 0, y: 0, width: 420, height: 560 } });
  ok(!errs.length, 'no page errors ' + errs.join(';'));
  await b.close();
})();
