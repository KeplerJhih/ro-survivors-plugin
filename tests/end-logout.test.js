// v0.8.2：①結算時「返回角色」還沒出來，不能按到上方帳號列的「離開」(#pb-exit，會登出)
//         ②已被登出（標題畫面＋「暫離」提示）但 hook 的 run 還停在 over → 要關提示、自動登入
const { chromium } = require('playwright');
const PAGE = `<html><head><meta charset="utf-8"></head><body>
  <div id="profile-bar"><button id="pb-exit" class="ro-btn small">離開</button></div>
  <div id="gameover" style="display:none"><div id="go-title">你存活下來了！</div><button id="btn-restart" class="ro-btn primary">返回角色</button></div>
  <div id="npc-dialog" style="display:none"><div id="npc-name">暫離</div><div id="npc-text"><p>你已 5 分鐘沒有動作，已離開遊戲。</p></div><div id="npc-options"><button class="ro-btn primary">接受</button></div></div>
 <div id="charselect" style="display:none"><div id="slots"><div class="slot selected"><div class="slot-name">Kepler</div></div><div class="slot"><div class="slot-name">阿服快打</div></div></div><button id="btn-play">開始遊戲</button></div>
  <div id="splash" style="display:none"><div class="sp-tabs"><button data-sp-tab="login">進入</button><button data-sp-tab="register" class="active">建立帳號</button></div>
  <form id="sp-login" style="display:none"><input name="username"><input type="password" name="password"><button type="submit">進入</button><p class="sp-error"></p></form>
  <form id="sp-register"><input name="username"><input type="password" name="password"><button type="submit">建立帳號</button></form></div>
</body></html>`;
async function open(b, kicked, charsel) {
  const p = await b.newPage({ viewport: { width: 900, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE }));
  await p.addInitScript(([kicked, charsel]) => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: true, pick: true, loop: true, autoLogin: true, v: 3, tab: 'main', activeProfile: 'A', profiles: { A: { char: '阿服快打' } } }));
    const run = { state: kicked ? 'over' : 'playing', time: 900, level: 50, zeny: 0, chestCost: () => 30, chestsOpened: 0, player: { x: 500, y: 500 }, pickups: [], touchMove: { x: 0, y: 0 }, bounds: { x0: 0, x1: 3000, y0: 0, y1: 3000 },
      enemies: [], weapons: [], classDef: { id: 'acolyte' }, runItems: { slots: new Map() }, runItemName: (s, i) => i, perksLeft: {}, stats: { maxHp: 100 }, hp: 100 };
    window.__roHook = { run, lobby: null, runs: 1, runSeq: 1, drops: 0, stuck: 0 };
    window.__ev = []; window.__submitted = null;
    window.chrome = { runtime: { lastError: null, sendMessage: (id, msg, cb) => setTimeout(() => {
      if (msg.type === 'cred:get') return cb({ ok: true, ...(msg.full ? { cred: { u: 'kepler', p: 'pw' } } : { user: 'kepler' }) });
      cb({ ok: true }); }, 10) } };
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.dataset.robotExt = 'test';
      const $ = (q) => document.querySelector(q);
      $('#pb-exit').onclick = () => window.__ev.push('LOGOUT');
      $('#btn-restart').onclick = () => window.__ev.push('restart');
      $('#npc-dialog button').onclick = () => { window.__ev.push('accept'); $('#npc-dialog').style.display = 'none'; };
      $('[data-sp-tab=login]').onclick = () => { window.__ev.push('tab-login'); $('#sp-login').style.display = ''; $('#sp-register').style.display = 'none'; };
      $('#sp-login').onsubmit = (e) => { e.preventDefault(); window.__ev.push('submit'); };
      document.querySelectorAll('.slot').forEach((sl) => sl.onclick = () => { window.__ev.push('slot:' + sl.textContent); document.querySelectorAll('.slot').forEach((x) => x.classList.toggle('selected', x === sl)); });
      $('#btn-play').onclick = () => window.__ev.push('play');
      if (charsel) { $('#profile-bar').style.display = 'none'; $('#charselect').style.display = ''; return; }
      if (kicked) { $('#profile-bar').style.display = 'none'; $('#splash').style.display = ''; $('#npc-dialog').style.display = ''; }
    });
  }, [kicked, charsel]);
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  return { p, errs };
}
(async () => {
  const b = await chromium.launch();
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  // ① 關卡結束，結算畫面 3 秒後才出來
  let { p, errs } = await open(b, false);
  await p.waitForTimeout(800);
  await p.evaluate(() => { window.__roHook.run.state = 'over'; setTimeout(() => { document.getElementById('gameover').style.display = ''; }, 3000); });
  await p.waitForTimeout(9000);
  let ev = await p.evaluate(() => window.__ev);
  ok(!ev.includes('LOGOUT') && ev.includes('restart'), '結算：等「返回角色」，不按帳號列的「離開」 ' + JSON.stringify(ev));
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  // ② 已被登出，run 還停在 over
  ({ p, errs } = await open(b, true));
  await p.waitForTimeout(14000);
  ev = await p.evaluate(() => window.__ev);
  ok(JSON.stringify(ev) === JSON.stringify(['accept', 'tab-login', 'submit']), '被登出：關「暫離」→ 切到進入 → 送出 ' + JSON.stringify(ev));
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();
  // ③ 排隊進來後停在選角畫面，run 還停在 over → 選設定的角色並開始
  ({ p, errs } = await open(b, true, true));
  await p.waitForTimeout(8000);
  ev = await p.evaluate(() => window.__ev);
  ok(ev[0] === 'slot:阿服快打' && ev.includes('play'), '選角畫面：選對角色並開始 ' + JSON.stringify(ev));
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();
  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
