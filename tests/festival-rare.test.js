// v0.9.9 指定最終王（finalBoss）：這場的最終王（MVP＋伺服器開場決定的隱藏王 run.rareId）有勾到就打，都沒勾到就開場幾秒後離開；
// 關卡王表第一次進場學起來（roBot.stageBosses），面板勾選；舊 festRareOnly 轉換
const { chromium } = require('playwright');
const SCRIPT = { bosses: [{ t: 150, id: 'dancing_dragon' }, { t: 720, id: 'spring_rabbit' }, { t: 840, id: 'bacsojin' }], rare: { id: 'dark_snake_lord', t: 846, chance: 0.075 } };
async function open(b, { rare, prof, stageId = 'louyang', panelOnly = false }) {
  const p = await b.newPage({ viewport: { width: 900, height: 1000 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('https://ro-survivors.com/', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html><head><meta charset="utf-8"></head><body><button id="btn-endrun" onclick="window.__ended=(window.__ended||0)+1">結束這場</button></body></html>` }));
  await p.addInitScript(([rare, prof, stageId, SCRIPT, panelOnly]) => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: false, pick: true, loop: true, v: 3, tab: 'stage', activeProfile: 'A', profiles: { A: { stage: '燈籠節', ...prof } } }));
    const bosses = [...SCRIPT.bosses, ...(rare ? [{ t: 1e9, id: 'dark_snake_lord' }] : [])];
    const run = { state: 'playing', stageId, script: { ...SCRIPT, bosses }, rareId: rare ? 'dark_snake_lord' : null, time: 1, level: 1, kills: 0, zeny: 0, chestCost: () => 30, chestsOpened: 0, player: { x: 500, y: 500 }, pickups: [], touchMove: { x: 0, y: 0 }, bounds: { x0: 0, x1: 3000, y0: 0, y1: 3000 },
      enemies: [], weapons: [], classDef: { id: 'acolyte' }, runItems: { slots: new Map() }, runItemName: (s, i) => i, perksLeft: {}, stats: { maxHp: 100 }, hp: 100 };
    window.__roHook = { run: panelOnly ? null : run, lobby: null, runs: 1, runSeq: 1, drops: 0, stuck: 0 };
    setInterval(() => { run.time += 1; }, 200);
  }, [rare, prof, stageId, SCRIPT, panelOnly]);
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  await p.waitForTimeout(3500);
  return { p, errs };
}
(async () => {
  const b = await chromium.launch();
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  const ended = (p) => p.evaluate(() => window.__ended || 0);
  const ONLY_SNAKE = { finalBoss: { '燈籠節': ['dark_snake_lord'] } }, BOTH = { finalBoss: { '燈籠節': ['bacsojin', 'dark_snake_lord'] } };

  let { p, errs } = await open(b, { rare: false, prof: ONLY_SNAKE });
  ok(await ended(p) === 1, '只勾蛇王、沒有隱藏王 → 離開（一次） ' + await ended(p));
  ok(await p.evaluate(() => window.__roHook.run.time) >= 3, '不是一進場就秒退');
  ok(/無隱藏王/.test(await p.evaluate(() => document.querySelector('#rb-st').innerText)), '狀態列：無隱藏王');
  ok(JSON.stringify(await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.stageBosses'))['燈籠節'])) === '{"mvp":"bacsojin","rare":"dark_snake_lord","chance":0.075}', '王表學起來');
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  ({ p } = await open(b, { rare: true, prof: ONLY_SNAKE }));
  ok(await ended(p) === 0, '只勾蛇王、有隱藏王 → 打'); await p.close();
  ({ p } = await open(b, { rare: false, prof: BOTH }));
  ok(await ended(p) === 0, '勾白素貞＋蛇王 → 每場最終王都是其中一隻 → 打'); await p.close();
  ({ p } = await open(b, { rare: false, prof: { finalBoss: { '燈籠節': ['some_other'] } } }));
  ok(await ended(p) === 1, '勾的王都不是這場的 → 離開'); await p.close();
  ({ p } = await open(b, { rare: false, prof: {} }));
  ok(await ended(p) === 0, '都不勾（預設）→ 打'); await p.close();
  ({ p } = await open(b, { rare: false, prof: { festRareOnly: true } }));
  ok(await ended(p) === 1 && JSON.stringify(await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.cfg')).profiles.A.finalBoss)) === '{"燈籠節":["dark_snake_lord"]}', '舊「只打有隱藏王」轉成只勾蛇王'); await p.close();

  // 面板：有王表就列出 MVP／隱藏王勾選，勾了存進設定
  ({ p, errs } = await open(b, { rare: false, prof: {}, panelOnly: true }));
  ok(/先打過一場/.test(await p.evaluate(() => document.querySelector('#rb-fboss').innerText)), '沒有王表 → 提示先打一場');
  await p.evaluate(() => { localStorage.setItem('roBot.stageBosses', JSON.stringify({ '燈籠節': { mvp: 'bacsojin', rare: 'dark_snake_lord', chance: 0.075 } })); });
  await p.close();
  const p2 = await b.newPage({ viewport: { width: 900, height: 1000 } }); const e2 = []; p2.on('pageerror', (e) => e2.push(e.message));
  await p2.route('https://ro-survivors.com/', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><meta charset="utf-8"></head><body></body></html>' }));
  await p2.addInitScript(() => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: false, pick: true, loop: false, v: 3, tab: 'stage', activeProfile: 'A', profiles: { A: { stage: '燈籠節' } } }));
    localStorage.setItem('roBot.stageBosses', JSON.stringify({ '燈籠節': { mvp: 'bacsojin', rare: 'dark_snake_lord', chance: 0.075 } }));
    window.__roHook = { run: null, lobby: null, runs: 0, runSeq: 0, drops: 0, stuck: 0 };
  });
  await p2.goto('https://ro-survivors.com/');
  await p2.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  await p2.waitForTimeout(1500);
  const txt = await p2.evaluate(() => document.querySelector('#rb-fboss').innerText);
  ok(/白素貞/.test(txt) && /蛇王/.test(txt) && /7\.5%/.test(txt), '列出白素貞（MVP）、蛇王（隱藏王 7.5%） ' + txt.replace(/\s+/g, ' ').slice(0, 120));
  await p2.evaluate(() => { const c = document.querySelector('[data-fb=dark_snake_lord]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
  await p2.waitForTimeout(300);
  ok(JSON.stringify(await p2.evaluate(() => JSON.parse(localStorage.getItem('roBot.cfg')).profiles.A.finalBoss)) === '{"燈籠節":["dark_snake_lord"]}', '勾蛇王存進設定檔');
  ok(!e2.length, 'no page errors ' + e2.join(';'));
  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
