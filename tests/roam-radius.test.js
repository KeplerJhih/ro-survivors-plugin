// v0.9.13 遊走範圍 roamRadius：中心＝開場位置；遊走目標在範圍內、範圍外的掉落不去；0＝不限
const { chromium } = require('playwright');
async function open(b, R, pickups, extra = {}) {
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('https://ro-survivors.com/', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><meta charset="utf-8"></head><body></body></html>' }));
  await p.addInitScript(([R, pickups, extra]) => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: true, pick: false, loop: false, v: 3, activeProfile: 'A', profiles: { A: { mode: 'roam', roamRadius: R, gate: { on: false }, ...(extra.prof || {}) } } }));
    const run = { state: 'playing', stageId: 'payon', time: 30, level: 5, zeny: 0, chestCost: () => 999, chestsOpened: 0, player: { x: 1500, y: 1500 }, pickups, touchMove: { x: 0, y: 0 },
      world3d: { project: (x, y) => ({ x: x / 4, y: y / 4 }) }, bounds: { x0: 0, x1: 3000, y0: 0, y1: 3000 }, enemies: [], weapons: [], classDef: { id: 'mage' }, runItems: { slots: new Map() }, runItemName: (s, i) => i, perksLeft: {}, stats: { maxHp: 100 }, hp: 100 };
    Object.assign(run, extra.run || {});
    window.__roHook = { run, lobby: null, runs: 1, runSeq: 1, drops: 0, stuck: 0 };
  }, [R, pickups, extra]);
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
  // 4) 軟牆：站在範圍外圈（中心 1500、角色 1850，R=400），怪從內側逼近 → 有範圍時往外走的分量比不限時小
  const wallRun = async (R) => { const o = await open(b, R, [], { run: { player: { x: 1500, y: 1500 }, enemies: [] } }); await o.p.evaluate(() => { const r = window.__roHook.run; window.__sim = setInterval(() => { r.player.x += r.touchMove.x * 6; r.player.y += r.touchMove.y * 6; }, 50); }); return o; };
  const outward = async (R) => {
    const { p } = await wallRun(R);
    await p.evaluate(() => { const r = window.__roHook.run; r.player.x = 1850; r.enemies.push({ x: 1760, y: 1500, def: {} }, { x: 1770, y: 1440, def: {} }, { x: 1770, y: 1560, def: {} }); });
    const xs = [], ys = [];
    for (let i = 0; i < 8; i++) { await p.waitForTimeout(150); xs.push(await p.evaluate(() => window.__roHook.run.touchMove.x)); ys.push(await p.evaluate(() => Math.abs(window.__roHook.run.touchMove.y))); }
    await p.close();
    return Math.max(...xs);
  };
  const oWall = await outward(400);
  ok(oWall < 0.5, `軟牆：在範圍邊緣被怪從內側逼近，不會直直往外跑（往外分量最多 ${oWall.toFixed(2)}，改成側閃）`);
  { // 4b) 被包圍（危險很高）時軟牆減弱，可以往外逃
    const { p } = await wallRun(400);
    await p.evaluate(() => { const r = window.__roHook.run; r.player.x = 1850; for (const d of [45, 130, 220, 310]) for (let k = 2; k <= 14; k++) { const a = (k / 16) * Math.PI * 2; r.enemies.push({ x: 1850 + Math.cos(a) * d, y: 1500 + Math.sin(a) * d, def: {} }); } });
    const xs = []; for (let i = 0; i < 6; i++) { await p.waitForTimeout(150); xs.push(await p.evaluate(() => window.__roHook.run.touchMove.x)); }
    ok(Math.max(...xs) > 0.5, '被層層包圍、只剩範圍外有缺口時，軟牆減弱、往外逃 ' + xs.map((x) => x.toFixed(2)).join(','));
    await p.close();
  }
  // 5) 低血撤退：HP 30%（門檻 50）→ 狀態列 🩸，遠的磁鐵不撿、肉照撿
  ({ p, errs } = await open(b, 0, [{ kind: 'magnet', x: 1800, y: 1500 }, { kind: 'meat', x: 1500, y: 1900 }], { run: { hp: 30 } }));
  t = await tgt(p);
  ok(t && t.obj && t.y === 1900, '低血：只撿肉、不去撿遠的磁鐵 ' + JSON.stringify(t));
  ok(/🩸低血撤退/.test(await p.evaluate(() => document.querySelector('#rb-st').innerText)), '狀態列顯示低血撤退');
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();
  ({ p } = await open(b, 0, [{ kind: 'magnet', x: 1800, y: 1500 }], { run: { hp: 30 }, prof: { lowHpPct: 0 } }));
  t = await tgt(p);
  ok(t && t.obj && t.x === 1800, '低血撤退設 0＝關，照舊撿磁鐵 ' + JSON.stringify(t));
  await p.close();
  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
