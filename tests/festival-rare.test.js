// v0.9.8 燈籠節「只打有隱藏王的場次」：run.rareId 沒有 → 開場幾秒後按結束這場；有 → 照打；選項關閉 → 照打；狀態列顯示
const { chromium } = require('playwright');
async function open(b, { rare, on, stageId = 'louyang' }) {
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('https://ro-survivors.com/', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html><head><meta charset="utf-8"></head><body><button id="btn-endrun" onclick="window.__ended=(window.__ended||0)+1">結束這場</button></body></html>` }));
  await p.addInitScript(([rare, on, stageId]) => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: false, pick: true, loop: true, v: 3, activeProfile: 'A', profiles: { A: { stage: '燈籠節', festRareOnly: on } } }));
    const run = { state: 'playing', stageId, rareId: rare ? 'dark_snake_lord' : null, time: 1, level: 1, kills: 0, zeny: 0, chestCost: () => 30, chestsOpened: 0, player: { x: 500, y: 500 }, pickups: [], touchMove: { x: 0, y: 0 }, bounds: { x0: 0, x1: 3000, y0: 0, y1: 3000 },
      enemies: [], weapons: [], classDef: { id: 'acolyte' }, runItems: { slots: new Map() }, runItemName: (s, i) => i, perksLeft: {}, stats: { maxHp: 100 }, hp: 100 };
    window.__roHook = { run, lobby: null, runs: 1, runSeq: 1, drops: 0, stuck: 0 };
    setInterval(() => { run.time += 1; }, 200); // 遊戲時間 5 倍速
  }, [rare, on, stageId]);
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  await p.waitForTimeout(3500);
  return { p, errs };
}
(async () => {
  const b = await chromium.launch();
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  const st = (p) => p.evaluate(() => document.querySelector('#rb-st').innerText.replace(/\s+/g, ' '));
  let { p, errs } = await open(b, { rare: false, on: true });
  ok(await p.evaluate(() => window.__ended === 1), '沒有隱藏王 → 結束這場（只按一次） ' + (await p.evaluate(() => window.__ended)));
  ok(await p.evaluate(() => window.__roHook.run.time) >= 3, '不是一進場就秒退');
  ok(/無隱藏王/.test(await st(p)), '狀態列顯示無隱藏王');
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();
  ({ p, errs } = await open(b, { rare: true, on: true }));
  ok(!(await p.evaluate(() => window.__ended)), '有隱藏王 → 照打');
  ok(/🐍隱藏王/.test(await st(p)), '狀態列顯示 🐍隱藏王');
  await p.close();
  ({ p, errs } = await open(b, { rare: false, on: false }));
  ok(!(await p.evaluate(() => window.__ended)), '選項關閉 → 照打（預設）');
  await p.close();
  ({ p, errs } = await open(b, { rare: false, on: true, stageId: 'payon' }));
  ok(!(await p.evaluate(() => window.__ended)), '不是燈籠節 → 不管');
  await p.close();
  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
