// v0.9.6 獵神＋「全部先給神祇」時，技能三張都在放逐名單 → 用技能的放逐次數換掉；有一張沒被禁就照舊不花次數
const { chromium } = require('playwright');
const card = (i, name) => `<div class="pk-slot"><div class="pk-pop"><button class="pk-card" data-i="${i}"><span class="pk-badge">技能</span><b class="pk-name">${name}</b><small class="pk-sub">技能</small><ul class="pk-lines"><li>x</li></ul></button><div class="pk-acts"><button class="pk-act" data-act="${i}:0">重抽<small>4</small></button><button class="pk-act" data-act="${i}:1">放逐<small>4</small></button></div></div></div>`;
async function open(b, names) {
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('https://ro-survivors.com/', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html><head><meta charset="utf-8"></head><body><div id="pk-cards">${names.map((n, i) => card(i, n)).join('')}</div></body></html>` }));
  await p.addInitScript(() => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: false, pick: true, loop: false, v: 3, activeProfile: 'A', profiles: { A: {
      priority: ['冰箭術'], skillBanish: ['冰凍術', '火狩', '火焰之壁', '心靈爆破'], deityOn: true, deity: { '堡壘之神': 'want' },
      gate: { on: true, deity: true }, perks: { deity: { reroll_card: 4, banish: 2 }, chest: {}, skill: { banish: 3, focus: 1 }, huntAll: true } } } }));
    window.__roHook = { run: { state: 'levelup', openingChest: null, time: 30, player: { x: 0, y: 0 }, perksLeft: { reroll_card: 0, reroll: 4, banish: 4, focus: 2 }, touchMove: { x: 0, y: 0 }, classDef: { id: 'mage' }, runItems: { slots: new Map() } }, lobby: null, runs: 1, runSeq: 1, drops: 0, stuck: 0 };
    window.__clicks = []; document.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) window.__clicks.push(b.classList.contains('pk-act') ? b.textContent.replace(/\d/g, '').trim() + '#' + b.dataset.act[0] : b.querySelector('.pk-name')?.textContent); }, true);
  });
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  await p.waitForTimeout(1500);
  return { p, errs };
}
(async () => {
  const b = await chromium.launch();
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  let { p, errs } = await open(b, ['冰凍術 新！', '心靈爆破 新！', '火狩 新！']);
  let c = await p.evaluate(() => window.__clicks);
  ok(c[0] === '放逐#0', '三張都被禁 → 放逐（不是硬選） ' + JSON.stringify(c));
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();
  ({ p, errs } = await open(b, ['冰凍術 新！', '聖靈召喚 新！', '火狩 新！']));
  c = await p.evaluate(() => window.__clicks);
  ok(c[0] === '聖靈召喚 新！', '有一張沒被禁 → 直接選它，次數留給神祇 ' + JSON.stringify(c));
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();
  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
