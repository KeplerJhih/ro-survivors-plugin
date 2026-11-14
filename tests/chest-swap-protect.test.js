const { chromium } = require('playwright');
const card = (i, badge, name, sub, line, swap) => `<div class="pk-slot"><div class="pk-pop"><button class="pk-card" data-i="${i}"><span class="pk-key">${i+1}</span><span class="pk-badge">${badge}</span><b class="pk-name">${name}</b><small class="pk-sub">${sub}</small><ul class="pk-lines"><li>${line}</li></ul>${swap?`<span class="pk-swap"><span class="pk-swap-ico">⇄</span><span>取代 ${swap}</span></span>`:''}</button>${swap?`<div class="pk-back"><div class="pk-back-btns"><button class="ro-btn primary" data-yes>是，交換</button><button data-no>否</button></div></div>`:''}<div class="pk-acts"><button class="pk-act" data-act="${i}:0">重抽<small>6</small></button></div></div></div>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const logs=[]; p.on('console', m => logs.push(m.text())); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html><head><meta charset="utf-8"></head><body><div id="pk-cards">${card(0,'傳說','記憶之神 +1','神祇','+8 DEX','堡壘之神')}${card(1,'史詩','DEX 料理','料理','+4 DEX')}${card(2,'優良','護甲藥水','藥水','+2 護甲')}</div></body></html>` }));
  await p.addInitScript(() => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: false, pick: true, chestPriority: ['堡壘之神'], chestFocus: [], v: 2 }));
    window.__roHook = { run: { state: 'levelup', openingChest: {}, player: { x: 0, y: 0 }, perksLeft: { reroll_card: 6, reroll: 3, banish: 4, focus: 2 }, touchMove: { x: 0, y: 0 }, classDef: { id: 'acolyte' } }, lobby: null, runs: 1, runSeq: 1, drops: 0, stuck: 0 };
    window.__clicks = []; document.addEventListener('click', e => window.__clicks.push(e.target.closest('button')?.textContent.replace(/\s+/g,' ').trim()), true);
  });
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname,'..','bot.js') });
  await p.waitForTimeout(1500);
  console.log(await p.evaluate(() => window.__clicks.slice(0,3)), errs, logs.filter(l=>/pick/.test(l)).slice(0,1));
  await b.close();
})();
