// v0.9.7 技能「升級項目順序」：優先清單裡的技能先比強化項目（目標 > 冷卻 > 傷害），同項目再照技能順序；優先技能的新卡最前
const { chromium } = require('playwright');
// 結構照 2026-11-17 實際畫面：升級卡 badge=品質、sub=「Lv 13」、lines=「+1 目標」；新技能 ribbon=新！、sub=類型、lines=說明
const up = (i, name, lv, line) => `<div class="pk-slot"><div class="pk-pop"><button class="pk-card" data-i="${i}"><span class="pk-badge">普通</span><b class="pk-name">${name}</b><small class="pk-sub">Lv ${lv}</small><ul class="pk-lines"><li>${line}</li></ul></button><div class="pk-acts"></div></div></div>`;
const nw = (i, name, sub, line) => `<div class="pk-slot"><div class="pk-pop"><button class="pk-card" data-i="${i}"><span class="pk-badge">技能</span><span class="pk-ribbon">新！</span><b class="pk-name">${name}</b><small class="pk-sub">${sub}</small><ul class="pk-lines"><li>${line}</li></ul></button><div class="pk-acts"></div></div></div>`;
async function open(b, prof, cards) {
  const p = await b.newPage({ viewport: { width: 900, height: 1000 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('https://ro-survivors.com/', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html><head><meta charset="utf-8"></head><body>${cards ? `<div id="pk-cards">${cards}</div>` : ''}</body></html>` }));
  await p.addInitScript(([prof, picking]) => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: false, pick: picking, loop: false, v: 3, tab: 'skill', activeProfile: 'A', profiles: { A: prof } }));
    window.__roHook = { run: picking ? { state: 'levelup', openingChest: null, time: 30, player: { x: 0, y: 0 }, perksLeft: {}, touchMove: { x: 0, y: 0 }, classDef: { id: 'mage' }, runItems: { slots: new Map() } } : null, lobby: null, runs: 1, runSeq: 1, drops: 0, stuck: 0 };
    window.__clicks = []; document.addEventListener('click', (e) => { const c = e.target.closest('.pk-card'); if (c) window.__clicks.push(c.querySelector('.pk-name').textContent); }, true);
  }, [prof, !!cards]);
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  await p.waitForTimeout(1500);
  return { p, errs };
}
(async () => {
  const b = await chromium.launch();
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  const MAGE = { priority: ['冰箭術', '火箭術', '雷擊術'], skillUpg: ['目標', '冷卻', '傷害'], skillBanish: ['火焰之壁'] };
  const pick = async (prof, cards) => { const { p, errs } = await open(b, prof, cards); const c = await p.evaluate(() => window.__clicks[0]); const e = errs.slice(); await p.close(); return [c, e]; };

  let [c, e] = await pick(MAGE, up(0, '冰箭術', 5, '+20% 傷害') + up(1, '雷擊術', 3, '+1 目標') + up(2, '火箭術', 4, '+9 冷卻縮減'));
  ok(c === '雷擊術', '目標 > 冷卻 > 傷害：雷擊術 +目標 勝過排第一的冰箭術 +傷害 ' + c); ok(!e.length, 'no page errors ' + e.join(';'));
  [c] = await pick(MAGE, up(0, '冰箭術', 5, '+20% 傷害') + up(1, '火箭術', 4, '+9 冷卻縮減') + up(2, '雷擊術', 3, '+15% 傷害'));
  ok(c === '火箭術', '沒有目標 → 冷卻 ' + c);
  [c] = await pick(MAGE, up(0, '雷擊術', 3, '+1 目標') + up(1, '冰箭術', 5, '+1 目標') + up(2, '火箭術', 4, '+9 冷卻縮減'));
  ok(c === '冰箭術', '同項目照技能順序 ' + c);
  [c] = await pick(MAGE, up(0, '冰箭術', 5, '+1 目標') + nw(1, '雷擊術', '目標', '落雷') + up(2, '火箭術', 4, '+9 冷卻縮減'));
  ok(c === '雷擊術', '優先技能的新卡最前（先學到） ' + c);
  [c] = await pick(MAGE, up(0, '聖靈召喚', 2, '+1 目標') + up(1, '冰箭術', 5, '+20% 傷害') + up(2, '火焰之壁', 2, '+1 目標'));
  ok(c === '冰箭術', '不在優先清單的 +目標 不算；放逐的不選 ' + c);
  [c] = await pick(MAGE, up(0, '冰箭術', 5, '+12% 投射物速度') + up(1, '火箭術', 4, '+20% 傷害'));
  ok(c === '火箭術', '沒列到的項目排在列到的後面 ' + c);
  [c] = await pick({ ...MAGE, skillUpg: [] }, up(0, '雷擊術', 3, '+1 目標') + up(1, '冰箭術', 5, '+20% 傷害'));
  ok(c === '冰箭術', '升級項目空白＝照技能順序（照舊） ' + c);

  // 面板：技能區塊有「升級項目順序」清單，可新增／排序，沒有專注、放逐鈕
  const { p, errs } = await open(b, { priority: ['冰箭術'] }, null);
  const add = async (n) => p.evaluate((n) => { const box = document.querySelector('.il[data-il=upg]'); box.querySelector('input').value = n; box.querySelector('.il-add button').click(); }, n);
  for (const n of ['傷害', '目標', '冷卻']) { await add(n); await p.waitForTimeout(200); }
  await p.evaluate(() => [...document.querySelectorAll('.il[data-il=upg] .ir')].find((r) => r.querySelector('.nm').textContent === '傷害').querySelector('[data-mv="1"]').click()); await p.waitForTimeout(200);
  await p.evaluate(() => [...document.querySelectorAll('.il[data-il=upg] .ir')].find((r) => r.querySelector('.nm').textContent === '傷害').querySelector('[data-mv="1"]').click()); await p.waitForTimeout(300);
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.cfg')).profiles.A.skillUpg);
  ok(JSON.stringify(saved) === '["目標","冷卻","傷害"]', '新增＋▼ 排序存進設定檔 ' + JSON.stringify(saved));
  ok(await p.evaluate(() => !document.querySelector('.il[data-il=upg] [data-s=ban]') && !document.querySelector('.il[data-il=upg] [data-s=focus]') && !!document.querySelector('.il[data-il=skill] [data-s=ban]')), '升級項目清單沒有專注／放逐；技能清單照舊有');
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'skill-upg.png'), clip: await p.evaluate(() => { const r = document.querySelector('.il[data-il=upg]').closest('.sec, details, section, div').getBoundingClientRect(); return { x: Math.max(0, r.x - 10), y: Math.max(0, r.y - 260), width: Math.min(520, r.width + 20), height: r.height + 280 }; }) }).catch(() => {});
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();
  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
