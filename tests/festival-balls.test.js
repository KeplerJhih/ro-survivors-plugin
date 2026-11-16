// v0.9.3 燈籠節扭蛋：結算畫面的扭蛋（不是 items/編號、名稱沒品質）記成「扭蛋」不是寵物蛋；關卡 louyang 記成燈籠節；
// 舊紀錄（記成蛋、關卡記成設定的關卡）一次修正
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html><head><meta charset="utf-8"></head><body>
    <div id="gameover"><h2 id="go-title">你死了</h2><div id="go-server-loot" class="go-loot-wait"><p class="go-loot-note">正在分配戰利品…</p></div><button id="btn-restart" disabled>返回角色</button></div></body></html>` }));
  await p.addInitScript(() => {
    const t0 = Date.now() - 3600e3;
    localStorage.setItem('roBot.drops', JSON.stringify([{ at: t0, seq: 4, stage: '斐揚森林', kind: '蛋', q: '', name: '節慶扭蛋' }, { at: t0, seq: 4, stage: '斐揚森林', kind: '蛋', q: '', name: 'Poring Egg' }]));
    localStorage.setItem('roBot.log', JSON.stringify([{ at: t0, stage: '斐揚森林', result: '死亡', time: 380, seq: 4, items: [{ q: '', name: '節慶扭蛋', kind: '蛋' }] },
      { at: t0 + 1, stage: '斐揚森林', result: '通關', time: 860, seq: 3, items: [{ q: '', name: 'Poring Egg', kind: '蛋' }] }]));
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: true, pick: true, loop: true, v: 3, tab: 'log', activeProfile: 'A', profiles: { A: { stage: '斐揚森林' } } }));
    const run = { state: 'playing', stageId: 'louyang', time: 380, level: 32, kills: 900, zeny: 0, chestCost: () => 30, chestsOpened: 5, player: { x: 500, y: 500 }, pickups: [], touchMove: { x: 0, y: 0 }, bounds: { x0: 0, x1: 3000, y0: 0, y1: 3000 },
      enemies: [], weapons: [], classDef: { id: 'acolyte', name: '服事' }, runItems: { slots: new Map() }, runItemName: (s, i) => i, perksLeft: {}, stats: { maxHp: 100 }, hp: 100 };
    window.__roHook = { run, lobby: null, runs: 1, runSeq: 9, drops: 0, stuck: 0 };
  });
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  await p.waitForTimeout(600);
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  let d = await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.drops')));
  ok(d[0].kind === '扭蛋' && d[0].stage === '燈籠節' && d[1].kind === '蛋' && d[1].stage === '斐揚森林', '舊掉落：扭蛋改正、寵物蛋不動 ' + JSON.stringify(d.map((x) => x.kind + '/' + x.stage)));
  let L = await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.log')));
  ok(L[0].stage === '燈籠節' && L[0].items[0].kind === '扭蛋' && L[1].stage === '斐揚森林', '舊場次：有扭蛋的那場改成燈籠節');
  // 新的一場燈籠節結束（設定的關卡是斐揚森林）
  await p.evaluate(() => { window.__roHook.run.state = 'over'; });
  await p.waitForTimeout(2600);
  await p.evaluate(() => { const g = document.getElementById('go-server-loot'); g.className = ''; g.innerHTML = '<div class="go-items"><img class="q4" src="/items/2603.png" title="Necklace of Luck (傳說)"><img class="q3" src="/assets/gacha/ball_fest.png" title="節慶扭蛋"><img class="q3" src="/assets/gacha/ball_fest.png" title="節慶扭蛋"></div>'; });
  await p.waitForTimeout(800);
  d = await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.drops')).filter((x) => x.seq === 9));
  ok(d.length === 3 && d.filter((x) => x.kind === '扭蛋').length === 2 && d.every((x) => x.stage === '燈籠節'), '新場次：2 顆扭蛋＋1 件裝備，關卡燈籠節 ' + JSON.stringify(d.map((x) => x.kind + '/' + x.name + '/' + x.stage)));
  L = await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.log')).at(-1));
  ok(L.stage === '燈籠節', '場次紀錄關卡＝燈籠節 ' + L.stage);
  ok(/扭蛋<\/span> 節慶扭蛋 ×2/.test(await p.evaluate(() => document.getElementById('rb-log').innerHTML)), '每場小卡顯示「扭蛋 節慶扭蛋 ×2」');
  ok(!errs.length, 'no page errors ' + errs.join(';'));
  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
