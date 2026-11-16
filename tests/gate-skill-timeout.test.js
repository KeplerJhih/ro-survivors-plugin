// v0.9.1：技能條件逾時——整場都沒出現指定技能（隨機）時，第 N 分鐘就直接切換掛機；0＝一直等；舊設定預設 5 分鐘
const { chromium } = require('playwright');
async function open(b, gate) {
  const p = await b.newPage({ viewport: { width: 900, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><meta charset="utf-8"></head><body></body></html>' }));
  await p.addInitScript((gate) => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: true, pick: true, loop: false, v: 3, tab: 'main', activeProfile: 'A', profiles: { A: { mode: 'idle', priority: ['神聖之光'], gate } } }));
    // 沒學到神聖之光（只有治癒術）
    const run = { state: 'playing', time: 30, zeny: 0, chestCost: () => 30, chestsOpened: 0, player: { x: 500, y: 500 }, enemies: [], pickups: [], touchMove: { x: 0, y: 0 }, bounds: { x0: 0, x1: 3000, y0: 0, y1: 3000 },
      weapons: [{ id: 'heal', rank: 3 }], classDef: { id: 'acolyte' }, slots: ['heal'], skillLevel(id) { return this.weapons.find((w) => w.id === id)?.rank || 0; }, runItems: { slots: new Map() }, runItemName: (s, i) => i, perksLeft: {}, stats: { maxHp: 100 }, hp: 100 };
    window.__roHook = { run, lobby: null, runs: 1, runSeq: 1, drops: 0, stuck: 0 };
  }, gate);
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  await p.waitForTimeout(600);
  return { p, errs };
}
const st = (p) => p.evaluate(() => ({ phase: window.__roBot.phase, line: document.getElementById('rb-st').textContent.split('\n').find((l) => /技能/.test(l)) || '' }));
const at = (p, t) => p.evaluate((t) => { window.__roHook.run.time = t; }, t).then(() => p.waitForTimeout(800));
(async () => {
  const b = await chromium.launch();
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };

  // 1) 舊設定沒有這個欄位 → 預設 5 分鐘
  let { p, errs } = await open(b, { on: true, deity: false, skillOn: true, skillTop: 1, skillLv: 1 });
  ok((await st(p)).phase === 'hunt', '30 秒還沒學到：巡邏中 ' + JSON.stringify(await st(p)));
  ok(await p.evaluate(() => document.querySelector('input[data-k="gate.skillMaxMin"]').value) === '5', '面板顯示預設 5 分鐘');
  await at(p, 299); ok((await st(p)).phase === 'hunt', '4:59 還在巡邏');
  await at(p, 300); let s = await st(p);
  ok(s.phase === 'farm' && /技能 逾時/.test(s.line), '5:00 到 → 切換掛機、狀態列寫「逾時」 ' + JSON.stringify(s));
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  // 2) 0＝一直等
  ({ p, errs } = await open(b, { on: true, deity: false, skillOn: true, skillTop: 1, skillLv: 1, skillMaxMin: 0 }));
  await at(p, 900); ok((await st(p)).phase === 'hunt', '設 0：15 分鐘還在等');
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  // 3) 有學到就照常（不受逾時影響）
  ({ p, errs } = await open(b, { on: true, deity: false, skillOn: true, skillTop: 1, skillLv: 1, skillMaxMin: 2 }));
  await p.evaluate(() => { window.__roHook.run.weapons.push({ id: 'holy_light', rank: 1 }); });
  // 讓 bot 認得「神聖之光」＝holy_light：升級卡出現一次
  await p.evaluate(() => { const r = window.__roHook.run; r.state = 'levelup'; document.body.insertAdjacentHTML('beforeend', '<div id="picker"><h2 id="pk-title">升級！</h2><div id="pk-cards"><div class="pk-slot"><div class="pk-pop"><button class="pk-card"><b class="pk-name">神聖之光 (Holy Light)</b></button></div></div></div></div>');
    document.querySelector('.pk-card').onclick = () => { document.getElementById('picker').remove(); r.state = 'playing'; }; });
  await p.waitForTimeout(2500);
  s = await st(p); ok(s.phase === 'farm' && /技能 ✓/.test(s.line), '學到了 → ✓ 照常切換 ' + JSON.stringify(s));
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
