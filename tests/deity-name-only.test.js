// v0.9.5 寶箱神祇比對只看神祇卡名稱：🎯神聖之光 不會命中說明寫著「神聖之光」的普通寶箱卡
const { chromium } = require('playwright');
const card = (i, badge, name, sub, line, swap) => `<div class="pk-slot"><div class="pk-pop"><button class="pk-card" data-i="${i}"><span class="pk-key">${i + 1}</span><span class="pk-badge">${badge}</span><b class="pk-name">${name}</b><small class="pk-sub">${sub}</small><ul class="pk-lines"><li>${line}</li></ul>${swap ? `<span class="pk-swap"><span class="pk-swap-ico">⇄</span><span>取代 ${swap}</span></span>` : ''}</button>${swap ? `<div class="pk-back"><div class="pk-back-btns"><button class="ro-btn primary" data-yes>是，交換</button><button data-no>否</button></div></div>` : ''}<div class="pk-acts"></div></div></div>`;
async function open(b, order, cards, extra = {}) {
  const p = await b.newPage({ viewport: { width: 900, height: 1000 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html><head><meta charset="utf-8"></head><body>${cards ? `<div id="pk-cards">${cards}</div>` : ''}</body></html>` }));
  await p.addInitScript(([order, picking, extra]) => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: false, pick: picking, loop: false, v: 3, tab: 'chest', activeProfile: 'A',
      profiles: { A: { deityOn: true, deity: { '堡壘之神': 'want', '記憶之神': 'ban' }, deityExtra: ['神聖之光'], ...(order ? { deityOrder: order } : {}), ...extra } } }));
    window.__roHook = { run: picking ? { state: 'levelup', openingChest: {}, player: { x: 0, y: 0 }, perksLeft: {}, touchMove: { x: 0, y: 0 }, classDef: { id: 'acolyte' } } : null, lobby: null, runs: 1, runSeq: 1, drops: 0, stuck: 0 };
    window.__clicks = []; document.addEventListener('click', (e) => { const c = e.target.closest('.pk-card'); if (c) window.__clicks.push(c.querySelector('.pk-name').textContent); }, true);
  }, [order, !!cards, extra]);
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  await p.waitForTimeout(1500);
  return { p, errs };
}
(async () => {
  const b = await chromium.launch();
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  // v0.9.0 統一清單：🎯 列就是優先順序
  const list = (p) => p.evaluate(() => [...document.querySelectorAll('.il[data-il=deity] .ir.w .nm')].map((s) => s.textContent));
  // 1) 普通寶箱卡說明含「神聖之光」、另有真的神祇卡 → 選神祇卡
  let cards = card(0, '史詩', '聖徒披肩', '裝備', '神聖之光 傷害 +20%') + card(1, '普通', '神聖之光 Deity', '神祇', '+10% 神聖之光') + card(2, '普通', 'DEX 料理', '料理', '+4 DEX');
  let { p, errs } = await open(b, ['神聖之光'], cards, { deity: { '神聖之光': 'want' }, deityExtra: ['神聖之光'] });
  let c = await p.evaluate(() => window.__clicks);
  ok(c[0] === '神聖之光 Deity', '選真的神祇卡，不是說明含神聖之光的裝備 ' + JSON.stringify(c));
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();
  // 2) 只有普通卡說明含「神聖之光」→ 不算目標出現：不標成已拿到（選高品質的那張是一般評分）
  cards = card(0, '普通', '聖徒披肩', '裝備', '神聖之光 傷害 +20%') + card(1, '史詩', '力量手套', '裝備', '+5 STR') + card(2, '普通', 'DEX 料理', '料理', '+4 DEX');
  ({ p, errs } = await open(b, ['神聖之光'], cards, { deity: { '神聖之光': 'want' }, deityExtra: ['神聖之光'] }));
  c = await p.evaluate(() => window.__clicks);
  ok(c[0] === '力量手套', '說明含神聖之光的裝備不再是最高優先 ' + JSON.stringify(c));
  ok(!(await p.evaluate(() => window.__roBot?.chestUsed?.huntDone || window.__roBot?.state?.chestUsed?.huntDone)), '沒有被標成已拿到目標');
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();
  // 3) 放逐的神祇名稱也只看神祇卡：普通卡說明含被放逐的名稱照樣可選
  cards = card(0, '史詩', '記憶護符', '裝備', '記憶之神 祝福 +5%') + card(1, '普通', 'DEX 料理', '料理', '+4 DEX') + card(2, '普通', '護甲藥水', '藥水', '+2 護甲');
  ({ p, errs } = await open(b, null, cards, { deityExtra: [] }));
  c = await p.evaluate(() => window.__clicks);
  ok(c[0] === '記憶護符', '普通卡說明含被放逐的神祇名不會被扣分 ' + JSON.stringify(c));
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();
  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
