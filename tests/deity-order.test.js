// v0.8.8：神祇優先順序——寶箱分頁列出想要的神祇（🎯＋其他想要的），▲▼ 排序；選卡照順序；拿到後面的，出現前面的會換上去
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
  const list = (p) => p.evaluate(() => [...document.querySelectorAll('#rb-dorder .dor span')].map((s) => s.textContent));

  // 1) 面板：列出想要的（不含 ✕），預設照原本順序；▼ 調整後存進設定檔
  let { p, errs } = await open(b, null, null);
  ok(JSON.stringify(await list(p)) === '["堡壘之神","神聖之光"]', '列出 🎯 與其他想要的（不含 ✕）' + JSON.stringify(await list(p)));
  ok(await p.evaluate(() => document.querySelector('#rb-dorder [data-mv="0:-1"]').disabled && document.querySelector('#rb-dorder [data-mv="1:1"]').disabled), '第一個不能再上、最後一個不能再下');
  await p.evaluate(() => document.querySelector('#rb-dorder [data-mv="0:1"]').click()); await p.waitForTimeout(300);
  ok(JSON.stringify(await list(p)) === '["神聖之光","堡壘之神"]', '按 ▼ 後順序對調');
  ok(JSON.stringify(await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.cfg')).profiles.A.deityOrder)) === '["神聖之光","堡壘之神"]', '順序存在設定檔');
  // 新增一個 🎯 → 接在最後
  await p.evaluate(() => document.querySelector('.seg[data-d="生命之神"] button[data-v=want]').click()); await p.waitForTimeout(700);
  ok(JSON.stringify(await list(p)) === '["神聖之光","堡壘之神","生命之神"]', '新加的 🎯 接在最後 ' + JSON.stringify(await list(p)));
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  // 2) 選卡：兩個想要的同時出現，照順序選
  const two = card(0, '稀有', '堡壘之神', '神祇', '+30 HP') + card(1, '稀有', '神聖之光 Deity', '神祇', '+10% 神聖之光') + card(2, '普通', 'DEX 料理', '料理', '+4 DEX');
  ({ p, errs } = await open(b, ['神聖之光', '堡壘之神'], two));
  ok((await p.evaluate(() => window.__clicks))[0] === '神聖之光 Deity', '神聖之光排第一 → 選神聖之光 ' + JSON.stringify(await p.evaluate(() => window.__clicks)));
  await p.close();
  ({ p, errs } = await open(b, ['堡壘之神', '神聖之光'], two));
  ok((await p.evaluate(() => window.__clicks))[0] === '堡壘之神', '堡壘之神排第一 → 選堡壘之神 ' + JSON.stringify(await p.evaluate(() => window.__clicks)));
  await p.close();

  // 3) 已裝備後面的（堡壘之神，可能已精煉 +30），出現前面的（神聖之光）：
  //    v0.8.10 預設不換（換了精煉會歸零）；勾「已拿到後也換」才換；排在後面的永遠不拿來換前面的
  const up = card(0, '稀有', '神聖之光 Deity', '神祇', '+10% 神聖之光', '堡壘之神') + card(1, '普通', 'DEX 料理', '料理', '+4 DEX') + card(2, '普通', '護甲藥水', '藥水', '+2 護甲');
  ({ p, errs } = await open(b, ['神聖之光', '堡壘之神'], up));
  ok((await p.evaluate(() => window.__clicks))[0] !== '神聖之光 Deity', '預設：已拿到的不換（保住精煉） ' + JSON.stringify(await p.evaluate(() => window.__clicks)));
  ok(await p.evaluate(() => !!document.querySelector('input[data-k="deitySwapUp"]') && !document.querySelector('input[data-k="deitySwapUp"]').checked), '面板有開關，預設不勾');
  await p.close();
  ({ p, errs } = await open(b, ['神聖之光', '堡壘之神'], up, { deitySwapUp: true }));
  ok((await p.evaluate(() => window.__clicks))[0] === '神聖之光 Deity', '勾選後：出現更優先的 → 換上去');
  await p.close();
  ({ p, errs } = await open(b, ['堡壘之神', '神聖之光'], up, { deitySwapUp: true }));
  ok((await p.evaluate(() => window.__clicks))[0] !== '神聖之光 Deity', '勾選後：出現較後面的 → 不換 ' + JSON.stringify(await p.evaluate(() => window.__clicks)));
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
