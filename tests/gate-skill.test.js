const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 760 } }); const errs=[]; p.on('pageerror', e=>errs.push(e.message)); const logs=[]; p.on('console', m=>logs.push(m.text()));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><meta charset="utf-8"></head><body style="background:#334"></body></html>' }));
  await p.addInitScript(() => {
    // old-style profile with huntPhase.on → should migrate to gate
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: true, pick: true, profiles: { A: { mode: 'idle', priority: { acolyte: ['神聖之光', '治癒術'] }, gate: { on: true, deity: false, skillOn: true, skillTop: 1, skillLv: 3 } } }, activeProfile: 'A', v: 3, tab: 'main' }));
    const run = { state: 'playing', time: 10, zeny: 0, chestCost: () => 30, chestsOpened: 0, player: { x: 500, y: 500 }, enemies: [], pickups: [], touchMove: { x: 0, y: 0 }, bounds: { x0: 0, x1: 3000, y0: 0, y1: 3000 },
      weapons: [{ id: 'holy_light', rank: 2 }], classDef: { id: 'acolyte' }, slots: ['holy_light'], skillLevel(id) { return this.weapons.find(w => w.id === id)?.rank || 0; }, runItems: { slots: new Map() }, runItemName: (s, i) => i, perksLeft: {}, stats: { maxHp: 100 }, hp: 100 };
    window.__roHook = { run, lobby: null, runs: 1, runSeq: 1, drops: 0, stuck: 0 };
  });
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname,'..','bot.js') });
  await p.waitForTimeout(500);
  const st = () => p.evaluate(() => ({ phase: window.__roBot.phase, gate: JSON.parse(localStorage.getItem('roBot.cfg')).profiles.A.gate, status: document.getElementById('rb-st').textContent.split('\n').slice(-3).join(' | ') }));
  console.log('migrated', await st());
  // add skill condition via UI
  console.log('skill lv2', await st());
  // show a level-up with a 神聖之光 (Holy Light) card so the bot learns the id, pick it, then rank goes to 3
  await p.evaluate(() => { const r = window.__roHook.run; r.state = 'levelup'; document.body.insertAdjacentHTML('beforeend', '<div id="picker"><h2 id="pk-title">升級！</h2><div id="pk-cards"><div class="pk-slot"><div class="pk-pop"><button class="pk-card"><b class="pk-name">神聖之光 (Holy Light)</b></button></div></div></div></div>');
    document.querySelector('.pk-card').onclick = () => { r.weapons[0].rank = 3; document.getElementById('picker').remove(); r.state = 'playing'; }; });
  await p.waitForTimeout(2500);
  console.log('skill lv3', await st(), errs, logs.filter(l=>/切換/.test(l)));
  await p.screenshot({ path: ''+__dirname+'/out/gate2.png', clip: { x: 0, y: 60, width: 300, height: 520 } });
  await b.close();
})();
