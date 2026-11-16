// v0.8.9：開局（獵神中）——落單的經驗寶石 400 內也會去撿；閒晃改短程、留在怪附近（以前 600～1600 而且偏好遠離怪群）
// 沒在獵神（一般遊走）時維持原本行為
const { chromium } = require('playwright');
async function open(b, hunt, gems) {
  const p = await b.newPage({ viewport: { width: 900, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><meta charset="utf-8"></head><body></body></html>' }));
  await p.addInitScript(([hunt, gems]) => {
    const pf = hunt ? { mode: 'roam', gate: { on: true, deity: true }, deityOn: true, deity: { '堡壘之神': 'want' } } : { mode: 'roam' };
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: true, pick: false, loop: false, v: 3, tab: 'main', activeProfile: 'A', profiles: { A: pf } }));
    // 怪群在東邊約 600～700，角色在 (3000,3000)
    const enemies = Array.from({ length: 12 }, (_, i) => ({ x: 3650 + (i % 4) * 30, y: 2950 + Math.floor(i / 4) * 40, hp: 50, def: { id: 'spore', name: 'Spore' } }));
    const pickups = gems ? [{ x: 3000, y: 2680, kind: 'gem_blue', value: 1 }] : []; // 落單寶石，北邊 320
    const run = { state: 'playing', time: 20, level: 2, zeny: 0, chestCost: () => 30, chestsOpened: 0, player: { x: 3000, y: 3000 }, pickups, touchMove: { x: 0, y: 0 },
      bounds: { x0: 0, x1: 8000, y0: 0, y1: 8000 }, enemies, weapons: [], classDef: { id: 'acolyte' }, runItems: { slots: new Map() }, runItemName: (s, i) => i, perksLeft: {}, stats: { maxHp: 500 }, hp: 500 };
    window.__roHook = { run, lobby: null, runs: 1, runSeq: 1, drops: 0, stuck: 0 };
  }, [hunt, gems]);
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  return { p, errs };
}
const tgt = (p) => p.evaluate(() => { const T = window.__roBot.steer?.target, P = window.__roHook.run.player; return T && { kind: T.obj?.kind || (T.wander ? 'wander' : T.elite ? 'elite' : '?'), d: Math.round(Math.hypot(T.x - P.x, T.y - P.y)), dc: Math.round(Math.hypot(T.x - 3695, T.y - 2990)) }; });
(async () => {
  const b = await chromium.launch();
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };

  // 1) 獵神中：320 外落單的經驗寶石 → 去撿
  let { p, errs } = await open(b, true, true);
  await p.waitForTimeout(600);
  let t = await tgt(p);
  ok(t?.kind === 'gem_blue', '獵神中：去撿 320 外落單的經驗 ' + JSON.stringify(t));
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  // 2) 獵神中、沒東西撿：閒晃點短程、靠近怪群（20 次取樣）
  const near = [], far = [];
  for (const [hunt, out] of [[true, near], [false, far]]) {
    ({ p, errs } = await open(b, hunt, false));
    for (let k = 0; k < 10; k++) {
      await p.waitForTimeout(150);
      const s = await p.evaluate(() => { const P = window.__roHook.run.player; P.x = 3000; P.y = 3000; window.__roBot.steer.target = null; window.__roBot.steer.targetAt = 0; return 1; });
      await p.waitForTimeout(150);
      const tt = await tgt(p); if (tt?.kind === 'wander') out.push(tt);
    }
    ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();
  }
  const avg = (a, k) => Math.round(a.reduce((s, x) => s + x[k], 0) / (a.length || 1));
  ok(near.length >= 5 && near.every((x) => x.d <= 820), `獵神閒晃：都在 800 內（平均 ${avg(near, 'd')}）`);
  ok(avg(near, 'dc') < 650, `獵神閒晃：靠近怪群（離怪群平均 ${avg(near, 'dc')}）`);
  ok(far.length >= 5 && avg(far, 'd') > 600 && avg(far, 'dc') > avg(near, 'dc'), `一般遊走維持原本：較遠、遠離怪群（平均距離 ${avg(far, 'd')}、離怪群 ${avg(far, 'dc')}）`);

  // 3) 一般遊走：落單寶石 320 外不特別去撿（維持原本）
  ({ p, errs } = await open(b, false, true));
  await p.waitForTimeout(600);
  t = await tgt(p);
  ok(t?.kind !== 'gem_blue', '一般遊走：落單寶石維持原本不追 ' + JSON.stringify(t));
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
