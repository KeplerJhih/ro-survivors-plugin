// v0.9.0 統一清單：技能／神祇／其他寶箱卡／組隊擲骰同一種表格（🎯 優先＋順序、★ 專注、✕ 放逐、▲▼、🗑、＋ 新增），舊設定照用
const { chromium } = require('playwright');
async function open(b, prof, tab = 'skill') {
  const p = await b.newPage({ viewport: { width: 900, height: 1000 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><meta charset="utf-8"></head><body></body></html>' }));
  await p.addInitScript(([prof, tab]) => {
    if (!localStorage.getItem('roBot.cfg')) localStorage.setItem('roBot.cfg', JSON.stringify({ fight: false, pick: false, loop: false, v: 3, tab, activeProfile: 'A', profiles: { A: prof } }));
    window.__roHook = { run: null, lobby: null, runs: 0, runSeq: 0, drops: 0, stuck: 0 };
  }, [prof, tab]);
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  await p.waitForTimeout(500);
  return { p, errs };
}
const reload = async (p) => { await p.reload(); await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') }); await p.waitForTimeout(500); };
const rows = (p, k) => p.evaluate((k) => [...document.querySelectorAll(`.il[data-il=${k}] .ir`)].map((r) => (r.classList.contains('w') ? (r.querySelector('.no').textContent || '🎯') + '.' : '') + r.querySelector('.nm').textContent
  + (r.querySelector('[data-s=focus].on') ? '★' : '') + (r.classList.contains('b') ? '✕' : '')).join(' | '), k);
const click = (p, k, n, sel) => p.evaluate(([k, n, sel]) => [...document.querySelectorAll(`.il[data-il=${k}] .ir`)].find((r) => r.querySelector('.nm').textContent === n).querySelector(sel).click(), [k, n, sel]);
const add = (p, k, n) => p.evaluate(([k, n]) => { const i = document.querySelector(`.il[data-il=${k}] .il-add input`); i.value = n; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }, [k, n]);
const prof = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('roBot.cfg')).profiles.A);
(async () => {
  const b = await chromium.launch();
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };

  // 1) 技能：舊設定直接顯示；新增、專注、放逐、排序、移除
  let { p, errs } = await open(b, { priority: ['神聖之光', '治癒術'], skillFocus: ['神聖之光'], skillBanish: ['緩速術'] });
  ok(await rows(p, 'skill') === '1.神聖之光★ | 2.治癒術 | 緩速術✕', '舊設定照樣顯示：' + await rows(p, 'skill'));
  await add(p, 'skill', 'Ruwach'); await p.waitForTimeout(150);
  ok(await rows(p, 'skill') === '1.神聖之光★ | 2.治癒術 | 3.Ruwach | 緩速術✕', 'Enter 新增 → 接在優先最後');
  await click(p, 'skill', 'Ruwach', '[data-mv="-1"]'); await p.waitForTimeout(150);
  ok(await rows(p, 'skill') === '1.神聖之光★ | 2.Ruwach | 3.治癒術 | 緩速術✕', '▲ 往前');
  await click(p, 'skill', '治癒術', '[data-s=ban]'); await p.waitForTimeout(150);
  ok(await rows(p, 'skill') === '1.神聖之光★ | 2.Ruwach | 緩速術✕ | 治癒術✕', '✕ 放逐：離開優先');
  await click(p, 'skill', '緩速術', '[data-s=want]'); await p.waitForTimeout(150);
  ok(await rows(p, 'skill') === '1.神聖之光★ | 2.Ruwach | 3.緩速術 | 治癒術✕', '🎯 解除放逐並排到最後');
  await click(p, 'skill', '治癒術', '[data-del]'); await p.waitForTimeout(150);
  let f = await prof(p);
  ok(JSON.stringify([f.priority, f.skillFocus, f.skillBanish]) === JSON.stringify([['神聖之光', 'Ruwach', '緩速術'], ['神聖之光'], []]), '存回原本的設定欄位 ' + JSON.stringify([f.priority, f.skillFocus, f.skillBanish]));
  ok(await p.evaluate(() => !document.querySelector('textarea[data-list]')), '面板沒有打字框了');
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  // 2) 神祇：舊的「其他想要的」轉成 🎯；改成不要後重新載入不會又變回想要；自訂的才能移除
  ({ p, errs } = await open(b, { deity: { '堡壘之神': 'want', '記憶之神': 'ban' }, deityExtra: ['神聖之光'] }, 'chest'));
  let r = await rows(p, 'deity');
  ok(r.startsWith('1.堡壘之神 | 2.神聖之光 | ') && r.includes('記憶之神✕'), '神祇：🎯 在最上面照順序、✕ 標示 ' + r.slice(0, 60));
  ok(await p.evaluate(() => [...document.querySelectorAll('.il[data-il=deity] .ir')].filter((x) => x.querySelector('[data-del]')).map((x) => x.querySelector('.nm').textContent).join()) === '神聖之光', '只有自訂的神祇能移除');
  ok(await p.evaluate(() => !document.querySelector('.il[data-il=deity] [data-s=focus]')), '神祇沒有 ★（🎯 會自動專注）');
  await click(p, 'deity', '神聖之光', '[data-s=want]'); await p.waitForTimeout(150);
  await reload(p);
  ok(!(await rows(p, 'deity')).includes('2.神聖之光'), '取消 🎯 後重新載入不會又被轉回想要');
  await add(p, 'deity', '治癒術 Deity'); await p.waitForTimeout(150);
  ok((await rows(p, 'deity')).startsWith('1.堡壘之神 | 2.治癒術 Deity'), '新增自訂神祇＝🎯');
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  // 3) 組隊擲骰：在寶箱頁、沒有 ★ 和 ▲▼；紀錄頁只剩查看
  ({ p, errs } = await open(b, { roll: { mode: 'rule', needList: ['Tidal Shoes'], passList: ['皮帽'] } }, 'chest'));
  ok(await rows(p, 'roll') === '🎯.Tidal Shoes | 皮帽✕', '擲骰清單（沒有順序就不編號）：' + await rows(p, 'roll'));
  ok(await p.evaluate(() => !document.querySelector('.il[data-il=roll] [data-s=focus]') && !document.querySelector('.il[data-il=roll] [data-mv]')), '擲骰沒有 ★、▲▼');
  ok(await p.evaluate(() => !document.querySelector('.pg[data-pg=log] [data-k^="roll."]') && !!document.querySelector('.pg[data-pg=chest] [data-k="roll.mode"]')), '擲骰設定搬到寶箱頁');
  // 4) 獵神放棄條件在寶箱頁神祇區塊；區塊標題有範圍標籤
  ok(await p.evaluate(() => { const d = [...document.querySelectorAll('.pg[data-pg=chest] details')].find((x) => x.querySelector('summary').textContent.includes('神祇')); return !!d.querySelector('[data-k=huntLeaveChests]') && !document.querySelector('.pg[data-pg=main] [data-k=huntLeaveChests]'); }), '獵神放棄條件在神祇區塊');
  ok(await p.evaluate(() => [...document.querySelectorAll('#robot-panel details.dt > summary')].every((s) => s.querySelector('.scope') || /原地掛機|遊走/.test(s.textContent))), '設定區塊標題都有「共用／設定檔」標籤');
  ok(!errs.length, 'no page errors ' + errs.join(';'));
  for (const t of ['skill', 'chest']) {
    await p.evaluate((t) => document.querySelector(`nav button[data-tab=${t}]`).click(), t); await p.waitForTimeout(300);
    await p.screenshot({ path: require('path').join(__dirname, 'out', `unified-${t}.png`), clip: await p.evaluate(() => { const r = document.getElementById('robot-panel').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 900) }; }) });
  }
  await p.close();
  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
