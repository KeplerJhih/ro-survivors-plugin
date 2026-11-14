// v0.7.4：伺服器掉落——關卡中記紫色 ?（run.dropsBy），結算畫面 #go-server-loot 分配完才讀物品，寫進掉落紀錄與場次紀錄
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html><head><meta charset="utf-8"></head><body style="background:#334">
    <div id="gameover"><h2 id="go-title">你存活下來了！</h2><div id="go-server-loot" class="go-loot-wait"><p class="go-loot-note">正在分配戰利品…</p></div><button id="btn-restart" disabled>返回角色</button></div></body></html>` }));
  await p.addInitScript(() => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: true, pick: true, loop: false, v: 3, tab: 'log', activeProfile: 'A', profiles: { A: { stage: '斐揚洞穴' } } }));
    const run = { state: 'playing', time: 900, level: 70, kills: 16000, zeny: 0, chestCost: () => 30, chestsOpened: 46, player: { x: 500, y: 500 }, pickups: [], touchMove: { x: 0, y: 0 }, bounds: { x0: 0, x1: 3000, y0: 0, y1: 3000 },
      enemies: [{ x: 900, y: 900, def: { id: 'munak', name: 'Munak' } }, { x: 950, y: 900, def: { id: 'skeleton', name: 'Skeleton' } }],
      dropsBy: new Map([['munak', [3, 1]], ['skeleton', [2, 1]]]), weapons: [], classDef: { id: 'acolyte', name: '服事' }, runItems: { slots: new Map() }, runItemName: (s, i) => i, perksLeft: {}, stats: { maxHp: 100 }, hp: 100 };
    window.__roHook = { run, lobby: null, runs: 1, runSeq: 7, drops: 0, stuck: 0 };
  });
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  await p.waitForTimeout(2600); // 讓 bot 記下怪物名稱
  let ok0;
  ok0 = await p.evaluate(() => /\? 裝備 5・卡 2/.test(document.getElementById('rb-st').textContent));
  await p.evaluate(() => { window.__roHook.run.state = 'over'; });
  await p.waitForTimeout(2600); // 結算標題先出現 → 寫紀錄；物品還在分配
  const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
  ok(ok0, '狀態列顯示這場 ? 數量');
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.drops') || '[]').length) === 0, '分配中不記掉落');
  await p.evaluate(() => { const g = document.getElementById('go-server-loot'); g.className = ''; g.innerHTML = '<div class="go-items"><img class="q4" title="Necklace of Luck (傳說)"><img class="q0" title="Munak Hat (普通)"><img class="q2" title="Skull Ring of Dexterity (稀有)"></div><div class="go-cards"><img class="cardimg" title="Munak Card"><img class="cardimg" title="Skeleton Card"></div>'; });
  await p.waitForTimeout(800);
  const drops = await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.drops') || '[]'));
  ok(drops.length === 5, '結算物品 5 件 ' + drops.map(d => d.kind + ':' + d.q + ':' + d.name).join(' | '));
  ok(drops[0].q === '傳說' && drops[0].name === 'Necklace of Luck' && drops[3].kind === '卡片', '名稱／品質／種類解析');
  const log = await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.log') || '[]').at(-1));
  ok(log && JSON.stringify(log.myst) === '[5,2]', '場次紀錄 ? 數 ' + JSON.stringify(log?.myst));
  ok(log && /Munak 3\+1卡/.test(log.src || ''), '? 來源用怪物名稱 ' + log?.src);
  ok(log && log.drops.length === 5, '紀錄先寫 → 補上掉落 ' + JSON.stringify(log?.drops));
  await p.waitForTimeout(400);
  const html = await p.evaluate(() => document.getElementById('rb-log')?.innerText || '');
  ok(/稀有以上/.test(html) && /Necklace of Luck/.test(html) && /卡片 2 種/.test(html), '紀錄分頁顯示稀有以上與卡片');
  await p.screenshot({ path: __dirname + '/out/server-loot.png', clip: { x: 0, y: 60, width: 300, height: 700 } });
  ok(!errs.length, 'no page errors ' + errs.join(';'));
  await b.close();
})();
