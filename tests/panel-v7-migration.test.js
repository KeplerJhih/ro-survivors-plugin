const { chromium } = require('playwright');
const SP = __dirname + '/out/';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 700, height: 820 } }); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><meta charset="utf-8"></head><body style="background:#334"></body></html>' }));
  await p.addInitScript(() => {
    if (!localStorage.getItem('roBot.cfg')) localStorage.setItem('roBot.cfg', JSON.stringify({ fight: true, pick: true, loop: true, autoResume: true, v: 3, tab: 'main', activeProfile: '服事',
      profiles: { 服事: { mode: 'idle', priority: { acolyte: ['神聖之光', '治癒術'] }, skillBanish: { acolyte: ['緩速術'] }, deity: { '堡壘之神': 'want', '記憶之神': 'ban' }, huntPhase: { on: true, allPerks: true, onFail: 'farm' }, gate: { on: true, deity: true, skillOn: true, skillTop: 1, skillLv: 1 }, chestPerks: false, chestUse: { reroll_card: 5 }, skillPerks: true, skillUse: { banish: 1, focus: 1 }, deityUse: { reroll_card: 4 }, huntLeaveChests: 32, huntPoorSec: 60 } } }));
    const run = { state: 'playing', time: 10, zeny: 50, chestCost: () => 30, chestsOpened: 2, player: { x: 500, y: 500 }, enemies: [], pickups: [], touchMove: { x: 0, y: 0 }, weapons: [{ id: 'holy_light', rank: 2 }], classDef: { id: 'acolyte' }, runItems: { slots: new Map() }, runItemName: (s, i) => i, perksLeft: { reroll_card: 6, reroll: 3, banish: 4, focus: 2 }, stats: { maxHp: 100 }, hp: 100 };
    window.__roHook = { run, lobby: null, runs: 1, runSeq: 1, drops: 0, stuck: 0 };
  });
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname,'..','bot.js') });
  await p.waitForTimeout(400);
  const cfg = () => p.evaluate(() => { const s = JSON.parse(localStorage.getItem('roBot.cfg')); return s.profiles[s.activeProfile]; });
  let c = await cfg(); console.log('perks migrated', JSON.stringify(c.perks));
  await p.screenshot({ path: SP + 'v7_main.png', clip: { x: 0, y: 60, width: 260, height: 760 } });
  // open details
  await p.click('summary >> text=原地掛機細節'); await p.waitForTimeout(200);
  await p.screenshot({ path: SP + 'v7_main2.png', clip: { x: 0, y: 60, width: 260, height: 760 } });
  for (const t of ['skill', 'chest', 'deity', 'perk', 'stage']) { await p.click(`nav button[data-tab=${t}]`); await p.waitForTimeout(200); await p.screenshot({ path: SP + `v7_${t}.png`, clip: { x: 0, y: 60, width: 260, height: 600 } }); }
  // binding tests
  await p.click('nav button[data-tab=perk]'); await p.fill('input[data-k="perks.skill.reroll_card"]', '3'); await p.press('input[data-k="perks.skill.reroll_card"]', 'Tab');
  await p.click('nav button[data-tab=main]'); await p.selectOption('#rb-flow', 'roam'); await p.waitForTimeout(200);
  c = await cfg(); console.log('after edits', c.perks.skill, c.gate.on, c.mode);
  await p.selectOption('#rb-flow', 'gate'); await p.waitForTimeout(200);
  c = await cfg(); console.log('gate back', c.gate.on, c.gate.after);
  console.log(errs);
  await b.close();
})();
