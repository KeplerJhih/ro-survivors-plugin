// v0.9.2 燈籠節（季節活動）：關卡選燈籠節時，回城找「節慶主持人」→ #festival「開始遊戲」→ 升級設定「前往野外」；扭蛋按鈕不碰。
// 一般關卡照舊找遠征隊長；出發前的「升級：立即／累積」對話框也按「前往野外」（以前會被當成別的對話框按取消）
const { chromium } = require('playwright');
// 結構照 2026-11-16 19:43 實際畫面
const PAGE = `<html><head><meta charset="utf-8"></head><body>
  <div id="lobby-ui">廣場</div>
  <button id="lobby-prompt" style="display:none"></button>
  <div id="festival" class="overlay" style="display:none"><div class="ro-window festival-window"><button id="festival-close" class="fe-x">✕</button>燈籠節 季節活動
    <button class="ro-btn small primary gacha">打開</button><button class="ro-btn small gacha">×9</button>
    <button id="festival-play" class="ro-btn primary fe-play">開始遊戲</button></div></div>
  <div id="npc-dialog" style="display:none"><div id="npc-name">升級</div><div id="npc-text"><div class="diff"><div class="diff-bank"><span>升級</span><div class="seg"><button class="ro-btn small active" data-bank="0">立即</button><button class="ro-btn small" data-bank="1">累積</button></div></div></div></div>
    <div id="npc-options"><button class="ro-btn" id="cancel">取消</button><button class="ro-btn primary" id="go">前往野外</button></div></div>
</body></html>`;
async function open(b, stage) {
  const p = await b.newPage({ viewport: { width: 900, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE }));
  await p.addInitScript((stage) => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: true, pick: true, loop: true, reenterDelay: 0, v: 3, tab: 'stage', activeProfile: 'A', profiles: { A: { stage } } }));
    window.__ev = [];
    const lobby = { player: { x: 0, y: 0 }, touchMove: { x: 0, y: 0 },
      npcs: [{ id: 'captain', name: '遠征隊長', x: 100, y: 100 }, { id: 'festival', name: '節慶主持人', x: 900, y: 300 }],
      moveTo(x, y) { window.__ev.push(`moveTo:${x},${y}`); } };
    window.__roHook = { run: null, lobby, runs: 0, runSeq: 0, drops: 0, stuck: 0 };
    document.addEventListener('DOMContentLoaded', () => {
      const $ = (q) => document.querySelector(q), show = (q, on = true) => ($(q).style.display = on ? '' : 'none');
      document.querySelectorAll('.gacha').forEach((g) => (g.onclick = () => window.__ev.push('GACHA')));
      $('#lobby-prompt').onclick = () => { window.__ev.push('talk:' + $('#lobby-prompt').textContent); if (/主持人/.test($('#lobby-prompt').textContent)) show('#festival'); };
      $('#festival-play').onclick = () => { window.__ev.push('play'); show('#festival', false); show('#npc-dialog'); };
      $('#go').onclick = () => { window.__ev.push('go'); show('#npc-dialog', false); };
      $('#cancel').onclick = () => { window.__ev.push('CANCEL'); show('#npc-dialog', false); };
    });
  }, stage);
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  return { p, errs };
}
(async () => {
  const b = await chromium.launch();
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  const ev = (p) => p.evaluate(() => window.__ev);

  // 1) 燈籠節
  let { p, errs } = await open(b, '燈籠節');
  await p.waitForTimeout(4000);
  ok((await ev(p)).some((e) => e === 'moveTo:900,300'), '走向節慶主持人（不是隊長） ' + JSON.stringify(await ev(p)));
  ok(await p.evaluate(() => /季節活動/.test(document.querySelector('select[data-k=stage]').selectedOptions[0].textContent) && getComputedStyle(document.querySelector('[data-show="stage=燈籠節"]')).display !== 'none'), '關卡選單顯示「燈籠節（季節活動）」與說明');
  await p.evaluate(() => { const pr = document.getElementById('lobby-prompt'); pr.textContent = '與主持人交談 空格'; pr.style.display = ''; });
  await p.waitForTimeout(9000);
  let e = await ev(p);
  const i1 = e.indexOf('talk:與主持人交談 空格'), i2 = e.indexOf('play'), i3 = e.indexOf('go');
  ok(i1 >= 0 && i2 > i1 && i3 > i2, '交談 → 開始遊戲 → 前往野外 ' + JSON.stringify(e));
  ok(!e.includes('GACHA') && !e.includes('CANCEL'), '沒按扭蛋、沒按取消');
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  // 2) 一般關卡：照舊找隊長；出發前的升級設定也按前往野外
  ({ p, errs } = await open(b, '斐揚森林'));
  await p.waitForTimeout(4000);
  ok((await ev(p)).some((e) => e === 'moveTo:100,100') && !(await ev(p)).some((e) => e === 'moveTo:900,300'), '一般關卡走向遠征隊長');
  await p.evaluate(() => { document.getElementById('npc-dialog').style.display = ''; });
  await p.waitForTimeout(4000);
  e = await ev(p);
  ok(e.includes('go') && !e.includes('CANCEL'), '升級設定對話框 → 前往野外（不是取消） ' + JSON.stringify(e));
  ok(!errs.length, 'no page errors ' + errs.join(';')); await p.close();

  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
