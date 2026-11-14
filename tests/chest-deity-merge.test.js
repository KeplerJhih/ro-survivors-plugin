// v0.7.2：神祇分頁併入寶箱分頁（可收合區塊）；舊設定停在「神祇」分頁要自動跳到寶箱
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><meta charset="utf-8"></head><body style="background:#334"></body></html>' }));
  await p.addInitScript(() => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ profiles: { A: { deity: { '堡壘之神': 'want' } } }, activeProfile: 'A', v: 3, tab: 'deity' }));
    window.__roHook = { run: null, lobby: null, runs: 0, runSeq: 0, drops: 0, stuck: 0 };
  });
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  await p.waitForTimeout(500);
  const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
  ok(await p.evaluate(() => !document.querySelector('nav button[data-tab=deity]')), '沒有神祇分頁');
  ok(await p.evaluate(() => document.querySelector('.pg.on')?.dataset.pg) === 'chest', '舊的 tab=deity → 顯示寶箱分頁');
  ok(await p.evaluate(() => document.querySelector('.seg[data-d="堡壘之神"] button[data-v=want]').classList.contains('on')), '堡壘之神 🎯 狀態有顯示');
  await p.click('.seg[data-d="記憶之神"] button[data-v=ban]');
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.cfg')).profiles.A.deity['記憶之神']) === 'ban', '在寶箱分頁點 ✕ → 存成 ban');
  await p.fill('textarea[data-list="chestPriority"]', '詠唱速度'); await p.waitForTimeout(200);
  ok(JSON.stringify(await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.cfg')).profiles.A.chestPriority)) === '["詠唱速度"]', '其他寶箱卡優先序可存');
  await p.screenshot({ path: __dirname + '/out/chest-deity.png', clip: { x: 0, y: 60, width: 300, height: 840 } });
  ok(!errs.length, 'no page errors ' + errs.join(';'));
  await b.close();
})();
