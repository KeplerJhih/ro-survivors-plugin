// v0.7.9：帳號密碼自動登入（遊戲改版後登入狀態被清掉，標題畫面變成「建立帳號／進入」＋「現在需要帳號」對話框）
// 模擬擴充功能背景頁（chrome.runtime.sendMessage）；帳密只在背景頁，不進 localStorage
const { chromium } = require('playwright');
const PAGE = `<html><head><meta charset="utf-8"></head><body>
  <div id="npc-dialog"><div id="npc-name">現在需要帳號</div><div id="npc-options"><button class="ro-btn primary">建立我的帳號</button></div></div>
  <div class="sp-tabs"><button data-sp-tab="login">進入</button><button data-sp-tab="register" class="active">建立帳號</button></div>
  <form id="sp-login" class="sp-pane hidden" style="display:none"><input name="username"><input type="password" name="password"><button type="submit" class="ro-btn primary sp-submit">進入</button><p class="sp-error"></p></form>
  <form id="sp-register" class="sp-pane"><input name="username"><input type="password" name="password"><button type="submit">建立帳號</button></form>
  <button id="sp-play" style="display:none">開始遊戲！</button>
</body></html>`;
async function run(b, { cred, pwOk = true }) {
  const p = await b.newPage({ viewport: { width: 900, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE }));
  await p.addInitScript(([cred, pwOk]) => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: true, pick: true, loop: true, autoLogin: true, v: 3, tab: 'main', activeProfile: 'A', profiles: { A: {} } }));
    window.__roHook = { run: null, lobby: null, runs: 0, runSeq: 0, drops: 0, stuck: 0 };
    window.__store = { cred }; window.__ev = []; window.__submitted = null;
    window.chrome = { runtime: { lastError: null, sendMessage: (id, msg, cb) => setTimeout(() => {
      const s = window.__store;
      if (msg.type === 'cred:get') return cb({ ok: true, ...(msg.full ? { cred: s.cred || null } : { user: s.cred?.u || '' }) });
      if (msg.type === 'cred:set') { s.cred = { u: msg.u, p: msg.p }; return cb({ ok: true, user: msg.u }); }
      if (msg.type === 'cred:clear') { s.cred = null; return cb({ ok: true }); }
      cb({ ok: true });
    }, 10) } };
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.dataset.robotExt = 'test';
      const $ = (q) => document.querySelector(q);
      $('#npc-dialog button').onclick = () => { window.__ev.push('dialog'); $('#npc-dialog').style.display = 'none'; };
      $('[data-sp-tab=login]').onclick = () => { window.__ev.push('tab-login'); $('#sp-login').style.display = ''; $('#sp-register').style.display = 'none'; };
      $('#sp-login').onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.target); window.__submitted = [f.get('username'), f.get('password')]; window.__ev.push('submit');
        if (pwOk) { $('#sp-login').style.display = 'none'; $('.sp-tabs').style.display = 'none'; $('#sp-play').style.display = ''; } else $('#sp-login .sp-error').textContent = '帳號或密碼錯誤'; };
    });
  }, [cred, pwOk]);
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  return { p, errs };
}
(async () => {
  const b = await chromium.launch();
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  const st = (p) => p.evaluate(() => document.getElementById('rb-st').textContent);

  // 1) 沒存帳密：停下並提示
  let { p, errs } = await run(b, { cred: null });
  await p.waitForTimeout(3000);
  ok(/填帳號密碼/.test(await st(p)) && !(await p.evaluate(() => window.__ev.length)), '沒存帳密 → 不動作、狀態列提示');
  // 從面板儲存 → 自動登入
  await p.evaluate(() => { const $ = (q) => document.querySelector(q); $('#rb-cu').value = 'kepler'; $('#rb-cp').value = 'pw12345678'; $('#rb-csave').click(); });
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.getElementById('rb-cp').value) === '' && /已儲存：kepler/.test(await p.evaluate(() => document.getElementById('rb-cst').textContent)), '儲存後清空密碼欄、顯示帳號');
  ok(!/pw12345678/.test(await p.evaluate(() => JSON.stringify(localStorage))), '密碼不在 localStorage');
  await p.waitForTimeout(9000);
  let ev = await p.evaluate(() => window.__ev);
  ok(JSON.stringify(ev.slice(0, 3)) === JSON.stringify(['dialog', 'tab-login', 'submit']), '關對話框 → 切到進入 → 送出 ' + JSON.stringify(ev));
  ok(JSON.stringify(await p.evaluate(() => window.__submitted)) === JSON.stringify(['kepler', 'pw12345678']), '表單送出正確帳密');
  ok(ev.includes('sp-play') || await p.evaluate(() => getComputedStyle(document.getElementById('sp-play')).display !== 'none'), '登入後回到「開始遊戲」');
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  // 2) 密碼錯：只試一次，狀態列顯示錯誤
  ({ p, errs } = await run(b, { cred: { u: 'kepler', p: 'wrong' }, pwOk: false }));
  await p.waitForTimeout(15000);
  ev = await p.evaluate(() => window.__ev);
  ok(ev.filter((x) => x === 'submit').length === 1, '密碼錯只送出一次 ' + JSON.stringify(ev));
  ok(/自動登入失敗：帳號或密碼錯誤/.test(await st(p)), '狀態列顯示失敗原因');
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
