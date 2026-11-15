// v0.8.0／0.8.1：手動模式（標題列 ▶ 自動中／✋ 手動、F8）——bot 不操作，各開關設定保留；再按一次恢復。也測新版面（總開關列、分頁）
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><meta charset="utf-8"></head><body></body></html>' }));
  await p.addInitScript(() => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: true, pick: true, loop: true, v: 3, tab: 'perk', activeProfile: 'A', profiles: { A: { mode: 'roam', priority: ['神聖之光'] } } }));
    const run = { state: 'playing', time: 10, level: 5, zeny: 0, chestCost: () => 30, chestsOpened: 0, player: { x: 500, y: 500 }, pickups: [], touchMove: { x: 0, y: 0 }, bounds: { x0: 0, x1: 3000, y0: 0, y1: 3000 },
      enemies: [{ x: 560, y: 500, hp: 10, def: { id: 'poring', name: 'Poring' } }], weapons: [], classDef: { id: 'acolyte' }, runItems: { slots: new Map() }, runItemName: (s, i) => i, perksLeft: {}, stats: { maxHp: 100 }, hp: 100 };
    window.__roHook = { run, lobby: null, runs: 1, runSeq: 1, drops: 0, stuck: 0 };
  });
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  await p.waitForTimeout(800);
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  const cfg = () => p.evaluate(() => JSON.parse(localStorage.getItem('roBot.cfg')));
  const move = () => p.evaluate(() => { const t = window.__roHook.run.touchMove; return Math.hypot(t.x, t.y); });

  ok((await cfg()).tab === 'skill', '舊的「重抽」分頁轉到技能');
  ok(await p.evaluate(() => [...document.querySelectorAll('nav button')].map(b => b.textContent).join(',')) === '玩法,關卡,技能,寶箱,紀錄,⚙', '分頁：玩法 關卡 技能 寶箱 紀錄 ⚙');
  ok(await p.evaluate(() => !!document.querySelector('.pg[data-pg=skill] input[data-k="perks.skill.reroll_card"]') && !!document.querySelector('.pg[data-pg=chest] input[data-k="perks.deity.banish"]') && !!document.querySelector('.pg[data-pg=log] select[data-k="roll.mode"]') && !!document.querySelector('.pg[data-pg=sys] #rb-cu')), '重抽次數拆進技能／寶箱；擲骰在紀錄；帳號在 ⚙');
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('[data-show="@idle"]')).display === 'none' && getComputedStyle(document.querySelector('[data-show="@roam"]')).display !== 'none'), '一直遊走時只顯示遊走細節');
  ok(await move() > 0, '自動時會移動');

  await p.click('#rb-manual'); await p.waitForTimeout(400);
  ok(await move() === 0, '手動：停止移動');
  let c = await cfg(); ok(c.manual === true && c.fight && c.pick && c.loop, '手動：開關設定保留 ' + JSON.stringify({ m: c.manual, f: c.fight, p: c.pick, l: c.loop }));
  ok(/手動模式/.test(await p.evaluate(() => document.getElementById('rb-st').textContent)) && await p.evaluate(() => document.getElementById('robot-panel').classList.contains('manual')), '手動：狀態列與外觀');
  ok(await p.evaluate(() => document.getElementById('rb-manual').closest('header') && document.getElementById('rb-manual').textContent === '✋ 手動'), '總電源在標題列，手動時顯示「✋ 手動」');
  ok(await p.evaluate(() => { const n = document.querySelector('.pg[data-pg=main] .man-note'); return !!document.querySelector('.pg[data-pg=main] .box.auto input[data-k=fight]') && getComputedStyle(n).display !== 'none'; }), '玩法頁「自動做哪些事」顯示手動提示');
  // 手動時出現升級選卡，不能代選
  await p.evaluate(() => { window.__picked = 0; const r = window.__roHook.run; r.state = 'levelup'; document.body.insertAdjacentHTML('beforeend', '<div id="picker"><div id="pk-cards"><div class="pk-slot"><div class="pk-pop"><button class="pk-card"><b class="pk-name">神聖之光 (Holy Light)</b></button></div></div></div></div>'); document.querySelector('.pk-card').onclick = () => window.__picked++; });
  await p.waitForTimeout(2000);
  ok(await p.evaluate(() => window.__picked) === 0, '手動：不代選卡');

  await p.keyboard.press('F8'); await p.waitForTimeout(2000);
  ok((await cfg()).manual === false, 'F8 恢復自動');
  ok(await p.evaluate(() => window.__picked) > 0, '恢復後照常選卡');
  ok(!errs.length, 'no page errors ' + errs.join(';'));
  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
