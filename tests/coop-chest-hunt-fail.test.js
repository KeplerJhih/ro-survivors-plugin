const { chromium } = require('playwright');
const card = (i, badge, name, sub, line) => `<div class="pk-slot"><div class="pk-pop"><button class="pk-card" data-i="${i}"><span class="pk-badge">${badge}</span><b class="pk-name">${name}</b><small class="pk-sub">${sub}</small><ul class="pk-lines"><li>${line}</li></ul></button><div class="pk-acts"><button class="pk-act" data-act="${i}:0">重抽<small>6</small></button></div></div></div>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); const logs=[]; p.on('console', m => logs.push(m.text())); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html><head><meta charset="utf-8"></head><body><div id="picker"><h2 id="pk-title">寶箱</h2><div id="pk-cards">${card(0,'普通','神聖之光 Deity','神祇 · Nv 1','+5 MATK')}${card(1,'史詩','DEX 料理','料理 · Nv 1','+4 DEX')}</div></div></body></html>` }));
  await p.addInitScript(() => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ pick: true, profiles: { A: { priority: { acolyte: ['神聖之光'] }, deity: { '堡壘之神': 'want' }, huntPhase: { on: true }, huntPoorSec: 3 } }, activeProfile: 'A', v: 3 }));
    const run = { state: 'levelup', coop: { replica: true }, openingChest: null, time: 100, zeny: 10, chestCost: () => 500, chestsOpened: 3, player: { x: 0, y: 0 }, enemies: [], pickups: [], touchMove: { x: 0, y: 0 }, runItems: { slots: new Map() }, runItemName: (s, i) => i, perksLeft: { reroll_card: 6, reroll: 3, banish: 4, focus: 2 }, classDef: { id: 'acolyte' } };
    window.__roHook = { run, lobby: null, runs: 1, runSeq: 1, drops: 0, stuck: 0 };
    setTimeout(() => { run.state = 'playing'; document.getElementById('picker').remove(); setInterval(() => run.time += 1, 250); }, 2500);
  });
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname,'..','bot.js') });
  await p.waitForTimeout(5000);
  console.log(logs.map(l => l.replace('%c[roBot] color:#5b8def ', '')).filter(l => /chest|deity|skill|獵神|切換/.test(l)).slice(0, 8), await p.evaluate(() => ({ phase: window.__roBot.phase, failed: window.__roHook.rs.huntFailed })), errs);
  await b.close();
})();
