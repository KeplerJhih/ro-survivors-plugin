const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const logs=[]; p.on('console', m => logs.push(m.text())); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><meta charset="utf-8"></head><body></body></html>' }));
  await p.addInitScript(() => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: true, pick: true, mode: 'idle', sweep: { on: false } }));
    const pk = []; pk.push({ kind: 'chest', x: 2800, y: 1000 });
    const run = { state: 'playing', player: { x: 1000, y: 1000 }, enemies: [], pickups: pk, touchMove: { x: 0, y: 0 }, bounds: { x0: 0, x1: 4000, y0: 0, y1: 4000 }, zeny: 100, chestCost: () => 10, stats: { maxHp: 100 }, hp: 100 };
    window.__roHook = { run, lobby: null, runs: 1, runSeq: 1, drops: 0, stuck: 0 };
    window.__trace = [];
    setInterval(() => { const P = run.player; P.x += run.touchMove.x * 8; P.y += run.touchMove.y * 8;
      for (const o of pk) if (!o.dead && Math.hypot(o.x - P.x, o.y - P.y) < 60) o.dead = true; }, 50);
    setInterval(() => window.__trace.push([Math.round(run.player.x), Math.round(run.player.y), pk.filter(o => !o.dead).length]), 1000);
  });
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname,'..','bot.js') });
  await p.waitForTimeout(12000);
  console.log(JSON.stringify(await p.evaluate(() => window.__trace)), errs, logs.filter(l => /掃|原點/.test(l)).map(l=>l.replace('%c[roBot] color:#5b8def ','')));
  await b.close();
})();
