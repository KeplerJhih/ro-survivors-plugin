// v0.8.4：自動登入節流——維修中不登入、回合內每個按鈕只按一次、失敗後等待、密碼 24 小時上限、排隊不動、進到遊戲歸零
const { chromium } = require('playwright');
const PAGE = (o) => `<html><head><meta charset="utf-8"></head><body>
  ${o.maint ? '<div id="maint"><button class="sp-maint-retry">重新檢查</button></div>' : ''}
  ${o.login ? '<form id="sp-login"><input name="username"><input type="password" name="password"><button type="submit">進入</button><p class="sp-error"></p></form>' : ''}
  ${o.charsel ? '<div id="charselect"><div id="slots"><div class="slot selected"><div class="slot-name">阿服快打</div></div></div><button id="btn-play">開始遊戲</button></div>' : ''}
  ${o.queue ? '<div class="ro-window">伺服器已滿 目前有 20,000 名玩家。你正在排隊：一有空位就會自動進入。 第 4,630 位，共 10,442 位 <button>取消</button></div>' : ''}
  <div id="lobby-ui" style="display:none"></div>
</body></html>`;
async function open(b, o, guard) {
  const p = await b.newPage({ viewport: { width: 900, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE(o) }));
  await p.addInitScript((guard) => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: true, pick: true, loop: true, autoLogin: true, v: 3, tab: 'main', activeProfile: 'A', profiles: { A: { char: '阿服快打' } } }));
    if (guard) localStorage.setItem('roBot.loginGuard', JSON.stringify(guard));
    window.__roHook = { run: null, lobby: null, runs: 0, runSeq: 0, drops: 0, stuck: 0 };
    window.__ev = [];
    window.chrome = { runtime: { lastError: null, sendMessage: (id, msg, cb) => setTimeout(() => cb(msg.type === 'cred:get' ? { ok: true, ...(msg.full ? { cred: { u: 'k', p: 'pw' } } : { user: 'k' }) } : { ok: true }), 10) } };
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.dataset.robotExt = 'test';
      const $ = (q) => document.querySelector(q);
      if ($('.sp-maint-retry')) $('.sp-maint-retry').onclick = () => window.__ev.push('retry');
      if ($('#sp-login')) $('#sp-login').onsubmit = (e) => { e.preventDefault(); window.__ev.push('submit'); };
      if ($('#btn-play')) $('#btn-play').onclick = () => window.__ev.push('play'); // 伺服器沒反應：畫面不變
    });
  }, guard);
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  return { p, errs };
}
(async () => {
  const b = await chromium.launch();
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  const st = (p) => p.evaluate(() => document.getElementById('rb-st').textContent);
  const ev = (p) => p.evaluate(() => window.__ev);
  const g = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('roBot.loginGuard') || '{}'));
  const now = Date.now();

  // 1) 維修中＋登入表單：不送密碼，重新檢查只按一次
  let { p, errs } = await open(b, { maint: true, login: true });
  await p.waitForTimeout(8000);
  ok(JSON.stringify(await ev(p)) === '["retry"]', '維修中：不登入，重新檢查只按一次 ' + JSON.stringify(await ev(p)));
  ok(/維修中/.test(await st(p)), '狀態列顯示維修中');
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  // 2) 選角畫面按開始沒反應：一回合只按一次
  ({ p, errs } = await open(b, { charsel: true }));
  await p.waitForTimeout(10000);
  ok((await ev(p)).filter((x) => x === 'play').length === 1, '開始沒反應：回合內只按一次 ' + JSON.stringify(await ev(p)));
  ok((await g(p)).n === 1, '記一次回合');
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  // 3) 上一回合失敗、還沒到下次時間：不按，狀態列顯示要等多久
  ({ p, errs } = await open(b, { charsel: true }, { n: 3, win: now - 300000, next: now + 9 * 60000, steps: ['char'], pw: [] }));
  await p.waitForTimeout(4000);
  ok((await ev(p)).length === 0 && /第 3 次沒進到遊戲，約 9 分鐘後再試/.test(await st(p)), '等待中不按 ' + (await st(p)).split('\n')[0]);
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  // 4) 等待時間到：開新回合、按一次，下次等待變長（第 4 回合 → 20 分 ±20%）
  ({ p, errs } = await open(b, { charsel: true }, { n: 3, win: now - 300000, next: now - 1000, steps: ['char'], pw: [] }));
  await p.waitForTimeout(4000);
  let gg = await g(p), wait = (gg.next - Date.now()) / 60000;
  ok((await ev(p)).length === 1 && gg.n === 4 && wait > 15 && wait < 24.5, '時間到：再按一次、下次等約 20 分 ' + wait.toFixed(1));
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  // 5) 24 小時內已送 6 次密碼：不再送
  ({ p, errs } = await open(b, { login: true }, { pw: [1, 2, 3, 4, 5, 6].map((i) => now - i * 3600000) }));
  await p.waitForTimeout(8000);
  ok((await ev(p)).length === 0 && /已自動送出 6 次密碼/.test(await st(p)), '密碼次數上限：停下 ' + JSON.stringify(await ev(p)));
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  // 6) 排隊中：不按開始、不算失敗
  ({ p, errs } = await open(b, { charsel: true, queue: true }, { n: 1, win: now - 60000, next: now, steps: [], pw: [] }));
  await p.waitForTimeout(5000);
  ok((await ev(p)).length === 0 && (await g(p)).n === 1, '排隊中：什麼都不按 ' + JSON.stringify(await ev(p)));
  ok(/伺服器額滿排隊中：第 4,630 位／共 10,442 位/.test(await st(p)), '狀態列顯示排隊名次 ' + (await st(p)).split('\n')[0]);
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  // 6b) 打完一場後被丟去排隊（hook 的 run 還停在 over、沒有選角／標題）：不算在關卡、什麼都不按
  ({ p, errs } = await open(b, { queue: true }, { n: 1, win: now - 60000, next: now, steps: ['play'], pw: [] }));
  await p.evaluate(() => { window.__roHook.run = { state: 'over', time: 877, player: { x: 0, y: 0 }, touchMove: { x: 0, y: 0 } }; });
  await p.waitForTimeout(3000);
  ok((await ev(p)).length === 0 && /排隊中/.test(await st(p)) && !/關卡中/.test(await st(p)), '上一場停在 over＋排隊：狀態列顯示排隊、不是關卡中 ' + (await st(p)).split('\n')[0]);
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  // 7) 進到大廳：歸零（保留密碼紀錄）
  ({ p, errs } = await open(b, {}, { n: 4, win: now - 60000, next: now + 600000, steps: ['char'], pw: [now - 1000] }));
  await p.evaluate(() => { document.getElementById('lobby-ui').style.display = ''; });
  await p.waitForTimeout(1500);
  gg = await g(p);
  ok(!gg.n && !gg.win && gg.pw?.length === 1, '進到大廳：回合歸零、保留密碼紀錄 ' + JSON.stringify(gg));
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
