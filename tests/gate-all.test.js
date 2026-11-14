// v0.7.2：巡邏條件固定「全部」——學到技能但神祇還沒拿到時仍要繼續獵神；神祇失敗處理改成圓鈕
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 760 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><meta charset="utf-8"></head><body style="background:#334"></body></html>' }));
  await p.addInitScript(() => {
    // 舊設定：need 'any'（以前的致死設定）＋技能條件已達成、神祇還沒拿到
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: true, pick: true, profiles: { A: { mode: 'idle', priority: { acolyte: ['神聖之光'] }, deity: { '堡壘之神': 'want' },
      gate: { on: true, deity: true, skillOn: true, skillTop: 1, skillLv: 1, skillNeed: 'any', need: 'any', after: 'idle' }, huntPhase: { on: true, onFail: 'farm' }, huntLeaveChests: 10 } }, activeProfile: 'A', v: 3, tab: 'main' }));
    localStorage.setItem('roBot.skillMap', JSON.stringify({ '神聖之光': 'holy_light' }));
    const run = { state: 'playing', time: 10, zeny: 0, chestCost: () => 30, chestsOpened: 0, player: { x: 500, y: 500 }, enemies: [], pickups: [], touchMove: { x: 0, y: 0 }, bounds: { x0: 0, x1: 3000, y0: 0, y1: 3000 },
      weapons: [{ id: 'holy_light', rank: 1 }], classDef: { id: 'acolyte' }, slots: ['holy_light'], skillLevel(id) { return this.weapons.find(w => w.id === id)?.rank || 0; }, runItems: { slots: new Map() }, runItemName: (s, i) => i, perksLeft: {}, stats: { maxHp: 100 }, hp: 100 };
    window.__roHook = { run, lobby: null, runs: 1, runSeq: 1, drops: 0, stuck: 0 };
  });
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  await p.waitForTimeout(600);
  const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
  ok(await p.evaluate(() => window.__roBot.phase) === 'hunt', '學到技能、神祇未拿到 → 仍在獵神 (hunt)');
  ok(await p.evaluate(() => !document.querySelector('[data-k="gate.need"],[data-k="gate.skillNeed"]')), '面板已拿掉「任一／全部」');
  ok(await p.evaluate(() => document.querySelector('input[type=radio][data-k="huntPhase.onFail"][value=farm]').checked), '圓鈕反映目前設定 (farm)');
  await p.click('input[type=radio][data-k="huntPhase.onFail"][value=leave]');
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.cfg')).profiles.A.huntPhase.onFail) === 'leave', '點「離開這場重來」→ 存成 leave');
  // 拿到神祇 → 兩個條件都達成 → farm
  await p.evaluate(() => { window.__roHook.run.runItems.slots.set('deity', { item: '堡壘之神' }); });
  await p.waitForTimeout(800);
  ok(await p.evaluate(() => window.__roBot.phase) === 'farm', '神祇＋技能都達成 → 切換掛機 (farm)');
  await p.screenshot({ path: __dirname + '/out/gate-all.png', clip: { x: 0, y: 60, width: 300, height: 560 } });
  ok(!errs.length, 'no page errors ' + errs.join(';'));
  await b.close();
})();
