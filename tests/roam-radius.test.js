// v0.9.13 遊走範圍 roamRadius：中心＝開場位置；遊走目標在範圍內、範圍外的掉落不去；0＝不限
const { chromium } = require('playwright');
async function open(b, R, pickups) {
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('https://ro-survivors.com/', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><meta charset="utf-8"></head><body></body></html>' }));
  await p.addInitScript(([R, pickups]) => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: true, pick: false, loop: false, v: 3, activeProfile: 'A', profiles: { A: { mode: 'roam', roamRadius: R, gate: { on: false } } } }));
    const run = { state: 'playing', stageId: 'payon', time: 30, level: 5, zeny: 0, chestCost: () => 999, chestsOpened: 0, player: { x: 1500, y: 1500 }, pickups, touchMove: { x: 0, y: 0 },
      world3d: { project: (x, y) => ({ x: x / 4, y: y / 4 }) }, bounds: { x0: 0, x1: 3000, y0: 0, y1: 3000 }, enemies: [], weapons: [], classDef: { id: 'mage' }, runItems: { slots: new Map() }, runItemName: (s, i) => i, perksLeft: {}, stats: { maxHp: 100 }, hp: 100 };
    window.__roHook = { run, lobby: null, runs: 1, runSeq: 1, drops: 0, stuck: 0 };
  }, [R, pickups]);
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  await p.waitForTimeout(1500);
  return { p, errs };
}
(async () => {
  const b = await chromium.launch();
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  const tgt = (p) => p.evaluate(() => { const t = window.__roBot.steer?.target; return t && { x: Math.round(t.x), y: Math.round(t.y), obj: !!t.obj, wander: !!t.wander }; });
  // 1) 範圍 400：範圍外 450 的磁鐵不去，改去範圍內 200 的
  let { p, errs } = await open(b, 400, [{ kind: 'magnet', x: 1950, y: 1500 }, { kind: 'magnet', x: 1700, y: 1500 }]);
  let t = await tgt(p);
  ok(t && t.obj && t.x === 1700, '範圍外的掉落不去，撿範圍內的 ' + JSON.stringify(t));
  ok(await p.evaluate(() => { const g = document.querySelector('#rb-roam'); const pts = g?.querySelector('polygon')?.getAttribute('points')?.split(' ') || []; const xs = pts.map((q) => +q.split(',')[0]); return g.style.display !== 'none' && pts.length === 48 && Math.round(Math.max(...xs) - Math.min(...xs)) === 200; }), '畫面上畫出範圍框（半徑 400 → 寬 200 畫面像素）');
  ok(/離中心 \d+\/400/.test(await p.evaluate(() => document.querySelector('#rb-st').innerText)), '狀態列顯示離中心');
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();
  // 2) 範圍 400、沒東西撿：遊走目標都在範圍內（多抽幾次）
  ({ p, errs } = await open(b, 400, []));
  const ds = [];
  for (let i = 0; i < 6; i++) { await p.evaluate(() => { window.__roBot.steer.targetAt = 0; }); await p.waitForTimeout(400); const w = await tgt(p); if (w) ds.push(Math.hypot(w.x - 1500, w.y - 1500)); }
  ok(ds.length >= 3 && ds.every((d) => d <= 400), '遊走目標都在 400 內 ' + ds.map(Math.round).join(','));
  await p.close();
  // 3) 0＝不限：範圍外的也去
  ({ p, errs } = await open(b, 0, [{ kind: 'magnet', x: 1950, y: 1500 }]));
  t = await tgt(p);
  ok(t && t.obj && t.x === 1950, '0＝不限，照舊撿 ' + JSON.stringify(t));
  ok(await p.evaluate(() => !document.querySelector('#rb-roam') || document.querySelector('#rb-roam').style.display === 'none'), '0＝不限 → 不畫框');
  await p.close();
  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
