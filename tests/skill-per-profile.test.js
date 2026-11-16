// v0.7.7：技能設定跟著設定檔走，不分職業。
// 舊格式 { acolyte: [...] } 要轉成陣列；角色是法師時也要看到這個設定檔的技能；切換設定檔要換成另一份技能。
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 760 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><meta charset="utf-8"></head><body></body></html>' }));
  await p.addInitScript(() => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ pick: true, tab: 'pick', v: 3, activeProfile: '法師', profiles: {
      服事: { priority: { acolyte: ['神聖之光'] }, skillBanish: { acolyte: ['緩速術'] }, skillFocus: { acolyte: ['神聖之光'] } },
      法師: { priority: { acolyte: [], mage: ['火箭術', '雷擊術'] }, skillBanish: {}, skillFocus: { acolyte: ['神聖之光'] } },
    } }));
    window.__roHook = { run: { state: 'playing', classDef: { id: 'mage' }, player: { x: 0, y: 0 }, enemies: [], pickups: [], touchMove: { x: 0, y: 0 } }, lobby: null, runs: 1, runSeq: 1, drops: 0, stuck: 0 };
  });
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  await p.waitForTimeout(400);
  // v0.9.0 統一清單：🎯 列（照順序）＝優先、✕ 列＝放逐、★ 亮＝專注
  const ui = () => p.evaluate(() => { const rows = [...document.querySelectorAll('.il[data-il=skill] .ir')]; const nm = (r) => r.querySelector('.nm').textContent;
    return { pri: rows.filter((r) => r.classList.contains('w')).map(nm).join('\n'), ban: rows.filter((r) => r.classList.contains('b')).map(nm).join('\n'), foc: rows.filter((r) => r.querySelector('[data-s=focus].on')).map(nm).join('\n') }; });
  const stored = () => p.evaluate(() => { const S = JSON.parse(localStorage.getItem('roBot.cfg')); return Object.fromEntries(Object.entries(S.profiles).map(([n, f]) => [n, [f.priority, f.skillBanish, f.skillFocus]])); });
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  const s = await stored();
  ok(JSON.stringify(s.服事) === JSON.stringify([['神聖之光'], ['緩速術'], ['神聖之光']]), '服事 舊格式轉成陣列 ' + JSON.stringify(s.服事));
  ok(JSON.stringify(s.法師) === JSON.stringify([['火箭術', '雷擊術'], [], ['神聖之光']]), '法師 取有內容的那份 ' + JSON.stringify(s.法師));
  let u = await ui();
  ok(u.pri === '火箭術\n雷擊術', '法師設定檔顯示自己的技能 ' + JSON.stringify(u));
  await p.selectOption('#rb-prof', '服事'); await p.waitForTimeout(200);
  u = await ui();
  ok(u.pri === '神聖之光' && u.ban === '緩速術', '切到服事（角色仍是法師）照樣顯示服事的技能 ' + JSON.stringify(u));
  await p.evaluate(() => { const i = document.querySelector('.il[data-il=skill] .il-add input'); i.value = '治癒術'; i.nextElementSibling.click(); }); await p.waitForTimeout(200);
  await p.selectOption('#rb-prof', '法師'); await p.waitForTimeout(200);
  ok((await ui()).pri === '火箭術\n雷擊術', '切回法師不受影響');
  await p.selectOption('#rb-prof', '服事'); await p.waitForTimeout(200);
  ok((await ui()).pri === '神聖之光\n治癒術', '服事的修改有存下來');
  ok(!errs.length, 'no page errors ' + errs.join(';'));
  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
