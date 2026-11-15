// v0.7.9：自動登入選角色
// 1) 舊版存的「名稱 職業」（例：阿服快打 祭司）也要選對；2) 找不到角色就停在選角畫面，不能用預設角色進遊戲；
// 3) 手動按開始遊戲時，把選中的角色記進目前設定檔
const { chromium } = require('playwright');
const PAGE = `<html><head><meta charset="utf-8"></head><body>
   <div id="charsel"><div id="slots"><div class="slot selected"><div class="slot-name">Kepler</div></div><div class="slot"><div class="slot-name">阿服快打</div></div><div class="slot empty">空欄位</div></div><button id="btn-play">開始遊戲</button></div>
   <div id="lobby-ui" style="display:none">lobby</div></body></html>`;
async function run(b, setup, wait = 6000) {
  const p = await b.newPage({ viewport: { width: 900, height: 820 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE }));
  await p.addInitScript(setup);
  await p.addInitScript(() => {
    window.__roHook = { run: null, lobby: null, runs: 0, runSeq: 0, drops: 0, stuck: 0 };
    window.__ev = [];
    document.addEventListener('click', (e) => {
      const t = e.target.closest('button,.slot'); if (!t) return; window.__ev.push(t.id || t.textContent.trim());
      if (t.classList?.contains('slot')) { document.querySelectorAll('.slot').forEach(s => s.classList.remove('selected')); t.classList.add('selected'); }
    });
    document.addEventListener('click', (e) => { if (e.target.closest('#btn-play')) setTimeout(() => { document.getElementById('charsel').style.display = 'none'; document.getElementById('lobby-ui').style.display = 'block'; }, 0); });
  });
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  await p.waitForTimeout(wait);
  return { p, errs };
}
(async () => {
  const b = await chromium.launch();
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };

  // 1) 舊版 lastChar「阿服快打 祭司」
  let { p, errs } = await run(b, () => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: true, pick: true, loop: true, v: 3, activeProfile: '服事', profiles: { 服事: {} } }));
    localStorage.setItem('roBot.lastChar', '阿服快打 祭司');
  });
  let ev = await p.evaluate(() => window.__ev);
  ok(JSON.stringify(ev) === JSON.stringify(['阿服快打', 'btn-play']), '舊格式「名稱 職業」選對角色 ' + JSON.stringify(ev));
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.cfg')).profiles.服事.char) === '阿服快打', '進遊戲時記進設定檔');
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  // 2) 找不到角色（舊版從 #hud-name 誤記成職業名）→ 不按開始遊戲
  ({ p, errs } = await run(b, () => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: true, pick: true, loop: true, v: 3, activeProfile: '服事', profiles: { 服事: {} } }));
    localStorage.setItem('roBot.lastChar', 'Espadachín');
  }));
  ev = await p.evaluate(() => window.__ev);
  ok(!ev.includes('btn-play'), '找不到角色就停下 ' + JSON.stringify(ev));
  ok(/找不到角色「Espadachín」/.test(await p.evaluate(() => document.getElementById('rb-st').textContent)), '狀態列提示');
  // 使用者手動選角色並開始 → 記住
  await p.evaluate(() => { document.querySelector('#slots .slot:nth-child(2)').click(); document.getElementById('btn-play').click(); }); await p.waitForTimeout(300);
  const st = await p.evaluate(() => ({ c: JSON.parse(localStorage.getItem('roBot.cfg')).profiles.服事.char, l: localStorage.getItem('roBot.lastChar') }));
  ok(st.c === '阿服快打' && st.l === '阿服快打', '手動開始遊戲時記住角色 ' + JSON.stringify(st));
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  // 3) 設定檔各自的角色優先於全域 lastChar
  ({ p, errs } = await run(b, () => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: true, pick: true, loop: true, v: 3, activeProfile: '盜賊', profiles: { 服事: { char: '阿服快打' }, 盜賊: { char: 'Kepler' } } }));
    localStorage.setItem('roBot.lastChar', '阿服快打');
  }));
  ev = await p.evaluate(() => window.__ev);
  ok(JSON.stringify(ev) === JSON.stringify(['btn-play']), '用設定檔的角色（Kepler 已選中，直接開始） ' + JSON.stringify(ev));
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  // 4) 使用者自己填的角色名稱：手動選別隻進遊戲也不覆蓋
  ({ p, errs } = await run(b, () => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: true, pick: true, loop: true, v: 3, activeProfile: '服事', profiles: { 服事: { char: ' 阿服快打 ' } } }));
  }));
  ev = await p.evaluate(() => window.__ev);
  ok(JSON.stringify(ev) === JSON.stringify(['阿服快打', 'btn-play']), '手填名稱（前後空白也可）選對 ' + JSON.stringify(ev));
  ok(await p.evaluate(() => document.querySelector('[data-k="char"]').value.trim()) === '阿服快打', '面板顯示角色名稱');
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
