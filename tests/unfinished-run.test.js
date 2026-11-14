// v0.7.3：廣場跳「未完成的一局」→ 按繼續 →「這局已經結束」→ 按 OK；閒置登出提示 →「我知道了」
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 760 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html><head><meta charset="utf-8"></head><body style="background:#334">
   <div id="lobby-ui">lobby</div>
   <div id="npc-dialog"><div id="npc-name">未完成的一局</div><div id="npc-text">你在斐揚洞穴第15:11分鐘（Lv 70）離開了一局。要從那裡繼續嗎？</div>
   <div id="npc-options"><button class="ro-btn" id="discard">捨棄</button><button class="ro-btn primary" id="cont">繼續</button></div></div></body></html>` }));
  await p.addInitScript(() => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: true, pick: true, loop: true, reenterDelay: 0, v: 3, activeProfile: 'A', profiles: { A: {} } }));
    window.__roHook = { run: null, lobby: { npcs: [] }, runs: 0, runSeq: 0, drops: 0, stuck: 0 };
    window.__ev = [];
    document.addEventListener('click', (e) => { const t = e.target.closest('button'); if (!t || t.closest('#robot-panel')) return; window.__ev.push(t.id || t.textContent.trim());
      if (t.id === 'cont') { document.getElementById('npc-text').textContent = '這局已經結束（時間已到或你開始了另一局）：戰利品會由郵差寄給你。'; document.getElementById('npc-options').innerHTML = '<button class="ro-btn primary" id="ok">OK</button>'; }
      if (t.id === 'ok') document.getElementById('npc-dialog').style.display = 'none';
      if (t.id === 'afk') { document.getElementById('afk').remove(); }
    }, true);
  });
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  await p.waitForTimeout(7000);
  const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
  const ev = await p.evaluate(() => window.__ev);
  ok(ev[0] === 'cont', '未完成的一局 → 按「繼續」 ' + JSON.stringify(ev));
  ok(ev.includes('ok'), '這局已經結束 → 按「OK」');
  ok(!ev.includes('discard'), '沒有按「捨棄」');
  // 閒置登出：標題畫面 + 提示
  await p.evaluate(() => { document.getElementById('lobby-ui').style.display = 'none'; window.__ev = [];
    document.body.insertAdjacentHTML('beforeend', '<div id="afk"><p>你已 5 分鐘沒有動作，已離開遊戲。按「開始遊戲」即可回來</p><button id="afk">我知道了</button></div>'); });
  await p.waitForTimeout(4000);
  ok((await p.evaluate(() => window.__ev)).includes('afk'), '閒置登出 → 按「我知道了」');
  ok(!errs.length, 'no page errors ' + errs.join(';'));
  await b.close();
})();
