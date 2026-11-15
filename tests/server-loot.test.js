// v0.7.4：伺服器掉落（v0.7.8：部位／素質、每場小卡、舊紀錄相容）——關卡中記紫色 ?（run.dropsBy），結算畫面 #go-server-loot 分配完才讀物品，寫進掉落紀錄與場次紀錄
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html><head><meta charset="utf-8"></head><body style="background:#334">
    <div id="gameover"><h2 id="go-title">你存活下來了！</h2><div id="go-server-loot" class="go-loot-wait"><p class="go-loot-note">正在分配戰利品…</p></div><button id="btn-restart" disabled>返回角色</button></div></body></html>` }));
  const GRANTED = { gear: [{ itemId: 2603, quality: 4, affixes: [{ stat: 'luk', v: 3 }] }, { itemId: 5026, quality: 0, affixes: [] }, { itemId: 1720, quality: 2, affixes: [{ stat: 'dex', v: 2 }], refine: 0 }], cards: ['munak', 'skeleton'], eggs: [] };
  await p.route('**/api/op', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ rev: 1, doc: { secret: 1 }, granted: GRANTED }) }));
  await p.addInitScript(() => {
    // 舊版紀錄（只有字串）＋寄到郵差的那場
    localStorage.setItem('roBot.log', JSON.stringify([
      { at: Date.now() - 3600e3, stage: '下水道', result: '通關', time: 600, level: 50, seq: 1, myst: [2, 1], drops: ['稀有 Gold Ring of Dexterity', '普通 Ribbon', 'Munak Card'] },
      { at: Date.now() - 1800e3, stage: '斐揚洞穴', result: '通關', time: 900, level: 70, seq: 2, myst: [9, 6], drops: [], lootNote: '戰利品在普隆德拉郵差那裡。' }]));
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
  // 遊戲送出 loot 請求：回應要原封不動給遊戲，bot 另外讀副本
  const gameGot = await p.evaluate(async () => { const r = await fetch('/api/op', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'loot', key: 'k', kills: 1 }) }); return r.json(); });
  ok(JSON.stringify(gameGot.granted) === JSON.stringify(GRANTED) && gameGot.doc?.secret === 1, '遊戲拿到的回應不變');
  await p.waitForTimeout(100);
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.lootRaw') || '[]'));
  ok(raw.length === 1 && raw[0].op === 'loot' && raw[0].gear.length === 3 && !('doc' in raw[0]), '只存 granted（不存角色存檔）');
  await p.evaluate(() => { const g = document.getElementById('go-server-loot'); g.className = ''; g.innerHTML = '<div class="go-items"><img class="q4" src="/items/2603.png" title="Necklace of Luck (傳說)"><img class="q0" src="/items/5026.png" title="Munak Hat (普通)"><img class="q2" src="/items/1720.png" title="Great Bow of Dexterity (稀有)"></div><div class="go-cards"><img class="cardimg" title="Munak Card"><img class="cardimg" title="Skeleton Card"></div>'; });
  await p.waitForTimeout(800);
  const drops = await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.drops') || '[]'));
  ok(drops.length === 5, '結算物品 5 件 ' + drops.map(d => d.kind + ':' + d.q + ':' + d.name).join(' | '));
  ok(drops[0].q === '傳說' && drops[0].name === 'Necklace of Luck' && drops[3].kind === '卡片', '名稱／品質／種類解析');
  const log = await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.log') || '[]').at(-1));
  ok(log && JSON.stringify(log.myst) === '[5,2]', '場次紀錄 ? 數 ' + JSON.stringify(log?.myst));
  ok(log && /Munak 3\+1卡/.test(log.src || ''), '? 來源用怪物名稱 ' + log?.src);
  ok(log && log.drops.length === 5, '紀錄先寫 → 補上掉落 ' + JSON.stringify(log?.drops));
  ok(log && JSON.stringify(log.items.slice(0, 3).map(x => [x.slot, x.stat])) === JSON.stringify([['飾品', 'LUK'], ['頭飾', ''], ['武器', 'DEX']]), '部位／素質 ' + JSON.stringify(log?.items));
  await p.waitForTimeout(400);
  const html = await p.evaluate(() => document.getElementById('rb-log')?.innerText || '');
  ok(/傳說 飾品 Necklace LUK \+3/.test(html) && /稀有 武器 Great Bow DEX \+2/.test(html) && /普通 頭飾 Munak Hat\n/.test(html) && /卡片 Munak・Skeleton/.test(html), '這場小卡：品質 部位 名稱 +素質、卡片 ' + html.slice(0, 600));
  ok(/稀有 Gold Ring \+DEX/.test(html) && /卡片 Munak/.test(html), '舊紀錄也能顯示（素質從名稱解析）');
  ok(/郵差/.test(html), '寄到郵差的那場顯示原因');
  ok(html.indexOf('Necklace') < html.indexOf('Gold Ring'), '最新的在上面');
  await p.screenshot({ path: __dirname + '/out/server-loot.png', clip: { x: 0, y: 60, width: 300, height: 700 } });
  ok(!errs.length, 'no page errors ' + errs.join(';'));
  await b.close();
})();
