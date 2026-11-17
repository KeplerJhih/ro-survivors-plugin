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
  [c] = await pick({ ...MAGE, skillUpg: ['範圍', '攻擊範圍'] }, up(0, '冰箭術', 5, '+10% 攻擊範圍') + up(1, '火箭術', 4, '+10% 範圍'));
  ok(c === '火箭術', '兩個條目都命中時取最長的：攻擊範圍算第 2、範圍算第 1 ' + c);
  [c] = await pick({ ...MAGE, skillUpg: ['脈衝', '傷害'] }, up(0, '冰箭術', 5, '+20% 傷害') + up(1, '雷擊術', 3, '+3 脈衝'));
  ok(c === '雷擊術', '自由輸入「脈衝」模糊命中「+3 脈衝」 ' + c);
  [c] = await pick({ ...MAGE, skillUpg: ['冷卻'] }, up(0, '冰箭術', 5, '+20% 傷害') + up(1, '火箭術', 4, '+9 冷卻縮減'));
  ok(c === '火箭術', '「冷卻」命中「冷卻縮減」 ' + c);

  // v0.9.11 面板：自由輸入（模糊比對）、拖曳／▲▼ 排序、🗑 刪除；輸入建議含常見項目
  const { p, errs } = await open(b, { priority: ['冰箭術'] }, null);
  const rows = () => p.evaluate(() => [...document.querySelectorAll('#rb-upg [data-upg]')].map((r) => r.dataset.upg));
  const add = async (n, enter) => { await p.fill('#rb-upg-add input', n); if (enter) await p.press('#rb-upg-add input', 'Enter'); else await p.click('#rb-upg-add button'); await p.waitForTimeout(150); };
  ok(await p.evaluate(() => [...document.querySelectorAll('#rb-upg-dl option')].some((o) => o.value === '目標')), '輸入建議有常見項目');
  await add('傷害'); await add('目標', true); await add('脈衝');
  const saved = () => p.evaluate(() => JSON.parse(localStorage.getItem('roBot.cfg')).profiles.A.skillUpg);
  ok(JSON.stringify(await saved()) === '["傷害","目標","脈衝"]', '新增（按鈕／Enter）依序存 ' + JSON.stringify(await saved()));
  await p.locator('#rb-upg [data-upg="脈衝"]').dragTo(p.locator('#rb-upg [data-upg="傷害"]')); await p.waitForTimeout(300);
  ok(JSON.stringify(await saved()) === '["脈衝","傷害","目標"]', '拖曳：脈衝拖到最上面 ' + JSON.stringify(await saved()));
  await p.evaluate(() => document.querySelector('#rb-upg [data-upg="目標"] [data-umv="-1"]').click()); await p.waitForTimeout(200);
  ok(JSON.stringify(await saved()) === '["脈衝","目標","傷害"]', '▲ 也能排 ' + JSON.stringify(await saved()));
  await p.evaluate(() => document.querySelector('#rb-upg [data-upg="傷害"] [data-udel]').click()); await p.waitForTimeout(200);
  ok(JSON.stringify(await rows()) === '["脈衝","目標"]', '🗑 刪除');
  await p.screenshot({ path: process.env.UPG_SHOT || require('path').join(require('os').tmpdir(), 'skill-upg.png'), clip: await p.evaluate(() => { const r = document.querySelector('#rb-upg').getBoundingClientRect(); return { x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 60), width: r.width + 24, height: r.height + 72 }; }) }).catch(() => {});
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();
  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
