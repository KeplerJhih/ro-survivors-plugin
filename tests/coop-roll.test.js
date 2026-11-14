const { chromium } = require('playwright');
(async () => {
  for (const [mode, extra] of [['pass', {}], ['rule', { needQ: '稀有' }], ['rule', { needQ: '傳說', passList: ['Tidal'] }]]) {
    const b = await chromium.launch(); const p = await b.newPage(); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
    await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html><head><meta charset="utf-8"></head><body>
      <div id="drop-reveal" class="roll"><div class="dr-inner"><b class="dr-name">Tidal Shoes</b><span class="dr-q">稀有 · TIER 1</span><div class="dr-roll"><div class="dr-roll-btns"><button data-c="need">Need</button><button data-c="greed">Greed</button><button data-c="pass">放棄</button></div></div></div></div>
      <div id="loot-rolls"><div class="lr-row"><div class="lr-item"><b>Poring 卡片</b><small>卡片</small></div><div class="lr-btns"><button data-c="need">Need</button><button data-c="greed">Greed</button><button data-c="pass">放棄</button></div></div></div></body></html>` }));
    await p.addInitScript(([mode, extra]) => {
      localStorage.setItem('roBot.cfg', JSON.stringify({ pick: true, profiles: { A: { roll: { mode, ...extra } } }, activeProfile: 'A', v: 3 }));
      const run = { state: 'reveal', coop: {}, player: { x: 0, y: 0 }, enemies: [], pickups: [], touchMove: { x: 0, y: 0 }, runLoot: [], runCards: [], runEggs: [], perksLeft: {} };
      window.__roHook = { run, lobby: null, runs: 1, runSeq: 1, drops: 0, stuck: 0 };
      window.__clicks = []; document.addEventListener('click', e => { if (e.target.dataset.c) window.__clicks.push(e.target.closest('#drop-reveal') ? 'reveal:' + e.target.dataset.c : 'row:' + e.target.dataset.c); }, true);
    }, [mode, extra]);
    await p.goto('https://ro-survivors.com/');
    await p.addScriptTag({ path: require('path').join(__dirname,'..','bot.js') });
    await p.waitForTimeout(2500);
    console.log(mode, JSON.stringify(extra), await p.evaluate(() => window.__clicks), errs);
    await b.close();
  }
})();
