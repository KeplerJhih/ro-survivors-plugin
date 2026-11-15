// v0.8.5：裝備總覽——所有場次的裝備一張表：部位、可裝備職業、基本能力＋詞條；可篩選品質／部位／只看目前角色能裝
const { chromium } = require('playwright');
// 假的遊戲分塊：照實際格式（函式名是亂的）
const CHUNK = `function Z(t,e,a,o,s={}){ys[t]={id:t,slot:e,cardSlots:a,bonuses:o,...s}}function re(t,e,a,o,s={}){ys[t]?Object.assign(ys[t],{base:o,bonuses:[]}):Z(t,e,a,[],{base:o,...s})}
const Ka=(t,e)=>()=>0,Y=Ka((t,e)=>t.damageMult+=e,t=>1),Ee=Ka((t,e)=>t.critChance+=e,t=>1),dA=["thief","ninja"];
Z(1250,"weapon",2,[Y(.07),Ee(.05)],{jobs:["thief"],wtype:"단검"});Z(5038,"head_top",0,[Y(.08),Ee(.03)],{rare:!0});re(1610,"weapon",4,{atk:35,matk:45,def:0,wlv:1,elv:1},{jobs:["mage","acolyte"],wtype:"롯드"});re(2324,"armor",1,{atk:0,matk:0,def:4,elv:1},{jobs:["acolyte"]});Z(1201,"weapon",2,[Y(.03)],{jobs:dA,wtype:"단검"});
${Array.from({ length: 60 }, (_, i) => `Z(${2600 + i},"acc",0,[Y(.01)]);`).join('')}`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 1000 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://ro-survivors.com/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><meta charset="utf-8"><script src="/build/soul_linker-T3st.js"></script></head><body></body></html>' }));
  await p.route('https://ro-survivors.com/build/soul_linker-T3st.js', r => r.fulfill({ contentType: 'text/javascript', body: 'var ys={};' + CHUNK }));
  await p.addInitScript(() => {
    localStorage.setItem('roBot.cfg', JSON.stringify({ fight: false, pick: false, loop: false, v: 3, tab: 'log', activeProfile: 'A', profiles: { A: {} } }));
    const now = Date.now(), D = (min, o) => ({ at: now - min * 60000, seq: 1, stage: '斐揚洞穴', kind: '裝備', stats: '', ...o });
    localStorage.setItem('roBot.drops', JSON.stringify([
      D(300, { q: '史詩', name: 'Gakkung', id: 1250, slot: '武器', aff: 'AGI +2、爆擊 +2%' }),
      D(200, { q: '普通', name: 'Mantle', id: 2505, slot: '披肩' }),
      D(100, { q: '傳說', name: 'Wand of Intelligence', id: 1610, slot: '武器', aff: 'INT +3、冷卻 +4%' }),
      D(50, { q: '稀有', name: 'Fur Hat', id: 5038, slot: '頭飾', aff: 'VIT +1' }),
      D(10, { q: '優良', name: 'Saint Robe', id: 2324, slot: '護甲', aff: 'HP +40' }),
      { at: now, kind: '卡片', name: 'Poring Card', q: '' },
    ]));
    localStorage.setItem('roBot.myJob', 'priest'); // 祭司 → 服事系可裝
    window.__roHook = { run: null, lobby: null, runs: 0, runSeq: 1, drops: 0, stuck: 0 };
  });
  await p.goto('https://ro-survivors.com/');
  await p.addScriptTag({ path: require('path').join(__dirname, '..', 'bot.js') });
  await p.waitForTimeout(1500);
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  const rows = () => p.evaluate(() => [...document.querySelectorAll('#rb-gear .gi')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
  const click = (gv) => p.evaluate((gv) => document.querySelector(`#rb-gear [data-gv="${gv}"]`).click(), gv);

  let r = await rows();
  ok(r.length === 4, '預設不顯示普通：4 件 ' + r.length);
  ok(/^傳說/.test(r[0]) && /^史詩/.test(r[1]) && /^稀有/.test(r[2]) && /^優良/.test(r[3]), '依品質排序');
  ok(/武器・杖/.test(r[0]) && /INT \+3、冷卻 \+4%/.test(r[0]) && /魔法師・服事/.test(r[0]) && /ATK 35 MATK 45/.test(r[0]), '一行看到部位・武器種類、詞條、職業、基本能力：' + r[0]);
  ok(/盜賊/.test(r[1]) && /傷害 \+7%、爆擊 \+5%/.test(r[1]), '武器固有加成：' + r[1]);
  ok(/全職業/.test(r[2]), '沒限制＝全職業：' + r[2]);
  ok(/裝備總覽/.test(await p.evaluate(() => document.getElementById('rb-gear').innerText)) && /5 件/.test(await p.evaluate(() => document.getElementById('rb-gear').innerText)), '標題與總數（卡片不算）');

  await click('q:普通'); r = await rows(); ok(r.length === 5, '點「普通」加進來：5 件');
  await click('s:武器'); r = await rows(); ok(r.length === 2 && r.every((x) => /武器/.test(x)), '只看武器：2 件');
  await click('s:'); await click('mine:1'); r = await rows();
  ok(r.length === 4 && !r.some((x) => /盜賊/.test(x)), '只看祭司能裝：去掉盜賊武器 ' + r.length);
  ok(/只看祭司能裝/.test(await p.evaluate(() => document.getElementById('rb-gear').innerText)), '按鈕寫目前職業');
  await click('r:sess'); r = await rows(); ok(r.length === 0, '本次掛機：舊紀錄不算');
  const v = await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.gearView')));
  ok(v.r === 'sess' && v.mine === true && v.q.includes('普通'), '篩選記住 ' + JSON.stringify(v));
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('roBot.itemDb')).file === 'soul_linker-T3st.js'), '物品表快取（依檔名）');
  ok(!errs.length, 'no page errors ' + errs.join(';'));
  await p.screenshot({ path: require('path').join(__dirname, 'out', 'gear-overview.png'), clip: await p.evaluate(() => { const r = document.getElementById('robot-panel').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 900) }; }) });
  console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
  await b.close();
})();
