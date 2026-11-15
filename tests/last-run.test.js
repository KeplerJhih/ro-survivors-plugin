// v0.8.7：「你的上一局」對話框（斷線／維修那局的戰利品補進帳號）——記進掉落紀錄、按「接受」；廣場與標題畫面都要處理（以前在廣場會卡住）
const { chromium } = require('playwright');
// 文字照 2026-11-16 06:19 實際畫面
const DLG = `<div id="npc-dialog" class="ro-window npc-window"><div class="ro-title" id="npc-name">你的上一局</div>
  <div class="ro-body"><div id="npc-text" class="npc-text"><p>這局結束時無法領取。現在已經放進你的帳號：</p>
  <p>普通: Katana<br>稀有: Angel Wings<br>優良: Wooden Mail<br>稀有: Fancy Flower</p><p>Wormtail Card<br>Dragon Tail Card</p></div></div>
  <div class="btn-row pad" id="npc-options"><span class="spacer"></span><button class="ro-btn primary">接受</button></div></div>`;
async function open(b, where) {
  const p = await b.newPage({ viewport: { width: 900, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const body = where === 'lobby' ? `<div id="lobby-ui">廣場</div>${DLG}` : `<button id="sp-play">開始遊戲！</button>${DLG}`;
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html><head><meta charset="utf-8"></head><body>${body}</body></html>` }));
  await p.addInitScript(() => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: true, pick: true, loop: true, autoLogin: true, v: 3, tab: 'log', activeProfile: 'A', profiles: { A: {} } }));
    localStorage.setItem('roBot.log', JSON.stringify([{ at: Date.now() - 600000, stage: '斐揚森林', result: '死亡', time: 964 }]));
    window.__roHook = { run: null, lobby: null, runs: 0, runSeq: 3, drops: 0, stuck: 0 };
    window.__ev = [];
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelector('#npc-dialog button').onclick = () => { window.__ev.push('accept'); document.getElementById('npc-dialog').style.display = 'none'; };
      const sp = document.getElementById('sp-play'); if (sp) sp.onclick = () => window.__ev.push('sp-play');
    });
  });
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  return { p, errs };
}
(async () => {
  const b = await chromium.launch();
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  for (const where of ['title', 'lobby']) {
    const { p, errs } = await open(b, where);
    await p.waitForTimeout(5000);
    const ev = await p.evaluate(() => window.__ev);
    const d = await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.drops') || '[]'));
    ok(ev[0] === 'accept', `${where}：先按「接受」 ` + JSON.stringify(ev));
    if (where === 'title') ok(ev.includes('sp-play'), 'title：接著照常按開始遊戲');
    ok(d.length === 6 && d.filter((x) => x.kind === '裝備').length === 4 && d.filter((x) => x.kind === '卡片').length === 2, `${where}：記進 4 件裝備＋2 張卡 ` + d.length);
    ok(d.some((x) => x.q === '稀有' && x.name === 'Angel Wings' && x.stage === '斐揚森林' && x.src === '上一局補發'), `${where}：品質、名稱、關卡、來源`);
    if (where === 'title') {
      await p.evaluate(() => document.querySelector('nav button:nth-child(5)')?.click());
      await p.waitForTimeout(500);
      ok(/Angel Wings/.test(await p.evaluate(() => document.getElementById('rb-gear')?.innerText || '')), '裝備總覽看得到補發的裝備');
    }
    ok(!errs.length, 'no page errors ' + errs.join(';'));
    await p.close();
  }
  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
