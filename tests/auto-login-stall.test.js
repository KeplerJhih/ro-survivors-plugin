const { chromium } = require('playwright');
const SP = __dirname + '/out/';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 820 } }); const errs=[]; p.on('pageerror', e=>errs.push(e.message)); const logs=[]; p.on('console', m=>logs.push(m.text().replace('%c[roBot] color:#5b8def ','')));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html><head><meta charset="utf-8"></head><body style="background:#334">
   <div id="splash"><button id="sp-play"><span>開始遊戲！</span></button></div>
   <div id="charsel" style="display:none"><div id="slots"><div class="slot selected"><div class="slot-name">Kepler</div></div><div class="slot"><div class="slot-name">阿服快打</div></div></div><button id="btn-play">開始遊戲</button></div>
   <div id="lobby-ui" style="display:none">lobby</div></body></html>` }));
  await p.addInitScript(() => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: true, pick: true, loop: true, v: 3, tab: 'log', activeProfile: 'A', profiles: { A: {} } }));
    localStorage.setItem('roBot.lastChar', '阿服快打');
    window.__roHook = { run: null, lobby: null, runs: 0, runSeq: 0, drops: 0, stuck: 0 };
    window.__ev = [];
    document.addEventListener('click', (e) => {
      const t = e.target.closest('button,.slot'); if (!t) return; window.__ev.push(t.id || t.textContent.trim());
      if (t.id === 'sp-play') { document.getElementById('splash').style.display = 'none'; document.getElementById('charsel').style.display = 'block'; }
      if (t.classList?.contains('slot')) { document.querySelectorAll('.slot').forEach(s => s.classList.remove('selected')); t.classList.add('selected'); }
      if (t.id === 'btn-play') { document.getElementById('charsel').style.display = 'none'; document.getElementById('lobby-ui').style.display = 'block'; }
    }, true);
  });
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname,'..','bot.js') });
  await p.waitForTimeout(9000);
  console.log('login clicks', await p.evaluate(() => window.__ev));
  // stall simulation
  await p.evaluate(async () => {
    let hidden = true; Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
    window.__roHook.hiddenAt = Date.now() - 125000; // pretend hidden for 125s
    hidden = false; document.dispatchEvent(new Event('visibilitychange'));
  });
  await p.click('nav button[data-tab=main]'); await p.click('nav button[data-tab=log]'); await p.waitForTimeout(400);
  console.log('stalls', await p.evaluate(() => localStorage.getItem('roBot.stalls')), errs, logs.filter(l=>/自動登入|背景/.test(l)));
  await p.screenshot({ path: SP + 'v71_log.png', clip: { x: 0, y: 60, width: 260, height: 300 } });
  await p.click('nav button[data-tab=sys]'); await p.waitForTimeout(300);
  await p.screenshot({ path: SP + 'v71_main.png', clip: { x: 0, y: 60, width: 260, height: 760 } });
  await b.close();
})();
