// RO Survivors Bot — runs in the page (MAIN world) at document_start.
(() => {
  'use strict';
  // Hot reload: a newer copy of this file can be injected into the page without refreshing.
  // The old instance is torn down; captured game objects live in window.__roHook (hook.js).
  if (window.__roBot?.destroy) { try { window.__roBot.destroy(); } catch {} }
  const H = window.__roHook || (window.__roHook = { run: null, lobby: null, runs: 0, runSeq: 0, drops: 0, stuck: 0 });
  const BOT = (window.__roBot = {
    version: '0.9.11',
    get run() { return H.run; },
    get lobby() { return H.lobby; },
    get runs() { return H.runs; }, set runs(v) { H.runs = v; },
    get drops() { return H.drops; }, set drops(v) { H.drops = v; },
    get stuck() { return H.stuck; }, set stuck(v) { H.stuck = v; },
    timers: [], cleanup: [], seq: H.runSeq, resumeDelay: 1500,
    // 每場的狀態放在 window.__roHook.rs（熱更新不會清掉）。v0.5.6 以前放在 BOT 上 → 按 ⟳ 後「已拿到神祇」被忘記，
    // 已開寶箱數又超過放棄條件 → 誤判獵神失敗而結束這場、重新進關
    get rs() { if (!H.rs || H.rs.seq !== H.runSeq) H.rs = { seq: H.runSeq, chestUsed: {}, skillUsed: {}, deityUsed: {}, anchor: null }; return H.rs; },
    get chestUsed() { return this.rs.chestUsed; }, set chestUsed(v) { this.rs.chestUsed = v; },
    get skillUsed() { return this.rs.skillUsed; }, set skillUsed(v) { this.rs.skillUsed = v; },
    get deityUsed() { return this.rs.deityUsed; }, set deityUsed(v) { this.rs.deityUsed = v; },
    get anchor() { return this.rs.anchor; }, set anchor(v) { this.rs.anchor = v; },
    destroy() {
      this.timers.forEach(clearInterval);
      this.cleanup.forEach((f) => { try { f(); } catch {} });
      document.getElementById('robot-panel')?.remove();
      if (H.run?.touchMove) { H.run.touchMove.x = 0; H.run.touchMove.y = 0; }
    },
  });

  // ───────────────────────── 2. Config ─────────────────────────
  const DEITY_NAMES = ['堡壘之神', '記憶之神', '生命之神', '智慧之神', '思想之神', '力量之神', '戰爭之神', '疾風之神',
    '處刑之神', '貪婪之神', '束縛之神', '詭計之神', '折磨之神', '轉移神祇'];
  const QUALITY = ['傳說', '史詩', '稀有', '精良', '優良', '普通']; // best → worst（不確定的品質名稱排在後面）
  const STAGES = ['普隆德拉原野', '普隆德拉地下水道', '失事輪', '柏伊亞嵐島', '斐揚森林', '斐揚洞穴', '普隆德拉城', '燈籠節'];
  // v0.9.2 燈籠節（季節活動，關卡 louyang／洛陽）：不在遠征隊長的關卡清單，要找廣場的「節慶主持人」→ #festival 面板「開始遊戲」
  const FEST = '燈籠節';
  const isFest = () => cfg.stage === FEST;
  const STAGE_ID = { louyang: FEST };
  const stageOf = (run) => STAGE_ID[run?.stageId] || (cfg.loop ? cfg.stage : run?.stageId || '');
  const DIFF = [
    { name: '敵人數量', min: 1, max: 3.5 },
    { name: '敵人傷害', min: 1, max: 1.75 },
    { name: '敵人血量', min: 1, max: 2.5 },
    { name: '敵人速度', min: 1, max: 1.75 },
    { name: '事件數量', min: 1, max: 2.5 },
  ];
  const DEFAULT_CFG = {
    fight: false,          // 自動戰鬥（移動 / 閃避 / 撿東西）
    autoResume: true,      // 關卡中被暫停時自動按「繼續」
    // 長時間掛機（所有設定檔共用）
    keepAwake: true,       // 掛機時保持電腦清醒（chrome.power）
    noDiscard: true,       // 分頁不被 Chrome 自動釋放
    autoRestore: false,    // 視窗被最小化時自動還原
    manual: false,         // v0.8.0 手動模式：bot 完全不操作（戰鬥、選卡、進關、登入、繼續），各開關設定保留
    autoLogin: true,       // 頁面重新整理後自動：開始遊戲 → 選上次角色 → 進廣場（需開自動進關）
    pick: false,           // 自動選卡（技能 / 寶箱 / 掉落展示）
    loop: false,           // 自動循環進關
    maxRuns: 0,            // 0 = 無限
    reenterDelay: 10,      // 結算回城後，等幾秒再進下一場（實際會隨機 ±20%）
    stage: '柏伊亞嵐島',
    diff: [3, 1, 1.55, 1.25, 2],
    dangerR: 220,          // 開始閃避的距離（世界座標）
    bossMult: 3,
    lootChest: true,       // zeny 足夠時去開寶箱
    zenyMin: 50,           // zeny 掉落：單筆金額 ≥ 這個才特地走過去撿（小錢經過時會自動吸）
    mode: 'roam',          // roam 遊走 | idle 原地掛機
    idleKinds: { chest: true, loot: true, magnet: true, meat: false, zeny: false },
    idleRadius: 1200,      // 原地模式：只撿離原點這個距離內的東西
    idleChestRange: 2500,  // 原地模式：寶箱可以走比較遠（錢夠才去）
    idleDodge: false,      // 原地模式：是否仍閃避怪物
    sweep: { on: true, every: 25, minValue: 15, maxSec: 8, radius: 900 }, // 原地模式定時掃一圈撿經驗
    chestPick: 'smart',    // smart（優先序→品質）| first | random
    chestPriority: [],     // 寶箱優先序：比對卡片文字（品質/名稱/部位/數值）
    priority: [],          // ['技能名', ...]（設定檔＝一隻角色，不分職業；v0.7.7 起）
    // 寶箱策略（重抽 / 放逐 / 專注 次數是整場共用的，和升級選技能同一個池）
    chestMinQ: '史詩',      // 最低可接受品質；低於此且沒命中優先序 → 嘗試重抽
    chestUse: { reroll_card: 2, reroll: 1, banish: 2, focus: 2 }, // 每場最多用在寶箱上的次數
    chestBanish: [],       // 出現就放逐（之後不再出現）
    chestFocus: [],        // 出現就專注（之後寶箱優先出現）
    chestAvoidSwap: true,  // 盡量不選會「取代」現有裝備的卡
    chestPerks: true,      // 寶箱使用 重抽 / 放逐 / 專注
    // 神祇（獨立）：每個神祇 want=目標 / ban=不要；目標＝最高優先＋專注＋神祇卡單張重抽直到出現
    deityOn: true,
    deity: {},             // { '堡壘之神': 'want', '折磨之神': 'ban', ... }
    deityExtra: [],        // 清單外的神祇（例：技能神祇）
    deityOrder: [],        // v0.8.8 想要的神祇優先順序（名稱，越前面越優先；沒排到的照原本順序接在後面）
    deitySwapUp: false,    // v0.8.10 已拿到想要的神祇後，出現更優先的也換上去（換了原本的精煉 +N 會歸零 → 預設不換）
    deityUse: { reroll_card: 4, reroll: 0, banish: 2, focus: 1 }, // 每場最多用在神祇
    deityRerollAll: false, // 三張都沒有神祇時也重抽全部
    perks: { deity: { reroll_card: 4, reroll: 0, banish: 2, focus: 1 }, chest: { reroll_card: 2, reroll: 1, banish: 2, focus: 0 }, skill: { reroll_card: 0, reroll: 0, banish: 1, focus: 1 }, huntAll: true },
    gate: { on: false, deity: true, skillOn: false, skillTop: 1, skillLv: 1, skillMaxMin: 5, after: 'idle' }, // 開局巡邏 → 掛機（勾的條件全部達成才切換）；skillMaxMin：技能條件最多等幾分鐘（0＝一直等）
    huntPhase: { on: false, allPerks: true, after: 'idle', leftover: 'skill', onFail: 'farm' }, // 開局獵神 → 掛機；onFail: farm 直接掛機 / leave 離開這場
    huntPoorSec: 60,       // 獵神時開不起寶箱超過 N 秒 → 視為失敗（0=不判斷）
    huntLeaveChests: 0,    // 開了 N 個寶箱還沒拿到目標 → 放棄這場（0=不離開）
    huntLeaveMin: 0,       // 或打了 N 分鐘還沒拿到 → 放棄這場（0=不離開）
    // 升級選技能也用 重抽 / 重抽全部 / 放逐 / 專注
    skillPerks: true,
    skillUse: { reroll_card: 3, reroll: 1, banish: 2, focus: 0 },
    skillOkTop: 0,         // 命中優先序前 N 名才算滿意（0 = 命中任何一個）
    skillBanish: [],
    skillFocus: [],
    fbWait: { min: 20, max: 90 }, // v0.9.10 最終王不符時，在場內照常打隨機 min～max 秒（遊戲時間）再離開
    fbMaxSkip: 10,         // v0.9.10 連續因最終王不符離開 N 次後，下一場照打（0＝不限）
    finalBoss: {},         // v0.9.9 指定最終王：{ 關卡名: [王 id…] }，這場的最終王（MVP／隱藏王）有勾到的才打，沒有就開場離開重進；空＝不管
    skillUpg: [],          // v0.9.7 技能升級項目順序（升級卡強化行的關鍵字，例：目標、冷卻、傷害）
    // 組隊掉落擲骰：off 自己按 / pass 全部放棄 / greed 全部 Greed / need 全部 Need / rule 依規則
    roll: { mode: 'off', needList: [], passList: [], needQ: '傳說', card: 'rule', other: 'greed' },
    tab: 'main',
  };
  // ── 設定檔 ──
  // 儲存格式：roBot.cfg = { ...共用設定, profiles: { 名稱: {...設定檔內容} }, activeProfile }
  // 共用：三個自動開關、自動繼續、結算等待、次數上限、目前分頁；其他（模式、關卡難度、選卡、寶箱、神祇…）都跟著設定檔走
  const GLOBAL_KEYS = ['fight', 'pick', 'loop', 'autoResume', 'reenterDelay', 'maxRuns', 'tab', 'v', 'keepAwake', 'noDiscard', 'autoRestore', 'autoLogin', 'manual'];
  function normalize(c) {
    c.idleKinds = { ...DEFAULT_CFG.idleKinds, ...(c.idleKinds || {}) };
    c.sweep = { ...DEFAULT_CFG.sweep, ...(c.sweep || {}) };
    c.chestUse = { ...DEFAULT_CFG.chestUse, ...(c.chestUse || {}) };
    c.skillUse = { ...DEFAULT_CFG.skillUse, ...(c.skillUse || {}) };
    c.huntPhase = { ...DEFAULT_CFG.huntPhase, ...(c.huntPhase || {}) };
    c.deity ||= {}; c.deityUse = { ...DEFAULT_CFG.deityUse, ...(c.deityUse || {}) };
    c.diff = Array.isArray(c.diff) ? c.diff : [...DEFAULT_CFG.diff];
    c.roll = { ...DEFAULT_CFG.roll, ...(c.roll || {}) };
    if (c.gate?.skills?.length && c.gate.skillOn === undefined) c.gate.skillOn = true; // v0.6.5 自訂技能清單 → 改用技能分頁
    c.gate = { ...DEFAULT_CFG.gate, ...(c.gate || {}) };
    c.perks = { ...clone(DEFAULT_CFG.perks), ...(c.perks || {}) };
    for (const k of ['deity', 'chest', 'skill']) c.perks[k] = { ...DEFAULT_CFG.perks[k], ...(c.perks[k] || {}) };
    c.deityOn = true; c.chestPick = 'smart'; // v0.7 起不再提供這兩個開關
    c.finalBoss = { ...(c.finalBoss || {}) };
    c.fbWait = { ...DEFAULT_CFG.fbWait, ...(c.fbWait || {}) };
    if (c.festRareOnly) { c.finalBoss['燈籠節'] = ['dark_snake_lord']; } delete c.festRareOnly; // v0.9.8 →v0.9.9
    // v0.4.9 的「獵取目標」轉成神祇設定
    if (c.chestHunt?.length) { for (const n of c.chestHunt) { if (DEITY_NAMES.includes(n)) c.deity[n] = 'want'; else (c.deityExtra ||= []).push(n); } c.chestHunt = []; }
    return c;
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  let STORE;
  try { STORE = JSON.parse(localStorage.getItem('roBot.cfg') || '{}'); } catch { STORE = {}; }
  if (!STORE.profiles) {
    // v0.6.0 以前是單一設定 → 整份變成「預設」設定檔
    const old = { ...STORE };
    if (old.pick === undefined) old.pick = !!old.fight; // v0.4.2 以前「戰鬥＋選卡」是同一個開關
    if ((old.v || 1) < 2) { old.chestPick = 'smart'; old.chestPriority = old.chestPriority || []; }
    const prof = {}; for (const [k, v] of Object.entries(old)) if (!GLOBAL_KEYS.includes(k)) prof[k] = v;
    STORE = { profiles: { 預設: prof }, activeProfile: '預設' };
    for (const k of GLOBAL_KEYS) if (old[k] !== undefined) STORE[k] = old[k];
    STORE.v = 3;
  }
  if (!STORE.profiles[STORE.activeProfile]) STORE.activeProfile = Object.keys(STORE.profiles)[0] || '預設';
  STORE.profiles[STORE.activeProfile] ||= {};
  function buildCfg() {
    // v0.6.4 以前的「開局獵神 → 掛機」轉成「開局巡邏」的神祇條件
    for (const pf of Object.values(STORE.profiles)) {
      // v0.7.7：技能設定原本依職業分開存（{ acolyte: [...] }），改成每個設定檔一份（設定檔＝一隻角色）；舊資料取第一份有內容的
      for (const k of ['priority', 'skillBanish', 'skillFocus']) {
        const v = pf[k];
        if (v !== undefined && !Array.isArray(v)) pf[k] = (v && typeof v === 'object') ? (Object.values(v).find((a) => Array.isArray(a) && a.length) || []) : [];
      }
      if (!pf.gate && pf.huntPhase) pf.gate = { on: !!pf.huntPhase.on, deity: true, after: pf.huntPhase.after || 'idle' };
      // v0.9.0：自訂神祇也放進 deity 表（want／ban／none），以前「其他想要的」一律是想要
      for (const n of pf.deityExtra || []) if (n && !(pf.deity ||= {})[n]) pf.deity[n] = 'want';
      // v0.7：三處的「每場最多用幾次」合併成一張表
      if (!pf.perks) {
        const z = { reroll_card: 0, reroll: 0, banish: 0, focus: 0 };
        pf.perks = {
          deity: pf.deityOn === false ? z : { ...(DEFAULT_CFG.deityUse), ...(pf.deityUse || {}) },
          chest: pf.chestPerks === false ? z : { ...(DEFAULT_CFG.chestUse), ...(pf.chestUse || {}) },
          skill: pf.skillPerks === false ? z : { ...(DEFAULT_CFG.skillUse), ...(pf.skillUse || {}) },
          huntAll: pf.huntPhase?.allPerks ?? true,
        };
      }
    }
    const g = {}; for (const k of GLOBAL_KEYS) if (STORE[k] !== undefined) g[k] = STORE[k];
    return normalize({ ...clone(DEFAULT_CFG), ...clone(STORE.profiles[STORE.activeProfile] || {}), ...g });
  }
  let cfg = buildCfg();
  const save = () => {
    const prof = {};
    for (const [k, v] of Object.entries(cfg)) if (!GLOBAL_KEYS.includes(k)) prof[k] = v;
    STORE.profiles[STORE.activeProfile] = prof;
    for (const k of GLOBAL_KEYS) STORE[k] = cfg[k];
    try { localStorage.setItem('roBot.cfg', JSON.stringify(STORE)); } catch {}
  };
  save(); // 寫回（含舊版轉換）
  const profileNames = () => Object.keys(STORE.profiles);
  function switchProfile(name) {
    save();
    if (!STORE.profiles[name]) return;
    STORE.activeProfile = name;
    cfg = buildCfg(); save();
    BOT.anchor = null; // 模式可能不同，原點重設
    log('切換設定檔', name);
    render(true);
  }
  function newProfile(name, from) {
    name = (name || '').trim();
    if (!name || STORE.profiles[name]) return false;
    save();
    STORE.profiles[name] = from ? clone(STORE.profiles[from] || {}) : {};
    switchProfile(name);
    return true;
  }
  function renameProfile(name) {
    name = (name || '').trim();
    const cur = STORE.activeProfile;
    if (!name || STORE.profiles[name]) return false;
    save();
    STORE.profiles[name] = STORE.profiles[cur]; delete STORE.profiles[cur];
    STORE.activeProfile = name; save(); render(true);
    return true;
  }
  function deleteProfile() {
    const cur = STORE.activeProfile;
    if (profileNames().length <= 1) return false;
    delete STORE.profiles[cur];
    STORE.activeProfile = profileNames()[0];
    cfg = buildCfg(); save(); render(true);
    return true;
  }

  // ───────────────────────── 3. Helpers ─────────────────────────
  function log(...a) { console.log('%c[roBot]', 'color:#5b8def', ...a); }
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  // offsetParent is null for position:fixed elements (the game's overlays), so use client rects
  const visible = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const hyp = Math.hypot;
  const rnd = (a, b) => a + Math.random() * (b - a);
  let busyUntil = 0; // human-ish delay between UI actions
  const ready = () => Date.now() >= busyUntil;
  const wait = (ms) => { busyUntil = Date.now() + ms; };
  const clickBtn = (el, ms = rnd(350, 750)) => { if (!el) return false; el.click(); wait(ms); return true; };
  const btnByText = (re, root = document) => $$('button', root).find((b) => visible(b) && re.test(b.innerText.trim()));

  // ───────────────────────── 3.5 開局獵神 → 掛機（兩階段）─────────────────────────
  // hunt：還沒拿到目標神祇 → 強制遊走、撿所有錢、所有重抽只用在神祇
  // farm：拿到後 → 切換成設定的模式（預設原地掛機，原點＝切換當下位置），剩餘次數交給技能（或照原本上限 / 保留）
  const HP_ = () => cfg.huntPhase || {};
  // 開局巡邏 → 掛機（cfg.gate）：條件 = 拿到🎯神祇（或放棄）＋ 學到指定技能（可指定等級），勾的全部達成才切換
  // （v0.7.2 拿掉「任一」：學到技能就提早停止獵神，是兩次死亡的原因）
  const G = () => cfg.gate || {};
  const deityGoal = () => !!G().on && !!G().deity && cfg.deityOn && deityWant().length > 0;
  // 技能條件直接用「技能」分頁的優先序前 N 個（依目前職業），不用另外輸入
  const gateSkills = () => cfg.priority.filter(Boolean).slice(0, Math.max(1, G().skillTop || 1));
  const skillGoal = () => !!G().on && !!G().skillOn && gateSkills().length > 0;
  const huntActive = deityGoal; // 有神祇目標時才「獵神」（全力開寶箱、重抽給神祇、失敗條件）
  // 是否已裝備目標神祇：直接讀遊戲的裝備欄（run.runItems.slots + runItemName 取中文名），不靠 bot 自己記
  function ownsTarget() {
    const r = BOT.run, want = deityWant();
    if (!r?.runItems?.slots || !want.length) return false;
    try { for (const [slot, v] of r.runItems.slots) if (hit(want, r.runItemName(slot, v.item)) >= 0) return true; } catch {}
    return false;
  }
  const huntDone = () => !!BOT.chestUsed?.huntDone || ownsTarget();
  const deityReached = () => huntDone() || !!BOT.rs?.huntFailed;

  // ── 技能條件：技能卡名稱 → 遊戲技能 id（holy_light…），用來查目前等級 ──
  // 名稱括號裡的英文 / 英文名直接轉 id（神聖之光 (Holy Light) → holy_light），其餘從實際選卡學起來（存 roBot.skillMap）
  let SKMAP = {}; try { SKMAP = JSON.parse(localStorage.getItem('roBot.skillMap') || '{}'); } catch {}
  const toId = (en) => en.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  function skillIdOf(name) {
    for (const [k, v] of Object.entries(SKMAP)) if (k.includes(name) || name.includes(k)) return v;
    const en = name.match(/\(([^)]+)\)/)?.[1] || (/^[\x20-\x7e]+$/.test(name) ? name : '');
    return en ? toId(en) : null;
  }
  function skillLv(run, id) {
    try { const v = run.skillLevel?.(id); if (v != null) return v; } catch {}
    return run.weapons?.find((w) => w.id === id)?.rank || 0;
  }
  function skillSnap(run) {
    const ids = new Set([...(run.weapons || []).map((w) => w.id), ...(run.slots || [])]);
    try { for (const k of run.passiveRank?.keys?.() || []) ids.add(k); } catch {}
    return Object.fromEntries([...ids].map((id) => [id, skillLv(run, id)]));
  }
  function learnSkill(run) { // 選完技能卡後比對前後等級，學會「卡片名稱 → id」
    const p = BOT.pendingSkill; if (!p) return;
    if (Date.now() - p.at > 8000) { BOT.pendingSkill = null; return; }
    const now = skillSnap(run);
    const changed = Object.keys(now).filter((id) => (now[id] || 0) > (p.snap[id] || 0));
    if (!changed.length) return;
    if (changed.length === 1 && p.name) { const key = p.name.replace(/\s*\(.*\)\s*/, '').replace(/\s+/g, ' ').trim(); if (SKMAP[key] !== changed[0]) { SKMAP[key] = changed[0]; try { localStorage.setItem('roBot.skillMap', JSON.stringify(SKMAP)); } catch {} } }
    BOT.pendingSkill = null;
  }
  function skillsReached() {
    const run = BOT.run; if (!run) return false;
    const conds = gateSkills().map((name) => ({ name: name.trim(), lv: Math.max(1, G().skillLv || 1) }));
    const ok = conds.map((c) => { const id = skillIdOf(c.name); return !!id && skillLv(run, id) >= c.lv; });
    return ok.every(Boolean);
  }
  // v0.9.1 技能條件逾時：整場都沒出現該技能（隨機）時，以前會一直巡邏到打王 → 第 N 分鐘就當作達成，切換掛機
  function skillTimedOut() {
    const m = +G().skillMaxMin || 0, t = BOT.run?.time || 0;
    if (!m || t < m * 60) return false;
    if (!BOT.rs.skillTimeout) { BOT.rs.skillTimeout = Math.round(t); log(`技能條件 ${m} 分鐘還沒達成 → 直接掛機`); }
    return true;
  }
  function gateDone() {
    const goals = [];
    if (deityGoal()) goals.push(deityReached());
    if (skillGoal()) goals.push(skillsReached() || skillTimedOut());
    if (!goals.length) return true;
    return goals.every(Boolean);
  }
  const phase = () => (G().on && (deityGoal() || skillGoal()) ? (gateDone() ? 'farm' : 'hunt') : 'normal');
  const huntingDeity = () => phase() === 'hunt' && deityGoal() && !deityReached();
  const ALL = { reroll_card: 99, reroll: 99, banish: 99, focus: 99 };
  // 重抽次數：「重抽」分頁一張表（cfg.perks.deity/chest/skill），獵神中且勾「全部先給神祇」時神祇無上限、其他不用
  function limitFor(kind) { // kind: deity | chest | skill
    if (cfg.perks.huntAll && huntingDeity()) return kind === 'deity' ? ALL : {};
    return cfg.perks[kind] || {};
  }
  function effMode() {
    const ph = phase();
    if (ph === 'hunt') return 'roam';
    if (ph === 'farm' && G().after !== 'keep') return G().after || 'idle';
    return cfg.mode;
  }
  const effZenyMin = () => (huntingDeity() ? 0 : cfg.zenyMin);

  // ───────────────────────── 4. Combat steering ─────────────────────────
  // Map grid is 32 units/cell. Movement = pick the best of 16 directions, scored by
  // (a) how well it matches the desired vector (loot/path attraction + enemy repulsion),
  // (b) how much open space lies ahead (ray cast on the walk mask), (c) consistency with last dir.
  const DIRS = Array.from({ length: 16 }, (_, k) => [Math.cos((k * Math.PI) / 8), Math.sin((k * Math.PI) / 8)]);
  const steer = { target: null, targetAt: 0, path: null, pathKey: '', pathAt: 0, prev: [0, 0], chk: null, escapeUntil: 0, escapeDir: null };

  function setMove(run, x, y) {
    const m = run.touchMove; // shared object read by the input code; mutate, don't replace
    if (!m) return;
    m.x = x; m.y = y;
  }

  function walkable(run, x, y) {
    try { return !run.walk || run.walk.walkable(x, y); } catch { return true; }
  }

  // free distance along a direction, using 3 parallel rays (player has a body width)
  function clearance(run, P, dx, dy, max = 256) {
    const px = -dy * 12, py = dx * 12;
    for (let d = 16; d <= max; d += 16) {
      const x = P.x + dx * d, y = P.y + dy * d;
      if (!walkable(run, x, y) || !walkable(run, x + px, y + py) || !walkable(run, x - px, y - py)) return d - 16;
    }
    return max;
  }

  // direction to target, following the game's own path-finder around walls (cached)
  function towards(run, P, T) {
    let wx = T.x, wy = T.y;
    const W = run.walk;
    if (W) {
      try {
        const key = `${Math.round(T.x / 64)},${Math.round(T.y / 64)}`;
        const now = Date.now();
        if (!W.lineClear(P.x, P.y, T.x, T.y)) {
          if (!steer.path || steer.pathKey !== key || now - steer.pathAt > 700) {
            steer.path = W.pathTo(P.x, P.y, T.x, T.y); steer.pathKey = key; steer.pathAt = now;
          }
          const path = steer.path;
          while (path && path.length > 1 && hyp(path[0].x - P.x, path[0].y - P.y) < 24) path.shift();
          if (path && path.length) {
            // skip ahead to the furthest waypoint we can see directly
            let wp = path[0];
            for (let i = Math.min(path.length - 1, 4); i > 0; i--) if (W.lineClear(P.x, P.y, path[i].x, path[i].y)) { wp = path[i]; break; }
            wx = wp.x; wy = wp.y;
          } else if (T.wander) steer.target = null; // unreachable → new wander point
        } else steer.path = null;
      } catch {}
    }
    const d = hyp(wx - P.x, wy - P.y) || 1;
    return [(wx - P.x) / d, (wy - P.y) / d];
  }

  // 探索式遊走：記錄走過的格子（400×400），新目標優先選「很久沒去過、離怪群遠」的地方，
  // 避免在同一塊區域來回繞圈。
  const VISIT = new Map();
  const vkey = (x, y) => `${Math.floor(x / 400)},${Math.floor(y / 400)}`;
  function markVisited(P) { VISIT.set(vkey(P.x, P.y), Date.now()); }
  // v0.8.9 獵神（開局）時：短程（300～800）、找「離怪群約 350」的位置繞，邊走邊打；
  // 以前一律 600～1600 而且偏好遠離怪群 → 開局 72% 時間在長途閒晃，60 秒只殺 50 多隻（原地掛機 5 秒就殺 140 隻）
  function newWanderTarget(run, P) {
    const b = run.bounds || { x0: P.x - 1600, x1: P.x + 1600, y0: P.y - 1600, y1: P.y + 1600 };
    const near = huntingDeity();
    let cx = 0, cy = 0, n = 0;
    for (const e of run.enemies || []) if (!e.dead && hyp(e.x - P.x, e.y - P.y) < (near ? 900 : 600)) { cx += e.x; cy += e.y; n++; }
    const now = Date.now();
    let best = null, bs = -Infinity;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, r = near ? rnd(300, 800) : rnd(600, 1600);
      let x = Math.min(b.x1, Math.max(b.x0, P.x + Math.cos(a) * r)), y = Math.min(b.y1, Math.max(b.y0, P.y + Math.sin(a) * r));
      try {
        if (run.walk) {
          [x, y] = run.walk.nearestWalkable(x, y);
          if (!run.walk.pathTo(P.x, P.y, x, y)) continue;
        }
      } catch {}
      const seen = VISIT.get(vkey(x, y));
      const fresh = seen ? Math.min(60, (now - seen) / 1000) / 60 : 1.2; // 沒去過最好，60 秒以上沒去過也算新
      const away = n ? Math.min(1, hyp(x - cx / n, y - cy / n) / 1200) : 0.5;
      const close = n ? 1 - Math.min(1, Math.abs(hyp(x - cx / n, y - cy / n) - 350) / 700) : 0.5;
      const sc = (near ? fresh + close * 2 : fresh * 2 + away) + Math.random() * 0.2;
      if (sc > bs) { bs = sc; best = { x, y, wander: true }; }
    }
    steer.target = best || { x: P.x, y: P.y, wander: true };
    steer.targetAt = now;
    steer.path = null;
  }

  // 獵神期間：寶箱主要來自精英怪（必掉寶箱＋zeny），沒有寶箱可開時去找最近的精英怪，保持一點距離讓技能打
  function eliteTarget(run, P) {
    let best = null, bd = 1400;
    for (const e of run.enemies || []) {
      if (e.dead || !e.elite || e.def?.boss) continue;
      const d = hyp(e.x - P.x, e.y - P.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return null;
    const k = Math.min(1, 170 / (bd || 1)); // 站在離精英怪約 170 的位置
    return { x: best.x + (P.x - best.x) * k, y: best.y + (P.y - best.y) * k, elite: best };
  }

  // 掉落物價值（經驗寶石 gem_blue / gem_yellow 也是地上的 pickup）
  const VALUE = { magnet: 14, loot: 10, card: 10, egg: 10, chest: 25, gem_yellow: 3, gem_blue: 1, zeny: 1.2, meat: 0.5 };
  // 危險度：所有怪物在 (x,y) 的威脅加總（boss / 精英加權）
  let EN = [];
  function cacheEnemies(run, use) {
    EN = [];
    if (!use) return;
    for (const e of run.enemies || []) {
      if (e.dead) continue;
      const boss = e.def?.boss;
      const hunting = e.elite && !boss && huntingDeity(); // 獵神時精英怪是寶箱來源，不要特別怕它
      EN.push({ x: e.x, y: e.y, R: cfg.dangerR * (boss ? 1.6 : e.elite && !hunting ? 1.25 : 1), w: boss ? cfg.bossMult : e.elite && !hunting ? 1.5 : 1 });
    }
  }
  function dangerAt(x, y) {
    let d = 0;
    for (const e of EN) {
      const dist = hyp(x - e.x, y - e.y);
      if (dist < e.R) d += ((e.R - dist) / e.R) ** 2 * e.w;
    }
    return d;
  }

  // 遊走模式選目標：價值 + 群聚 − 目標附近危險 − 距離，並對目前目標加分（避免來回換目標抖動）
  function pickTarget(run, P) {
    const now = Date.now();
    const cur = steer.target;
    if (cur?.obj && !cur.obj.dead && !cur.obj.magnet && now - steer.targetAt < 300) return cur;
    let canChest = false;
    try { canChest = (cfg.lootChest || huntingDeity()) && run.zeny >= run.chestCost(); } catch {}
    const hunt = huntingDeity();
    const lowHp = run.hp != null && run.stats?.maxHp && run.hp / run.stats.maxHp < 0.6;
    const cand = [];
    for (const o of run.pickups || []) {
      if (o.dead || o.magnet) continue; // magnet = 已經在飛向角色
      if (o.kind === 'mystery') continue; // 紫色 ?：伺服器掉落，不用撿，時間到自己算拿到
      if (o.kind === 'chest' && !canChest) continue;
      if (o.kind === 'zeny' && (o.value ?? 0) < effZenyMin()) continue;
      if (hyp(o.x - P.x, o.y - P.y) > 900) continue;
      cand.push(o);
    }
    let best = null, bs = 0.5;
    for (const o of cand) {
      let v = o.kind === 'meat' && lowHp ? 8 : VALUE[o.kind] ?? 1;
      if (o.kind === 'zeny' && hunt) v = 1 + (o.value || 0) / 8; // 獵神期間錢＝開寶箱，依金額加權
      const gem = hunt && o.kind?.startsWith('gem');
      if (gem) v *= 2; // v0.8.9 開局升級＝技能／火力，經驗比平常值錢
      if (v <= 3) { // 小東西看群聚：附近越多越值得
        let n = 0;
        for (const q of cand) if (q !== o && Math.abs(q.x - o.x) < 140 && Math.abs(q.y - o.y) < 140 && ++n >= 12) break;
        v += 0.4 * n;
      }
      const ty = o.y + (o.kind === 'chest' ? 20 : 0);
      // 寶箱只能「走到上面」才會開（判定點在角色腳下往上 20），所以危險度扣分較少，盡量去開
      const sc = v - (o.kind === 'chest' ? 1.5 : 4) * dangerAt(o.x, ty) - hyp(o.x - P.x, ty - P.y) / (gem ? 400 : 150) + (cur?.obj === o ? 2 : 0);
      if (sc > bs) { bs = sc; best = { x: o.x, y: ty, obj: o }; }
    }
    if (best) {
      if (best.obj !== cur?.obj) steer.path = null;
      steer.target = best; steer.targetAt = now;
      return best;
    }
    if (hunt) { const el = eliteTarget(run, P); if (el) { steer.target = el; steer.targetAt = now; return el; } }
    if (!cur || !cur.wander || now - steer.targetAt > 12000 || hyp(cur.x - P.x, cur.y - P.y) < 64) newWanderTarget(run, P);
    return steer.target;
  }

  // 原地掛機：只去撿勾選的東西（寶箱 / 裝備卡片蛋 / 磁鐵 …），撿完回原點
  const KIND_GROUP = { chest: 'chest', loot: 'loot', card: 'loot', egg: 'loot', magnet: 'magnet', meat: 'meat', zeny: 'zeny' };
  function idleTarget(run, P) {
    const A = BOT.anchor;
    // 掃圈逾時要在這裡就判斷：途中如果一直在追寶箱/裝備，sweepTarget 不會被呼叫，掃圈狀態會卡住（v0.5.5 修正）
    if (BOT.sweep && Date.now() - BOT.sweep.start > cfg.sweep.maxSec * 1000) { BOT.sweep = null; BOT.sweepEnd = Date.now(); log('掃圈逾時，回原點'); }
    let canChest = false;
    try { canChest = run.zeny >= run.chestCost(); } catch {}
    let best = null, bd = Infinity;
    for (const o of run.pickups || []) {
      if (o.dead || o.magnet) continue; // already flying to us
      const g = KIND_GROUP[o.kind];
      if (!g || !cfg.idleKinds[g] || (g === 'chest' && !canChest)) continue;
      if (g === 'zeny' && (o.value ?? 0) < cfg.zenyMin) continue;
      // 寶箱用較大的範圍（有錢就值得走遠一點去開），其他東西用撿取範圍
      if (hyp(o.x - A.x, o.y - A.y) > (g === 'chest' ? cfg.idleChestRange : cfg.idleRadius)) continue;
      const d = hyp(o.x - P.x, o.y - P.y) * (g === 'magnet' ? 0.5 : g === 'chest' ? 0.4 : 1);
      if (d < bd) { bd = d; best = o; }
    }
    if (best) return { x: best.x, y: best.y + (best.kind === 'chest' ? 20 : 0), obj: best, trip: true };
    const sw = sweepTarget(run, P, A);
    if (sw) return sw;
    return { x: A.x, y: A.y, home: true };
  }

  // ── 原地模式：定時「掃一圈」撿經驗 ──
  // 每隔 N 秒，把原點附近的經驗寶石 / zeny 按 200×200 格子加總，挑「資源多、怪少、近」的一格過去撿，撿完或逾時就回原點。
  const GEM_V = { gem_blue: 1, gem_green: 2, gem_yellow: 3, gem_red: 8 };
  const resValue = (o) => (o.kind?.startsWith('gem') ? GEM_V[o.kind] ?? 2 : o.kind === 'zeny' ? (o.value || 0) / 20 : 0);
  function findCluster(run, P, A) {
    cacheEnemies(run, true);
    const cells = new Map();
    for (const o of run.pickups || []) {
      if (o.dead || o.magnet) continue;
      const v = resValue(o);
      if (!v || hyp(o.x - A.x, o.y - A.y) > cfg.sweep.radius) continue;
      const k = `${Math.floor(o.x / 200)},${Math.floor(o.y / 200)}`;
      const c = cells.get(k) || { v: 0, sx: 0, sy: 0 };
      c.v += v; c.sx += o.x * v; c.sy += o.y * v; cells.set(k, c);
    }
    let best = null, bs = -Infinity;
    for (const c of cells.values()) {
      const x = c.sx / c.v, y = c.sy / c.v;
      const sc = c.v - 6 * dangerAt(x, y) - hyp(x - P.x, y - P.y) / 150;
      if (sc > bs) { bs = sc; best = { x, y, v: c.v }; }
    }
    return best;
  }
  function clusterLeft(run, S) {
    let v = 0, near = null, nd = Infinity;
    for (const o of run.pickups || []) {
      if (o.dead || o.magnet || hyp(o.x - S.x, o.y - S.y) > 260) continue;
      const val = resValue(o); if (!val) continue;
      v += val;
      const d = hyp(o.x - BOT.run.player.x, o.y - BOT.run.player.y);
      if (d < nd) { nd = d; near = o; }
    }
    return { v, near };
  }
  function sweepTarget(run, P, A) {
    const sw = cfg.sweep;
    if (!sw?.on) return null;
    const now = Date.now();
    if (!BOT.sweep && now - (BOT.sweepEnd || 0) > sw.every * 1000) {
      const c = findCluster(run, P, A);
      BOT.sweepEnd = now; // 沒找到也等下一輪
      if (c && c.v >= sw.minValue) { BOT.sweep = { ...c, v0: c.v, start: now }; log('掃一圈 →', Math.round(c.x), Math.round(c.y), '資源', Math.round(c.v)); }
    }
    if (!BOT.sweep) return null;
    const S = BOT.sweep, left = clusterLeft(run, S);
    if (!left.near || left.v < S.v0 * 0.15 || now - S.start > sw.maxSec * 1000) {
      log('掃完，回原點', `剩 ${Math.round(left.v)}/${Math.round(S.v0)}`);
      BOT.sweep = null; BOT.sweepEnd = now;
      return null;
    }
    return { x: left.near.x, y: left.near.y, sweep: true };
  }

  // 拿到神祇切換掛機時，原點不直接用當下位置（常在怪群中間），改找附近較安全、較空曠的點
  function safeAnchor(run, P) {
    cacheEnemies(run, true);
    let best = { x: P.x, y: P.y }, bs = -dangerAt(P.x, P.y) * 3;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, rr = 250 + (k % 3) * 175;
      let x = P.x + Math.cos(a) * rr, y = P.y + Math.sin(a) * rr;
      try { if (run.walk) { [x, y] = run.walk.nearestWalkable(x, y); if (!run.walk.pathTo(P.x, P.y, x, y)) continue; } } catch {}
      let open = 0; for (const [dx, dy] of DIRS) open += clearance(run, { x, y }, dx, dy, 192);
      const sc = -dangerAt(x, y) * 3 + open / (192 * 16) - hyp(x - P.x, y - P.y) / 1500;
      if (sc > bs) { bs = sc; best = { x, y }; }
    }
    log('掛機原點', Math.round(best.x), Math.round(best.y));
    return best;
  }

  function combatTick(run) {
    const P = run.player;
    if (!P || P.dead) return setMove(run, 0, 0);
    const now = Date.now();
    markVisited(P);
    BOT.steer = steer; // debug
    const idle = effMode() === 'idle';
    if (idle && !BOT.anchor) BOT.anchor = BOT.safeAnchorNext ? safeAnchor(run, P) : { x: P.x, y: P.y };
    BOT.safeAnchorNext = false;

    const T0 = idle ? idleTarget(run, P) : null;          // 先決定原地目標（可能開始掃一圈）
    cacheEnemies(run, !(idle && !cfg.idleDodge) || !!BOT.sweep || !!T0?.trip); // 掃圈、去開寶箱/撿東西的途中一定閃怪
    const threat = dangerAt(P.x, P.y);

    const T = idle ? T0 : pickTarget(run, P);
    if (idle && T.home && threat < 0.05 && hyp(T.x - P.x, T.y - P.y) < 20) { steer.chk = null; setMove(run, 0, 0); BOT.dbg = { threat: '0', enemies: (run.enemies || []).filter((e) => !e.dead).length }; return; }
    const [ax, ay] = towards(run, P, T);

    // 16 方向打分：往該方向走一步（最多 140，撞牆就停在牆前）後的「危險度」越低越好，
    // 再加上朝目標、前方空曠、和上一步方向一致。被怪包圍時會繞過怪群，而不是直線退到牆邊被夾住。
    const nearChest = T?.obj?.kind === 'chest' && hyp(T.x - P.x, T.y - P.y) < 250;
    const goingChest = T?.obj?.kind === 'chest';
    const attractW = nearChest ? 1.6 : goingChest ? (threat > 2 ? 0.8 : 1.2) : threat > 2 ? 0.35 : 1; // 寶箱：就在旁邊衝過去，遠的也不輕易放棄
    const openW = threat > 0.8 ? 0.6 : 0.3;
    let bx = ax, by = ay, best = -Infinity;
    for (const [cx, cy] of [[ax, ay], ...DIRS]) {
      const c = clearance(run, P, cx, cy);
      const step = Math.min(c, 140);
      let sc = attractW * (cx * ax + cy * ay) - 1.2 * dangerAt(P.x + cx * step, P.y + cy * step)
        + openW * (c / 256) + 0.15 * (cx * steer.prev[0] + cy * steer.prev[1]);
      if (c < 40) sc -= 3;          // wall right ahead
      else if (c < 96) sc -= 0.4;   // close to a wall / corner
      if (sc > best) { best = sc; bx = cx; by = cy; }
    }

    // stuck detection: wanted to move but barely moved → escape toward the most open direction
    if (!steer.chk || now - steer.chk.t > 800) {
      if (steer.chk && hyp(P.x - steer.chk.x, P.y - steer.chk.y) < 20) {
        let ob = -1;
        for (const [cx, cy] of DIRS) { const c = clearance(run, P, cx, cy, 320) + Math.random() * 20; if (c > ob) { ob = c; steer.escapeDir = [cx, cy]; } }
        steer.escapeUntil = now + 700;
        if (T?.wander) steer.target = null;
        steer.path = null;
        BOT.stuck = (BOT.stuck || 0) + 1;
      }
      steer.chk = { x: P.x, y: P.y, t: now };
    }
    if (now < steer.escapeUntil && steer.escapeDir) [bx, by] = steer.escapeDir;

    steer.prev = [bx, by];
    setMove(run, bx, by);
    BOT.dbg = { threat: threat.toFixed(2), enemies: (run.enemies || []).filter((e) => !e.dead).length };
  }

  // ───────────────────────── 5. Card picks (skills / chest) ─────────────────────────

  // ── 寶箱策略 ──
  // 卡片文字：品質｜(新！)｜名稱 (+精煉)｜部位｜數值｜(取代 X)｜(★ 專注)
  // 每張卡下方動作鈕 .pk-act[data-act="卡片序:動作序"]：重抽 / 專注 / 放逐；#pk-bar：重抽全部
  const lines = (a) => (a || []).filter(Boolean);
  const hit = (list, t) => lines(list).findIndex((x) => t.includes(x));
  // 卡片自己的文字（不含「⇄ 取代 X」與「★ 專注」標記）。
  // 舊版用整張卡的文字比對 → 「取代 堡壘之神」也含「堡壘之神」，反而把想要的裝備換掉（v0.4.6 修正）
  function cardText(card) {
    const c = card.cloneNode(true);
    c.querySelectorAll('.pk-swap,.pk-mark,.pk-key').forEach((e) => e.remove());
    const parts = [...c.querySelectorAll('.pk-badge,.pk-ribbon,.pk-name,.pk-sub,.pk-lines li')].map((e) => e.textContent.trim());
    return (parts.length ? parts.join(' ') : c.textContent).replace(/\s+/g, ' ').trim();
  }
  const swapText = (card) => card.querySelector('.pk-swap')?.textContent.replace(/\s+/g, ' ').trim() || '';
  const chestPri = () => [...(cfg.deityOn ? deityWant() : []), ...lines(cfg.chestPriority)]; // 目標神祇 = 最高優先
  // v0.9.5 dn＝神祇卡的名稱（不是神祇卡就是 null）：神祇名稱只比對神祇卡名稱。
  // 以前比對整張卡（含說明行）→ 🎯 神祇「神聖之光」會命中說明寫著「神聖之光…」的普通寶箱卡，被當成目標選走並停止獵神
  function chestScore(t, sw, dn = null) {
    const W = cfg.deityOn ? deityWant() : [], di = dn == null ? -1 : hit(W, dn), ci = hit(cfg.chestPriority, t);
    const p = di >= 0 ? di : ci >= 0 ? W.length + ci : -1, q = QUALITY.findIndex((x) => t.includes(x));
    let sc = (p >= 0 ? (100 - p) * 100 : 0) + (q >= 0 ? (10 - q) * 10 : 0);
    if (/\+\d/.test(t) && !t.includes('新！')) sc += 15;          // 精煉已有裝備
    if (sw) {
      const ps = hit(chestPri(), sw);                               // 會被換掉的那件
      const ownD = cfg.deityOn && hit(deityWant(), sw) >= 0;        // 會被換掉的是已拿到的目標神祇
      if (ownD && !cfg.deitySwapUp) sc -= 100000;                  // v0.8.10 預設不換：換了精煉 +N 會歸零
      else if (ps >= 0 && (p < 0 || ps <= p)) sc -= 100000;        // 絕不拿優先序較低的東西換掉想要的裝備
      else if (cfg.chestAvoidSwap && p < 0) sc -= 25;              // 一般取代：小扣分
    }
    return { sc, p, q };
  }
  function actBtn(i, label) {
    return $$(`#pk-cards .pk-act[data-act^="${i}:"]`).find((b) => !b.disabled && b.innerText.trim().startsWith(label) && !b.innerText.includes('全部'));
  }
  // 通用：放逐 → 專注 → (不滿意) 單張重抽 → 重抽全部 → 選最高分
  // o = { tag, used, limit, banish[], focus[], score(t) → {sc, ok} }
  function perkTick(run, cards, o) {
    const perks = run.perksLeft || {};
    const used = o.used;
    const can = (k) => (perks[k] || 0) > 0 && (used[k] || 0) < (o.limit[k] || 0);
    const use = (k, el, why) => { used[k] = (used[k] || 0) + 1; log(o.tag, why); clickBtn(el, rnd(500, 900)); return true; };
    const texts = cards.map(o.textOf || cardText);
    const swaps = cards.map(swapText);
    const marked = cards.map((c) => !!c.querySelector('.pk-mark'));
    const short = (t) => t.slice(0, 40);

    // 1) 放逐名單：整場不再出現，該格立刻換新卡
    for (let i = 0; i < texts.length; i++) {
      const b = hit(o.banish, texts[i]) >= 0 && can('banish') && actBtn(i, '放逐');
      if (b) return use('banish', b, `放逐 ${short(texts[i])}`);
    }
    // 2) 專注名單：不改變目前卡片，之後更常出現
    for (let i = 0; i < texts.length; i++) {
      if (marked[i] || used.focused?.has(texts[i])) continue;
      const b = hit(o.focus, texts[i]) >= 0 && can('focus') && actBtn(i, '專注');
      if (b) { (used.focused ||= new Set()).add(texts[i]); return use('focus', b, `專注 ${short(texts[i])}`); }
    }
    // 2.5) 自訂步驟（寶箱：獵目標神祇）
    if (o.pre) { const r = o.pre({ cards, texts, swaps, can, use, short }); if (r) return r; }
    // 3) 評分；不滿意就重抽（先單張、再全部）
    const scored = texts.map((t, i) => ({ i, t, ...o.score(t, swaps[i], i) }));
    const best = scored.reduce((x, y) => (y.sc > x.sc ? y : x));
    if (!best.ok) {
      if (can('reroll_card')) {
        for (const c of [...scored].sort((x, y) => x.sc - y.sc)) {
          const b = actBtn(c.i, '重抽'); // 新技能沒有單張重抽鈕，會自動略過
          if (b) return use('reroll_card', b, `重抽卡片 #${c.i + 1} ${short(c.t)}`);
        }
      }
      const all = can('reroll') && $$('#pk-bar .pk-act').find((b) => !b.disabled && b.innerText.includes('重抽全部'));
      if (all) return use('reroll', all, '重抽全部');
    }
    log(o.tag, 'pick', texts.map((t, i) => short(t) + (swaps[i] ? ` [${swaps[i]}]` : '')).join(' ／ '), '→', best.i + 1, best.sc);
    if (o.onPick) o.onPick(best);
    BOT.lastPicked = { el: cards[best.i], at: Date.now() };
    clickBtn(cards[best.i], rnd(1300, 1700));
    return true;
  }

  // ── 神祇（獨立設定）──
  const DEITIES = DEITY_NAMES;
  // v0.8.8 照「優先順序」排：越前面越優先（寶箱評分、取代保護都看這個順序 → 拿到後面的，之後出現前面的會換上去）
  const deityWant = () => {
    const a = [...new Set([...DEITIES, ...lines(cfg.deityExtra)])].filter((d) => cfg.deity[d] === 'want'), o = cfg.deityOrder || [];
    const rank = (d) => { const i = o.indexOf(d); return i < 0 ? o.length + a.indexOf(d) : i; };
    return a.sort((x, y) => rank(x) - rank(y));
  };
  const deityBan = () => [...new Set([...DEITIES, ...lines(cfg.deityExtra)])].filter((d) => cfg.deity[d] === 'ban');
  const isDeityCard = (card) => (card.querySelector('.pk-sub')?.textContent || '').includes('神祇');

  function chestTick(run, cards) {
    const minQ = QUALITY.indexOf(cfg.chestMinQ);
    const used = BOT.chestUsed;
    const want = deityWant(), ban = deityBan();
    // 神祇用自己的次數上限（和一般寶箱分開算，但都從同一個遊戲次數池扣）
    const perks = run.perksLeft || {};
    const dUsed = (BOT.deityUsed ||= {});
    const dLim = limitFor('deity');
    const canD = (k) => cfg.deityOn && (perks[k] || 0) > 0 && (dUsed[k] || 0) < (dLim[k] || 0);
    const useD = (k, el, why) => { dUsed[k] = (dUsed[k] || 0) + 1; log('deity', why); clickBtn(el, rnd(500, 900)); return true; };
    const dn = cards.map((c) => (isDeityCard(c) ? c.querySelector('.pk-name')?.textContent.replace(/\s+/g, ' ').trim() || '' : null));
    const isWant = (i) => dn[i] != null && hit(want, dn[i]) >= 0;
    return perkTick(run, cards, {
      tag: 'chest', used, limit: limitFor('chest'), banish: cfg.chestBanish, focus: cfg.chestFocus,
      pre: ({ cards, texts, swaps, short }) => {
        if (!cfg.deityOn) return null;
        if (want.length && swaps.some((sw) => hit(want, sw) >= 0)) used.huntDone = true; // 卡片顯示「取代 目標」＝已裝備目標
        for (let i = 0; i < cards.length; i++) {
          if (!isDeityCard(cards[i])) continue;
          // 不要的神祇 → 放逐
          if (hit(ban, dn[i]) >= 0 && canD('banish')) { const b = actBtn(i, '放逐'); if (b) return useD('banish', b, `放逐 ${short(texts[i])}`); }
          // 目標神祇 → 專注（之後更常出現）
          if (isWant(i) && !cards[i].querySelector('.pk-mark') && !dUsed.focused?.has(texts[i]) && canD('focus')) {
            const b = actBtn(i, '專注');
            if (b) { (dUsed.focused ||= new Set()).add(texts[i]); return useD('focus', b, `專注 ${short(texts[i])}`); }
          }
        }
        if (!want.length || huntDone()) return null;
        if (cards.some((_, i) => isWant(i))) return null; // 目標出現 → 交給評分（目標＝最高優先）
        // 還沒拿到目標：神祇卡用「單張重抽」一直換（單張重抽在同部位重抽，所以還是神祇）
        if (canD('reroll_card')) {
          for (let i = 0; i < cards.length; i++) {
            const b = isDeityCard(cards[i]) && actBtn(i, '重抽');
            if (b) return useD('reroll_card', b, `獵目標：重抽神祇 #${i + 1} ${short(texts[i])}`);
          }
        }
        if ((cfg.deityRerollAll || (huntingDeity() && HP_().allPerks)) && !cards.some(isDeityCard) && canD('reroll')) {
          const all = $$('#pk-bar .pk-act').find((b) => !b.disabled && b.innerText.includes('重抽全部'));
          if (all) return useD('reroll', all, '獵目標：重抽全部（沒有出現神祇）');
        }
        return null;
      },
      onPick: (best) => { if (want.length && isWant(best.i)) { used.huntDone = true; log('deity', '拿到目標', best.t); } },
      score: (t, sw, i) => {
        const r = chestScore(t, sw, dn[i]);
        // 不要的神祇：沒放逐掉也不要選（除非三張都更糟）
        const bad = cfg.deityOn && dn[i] != null && hit(ban, dn[i]) >= 0 ? 5000 : 0;
        return { sc: r.sc - bad, ok: r.sc - bad > 0 && (r.p >= 0 || (r.q >= 0 && r.q <= minQ)) };
      },
    });
  }

  // v0.9.11 強化項目每個技能不一樣（+1 目標、+3 脈衝、+9 冷卻縮減…）→ 自由輸入、包含就算（模糊）；
  // 多個條目都命中時取最長的（「攻擊範圍」比「範圍」具體），排名用那個條目的位置
  const UPG_HINT = ['目標', '冷卻', '傷害', '數量', '範圍', '攻擊範圍', '貫穿機率', '速度', '持續時間', '效果'];
  const upgRank = (U, up) => { let best = -1; U.forEach((x, i) => { if (up.includes(x) && (best < 0 || x.length > U[best].length)) best = i; }); return best; };
  const UPG_SEEN = 'roBot.upgSeen';
  function learnUpg(up) { // 看過的強化文字（去掉數字、+、%）→ 面板輸入建議
    const k = up.replace(/[+\-−]?\d+(\.\d+)?%?/g, '').replace(/\s+/g, ' ').trim(); if (!k || k.length > 20) return;
    try { const a = JSON.parse(localStorage.getItem(UPG_SEEN) || '[]'); if (!a.includes(k)) { a.push(k); localStorage.setItem(UPG_SEEN, JSON.stringify(a.slice(-60))); } } catch {}
  }
  function skillTick(run, cards) {
    // 順便學技能名稱 → id：卡片名稱有括號英文（神聖之光 (Holy Light)）就直接轉成 holy_light
    let learned = false;
    for (const c of cards) {
      const nm = c.querySelector('.pk-name')?.textContent.trim() || '';
      const en = nm.match(/\(([^)]+)\)/)?.[1];
      const key = nm.replace(/\s*\(.*\)\s*/, '').trim();
      if (en && key && !SKMAP[key]) { SKMAP[key] = toId(en); learned = true; }
    }
    if (learned) try { localStorage.setItem('roBot.skillMap', JSON.stringify(SKMAP)); } catch {}
    const pri = cfg.priority;
    // v0.9.6 獵神勾「全部先給神祇」時技能沒有次數 → 三張都在放逐名單只能硬選一張被禁的。
    // 這種時候照「重抽」表給技能的次數放逐掉（其他情況仍留給神祇）
    const nameOf = (c) => c.querySelector('.pk-name')?.textContent.replace(/\s+/g, ' ').trim() || '';
    let limit = limitFor('skill');
    if (cfg.skillBanish?.length && cards.every((c) => hit(cfg.skillBanish, nameOf(c)) >= 0)) limit = { ...limit, banish: Math.max(limit.banish || 0, cfg.perks.skill?.banish || 0) };
    return perkTick(run, cards, {
      tag: 'skill', used: BOT.skillUsed, limit,
      // 技能只比對「技能名稱」：說明文字常提到別的技能（例如緩速術的說明寫著「神聖之光…傷害 +30%」），
      // 用整張卡比對會誤判成命中神聖之光（v0.4.8 修正）
      textOf: (c) => [c.querySelector('.pk-name')?.textContent, c.querySelector('.pk-ribbon')?.textContent,
        // v0.9.7 升級卡（小字 Lv N）的強化項目（+1 目標、+9 冷卻縮減…）放在 ⟨⟩ 裡給「升級項目順序」用；新技能的說明文字不加（會提到別的技能）
        /^Lv\s*\d/.test(c.querySelector('.pk-sub')?.textContent.trim() || '') ? '⟨' + [...c.querySelectorAll('.pk-lines li')].map((e) => e.textContent.trim()).join(' ') + '⟩' : '']
        .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || cardText(c),
      banish: cfg.skillBanish, focus: cfg.skillFocus,
      onPick: (best) => { BOT.pendingSkill = { name: cards[best.i]?.querySelector('.pk-name')?.textContent.trim() || best.t, snap: skillSnap(run), at: Date.now() }; },
      score: (t) => {
        const name = t.replace(/⟨.*⟩/, ''), up = t.match(/⟨(.*)⟩/)?.[1];
        const p = hit(pri, name);
        // 滿意 = 命中優先序前 N 名（N=0 表示命中任何一個都算）
        const ok = p >= 0 && (!cfg.skillOkTop || p < cfg.skillOkTop);
        // 放逐名單裡的技能：放逐次數用完（或沒開重抽/放逐）時也絕不選，除非三張都是（v0.6.6 修正）
        const banned = hit(cfg.skillBanish, name) >= 0;
        // v0.9.7 升級項目順序（例：目標 > 冷卻 > 傷害）：優先清單裡的技能先比強化項目，同項目再比技能順序；
        // 優先技能的「新！」卡排最前（先學到），沒列到的項目排在列到的後面
        const U = lines(cfg.skillUpg);
        if (up) learnUpg(up);
        const r = !U.length || p < 0 ? 0 : up == null ? 0 : (upgRank(U, up) + 1 || U.length + 1);
        const sc = (p >= 0 ? (100 - r) * 10000 + (100 - p) * 100 : (t.includes('新！') ? 0 : 1)) - (banned ? 1e8 : 0);
        return { sc, ok: !banned && (ok || !pri.length) };
      },
    });
  }

  // 寶箱選卡判斷：單人看 run.openingChest；組隊（非房主）時 openingChest 不會設定，改看選卡標題「寶箱」
  // （v0.6.4 修正：組隊時寶箱卡被當成技能卡，技能優先序的「神聖之光」命中「神聖之光 Deity」，寶箱策略/獵神都沒運作）
  const isChestPick = (run) => !!run?.openingChest || /寶箱|Cofre|Treasure/i.test($('#pk-title')?.textContent || '');

  function pickCard(run) {
    const cards = $$('#pk-cards .pk-card').filter(visible);
    if (!cards.length || !ready()) return !!cards.length;
    const names = cards.map((c) => ($('.pk-name', c)?.innerText || c.innerText).trim());
    let idx = 0;
    if (isChestPick(run)) {
      if (cfg.chestPick === 'smart') return chestTick(run, cards);
      if (cfg.chestPick === 'random') idx = Math.floor(Math.random() * cards.length);
    } else {
      return skillTick(run, cards); // 沒開「使用重抽…」時只照優先序選，不花次數
    }
    log('pick', names, '→', names[idx]);
    BOT.lastPicked = { el: cards[idx], at: Date.now() };
    clickBtn(cards[idx], rnd(400, 900));
    return true;
  }

  // ───────────────────────── 6. Lobby → stage → difficulty ─────────────────────────
  // v0.8.7「你的上一局」（遊戲 Beta 0.7）：斷線／維修時那局的戰利品在重新進入時補進帳號，對話框列出「品質: 名稱」與卡片。
  // 記進掉落紀錄（裝備總覽看得到），再按「接受」。以前在廣場只會按取消／關閉 → 會卡住
  const LASTRUN_Q = new RegExp('^(' + QUALITY.join('|') + ')\\s*[:：]\\s*(.+)$');
  function lastRunTick() {
    const dlg = $('#npc-dialog');
    if (!visible(dlg) || !/你的上一局|Tu última partida|Your last (run|game)/i.test($('#npc-name')?.textContent || '')) return false;
    const txt = ($('#npc-text', dlg) || dlg).innerText, sig = txt.length + '|' + txt.slice(0, 80);
    if (H.lastRunSig !== sig) {
      H.lastRunSig = sig;
      const ids = $$('img', dlg).map((i) => +((i.getAttribute('src') || '').match(/items\/(\d+)\./)?.[1] || 0)).filter(Boolean);
      const L = loadLog(), stage = L[L.length - 1]?.stage || '';
      let gi = 0;
      const got = txt.split(/\n|、|，/).map((x) => x.trim()).filter(Boolean).map((x) => {
        const m = x.match(LASTRUN_Q);
        if (m) { const name = m[2].trim(), id = ids[gi++] || 0; return { q: m[1], name, kind: '裝備', stat: splitName(name)[1], ...(id ? { id, slot: slotOf(id) } : {}) }; }
        if (/ Card$/.test(x)) return { q: '', name: x, kind: '卡片' };
        if (/扭蛋$|^Bola|Ball$/i.test(x)) return { q: '', name: x, kind: '扭蛋' };
        return null;
      }).filter(Boolean).map((d) => ({ at: Date.now(), seq: H.runSeq, stage, stats: '', src: '上一局補發', ...d }));
      if (got.length) { const a = loadDrops(); a.push(...got); saveDrops(a); log('上一局補發', got.length, '件', got.map((d) => `${d.q} ${d.name}`).join('、')); }
      if (cfg.tab === 'log') renderLog(true);
    }
    const ok = $$('button', dlg).find((b) => visible(b) && b.classList.contains('primary')) || btnByText(/^(接受|Aceptar|Accept|OK)$/i, dlg);
    if (ok) clickBtn(ok, rnd(1200, 2000));
    return true;
  }
  function lobbyTick() {
    if (!ready()) return;
    if (lastRunTick()) return;
    if (H.nextEnterAt && Date.now() < H.nextEnterAt) return; // 結算後的等待時間
    if (cfg.maxRuns && BOT.runs >= cfg.maxRuns) { cfg.loop = false; save(); render(); return; }

    // difficulty dialog
    const rows = $$('.diff-row').filter(visible);
    if (rows.length) {
      rows.forEach((r, i) => {
        const inp = $('input[type=range]', r);
        if (!inp || cfg.diff[i] == null) return;
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(inp, String(cfg.diff[i]));
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      });
      return void setTimeout(() => clickBtn(btnByText(/前往|出發|進入/, $('#npc-dialog') || document), rnd(1500, 2500)), rnd(300, 600)), wait(1200);
    }

    // v0.9.2 燈籠節：節慶主持人面板 → 開始遊戲（扭蛋按鈕不碰）；開錯成隊長的關卡清單就關掉
    if (isFest()) {
      if (visible($('#festival'))) { const b = $('#festival-play'); if (visible(b) && !b.disabled) { log('燈籠節 → 開始遊戲'); return void clickBtn(b, rnd(1500, 2500)); } return; }
      if (visible($('#stages'))) { clickBtn(btnByText(/取消|關閉|返回|✕/, $('#stages')) || $('#stages .x, #stages [class*=close]')); return; }
    }

    // stage list
    const stages = $('#stages');
    if (visible(stages)) {
      const card = $$('.stg-card', stages).find((c) => c.innerText.includes(cfg.stage));
      if (!card) { log('stage not found:', cfg.stage); cfg.loop = false; render(); return; }
      if (!card.classList.contains('sel')) return void clickBtn(card);
      const go = $('#stg-go'), skip = $('#stg-skip');
      if (visible(go)) return void clickBtn(go);
      if (visible(skip)) return void clickBtn(skip);
      log('stage selected but no 出發 button (locked?)'); cfg.loop = false; render(); return;
    }

    // other NPC dialog open (e.g. wrong NPC) → close
    const dlg = $('#npc-dialog');
    if (visible(dlg)) {
      // lobby (server) picker shown after login → choose the one marked 上次
      // 遊戲新版本提示：在廣場時直接按「重新整理」（重新整理後會自動登入回來）
      if (/新版本|versión nueva|new version/i.test(dlg.innerText) && cfg.autoLogin) {
        const rb = $$('button', dlg).find((b) => visible(b) && b.classList.contains('primary'));
        if (rb) { log('遊戲有新版本 → 重新整理'); return void clickBtn(rb, 5000); }
      }
      // 未完成的一局（瀏覽器還留著上一場的存檔，結算後偶爾沒清掉）：按主按鈕「繼續」
      // 遊戲會先問伺服器：已結束 → 戰利品寄郵差、經驗照算，接著跳「這局已經結束…」也是按主按鈕「OK」；還開著 → 接著打
      // （v0.7.3 前會一直卡在這裡，5 分鐘後被判閒置登出）
      if (/未完成的一局|Partida a medias|Unfinished run/i.test($('#npc-name')?.textContent || '')) {
        const pb = $$('button', dlg).find((b) => visible(b) && b.classList.contains('primary'));
        if (pb) { log('未完成的一局 →', pb.innerText.trim()); return void clickBtn(pb, rnd(1500, 2500)); }
      }
      // v0.9.2 出發前的設定（升級：立即／累積…）→ 按「前往野外」，照遊戲預設（立即）
      const goField = $$('button', dlg).find((b) => visible(b) && /^前往野外$|^Ir al campo$|^Go to the field$/i.test(b.innerText.trim()));
      if (goField) { log('出發 →', goField.innerText.trim()); return void clickBtn(goField, rnd(1500, 2500)); }
      if (/選擇大廳/.test(dlg.innerText)) {
        const last = $$('button,[role=button],li,div', dlg).filter((e) => visible(e) && /上次/.test(e.innerText) && e.innerText.length < 40).pop();
        if (last) return void clickBtn(last, rnd(1500, 2500));
      }
      clickBtn(btnByText(/取消|關閉|離開/, dlg)); return;
    }

    // talk to 遠征隊長（燈籠節：節慶主持人）
    const prompt = $('#lobby-prompt');
    const who = isFest() ? /主持人|節慶|Anfitriona|Host/i : /隊長/;
    if (visible(prompt) && who.test(prompt.innerText)) return void clickBtn(prompt, rnd(800, 1200));
    const L = BOT.lobby;
    const cap = L?.npcs?.find((n) => (isFest() ? n.id === 'festival' || /節慶主持人/.test(n.name || '') : /遠征隊長/.test(n.name || '') || n.id === 'captain'));
    if (cap && typeof L.moveTo === 'function') { L.moveTo(cap.x, cap.y); wait(2500); }
    else wait(1500);
  }

  // ───────────────────────── 6.5 Give up a run (hunt target not found) ─────────────────────────
  function huntGiveUp(run) {
    if (!huntingDeity() || cfg.chestPick !== 'smart') return null;
    const opened = run.chestsOpened || 0;
    // 開不起寶箱（zeny < 開箱費）持續 N 秒
    let cost = 0; try { cost = run.chestCost(); } catch {}
    if ((run.zeny || 0) < cost) BOT.rs.poorSince ??= run.time || 0; else BOT.rs.poorSince = null;
    if (cfg.huntPoorSec && BOT.rs.poorSince != null && (run.time || 0) - BOT.rs.poorSince >= cfg.huntPoorSec) return `開不起寶箱 ${cfg.huntPoorSec} 秒（${run.zeny}/${cost} zeny）`;
    if (cfg.huntLeaveChests && opened >= cfg.huntLeaveChests) return `開了 ${opened} 個寶箱沒拿到目標`;
    if (cfg.huntLeaveMin && (run.time || 0) >= cfg.huntLeaveMin * 60) return `${cfg.huntLeaveMin} 分鐘沒拿到目標`;
    return null;
  }
  // v0.9.9 王：關卡腳本 run.script.bosses（最後一隻＝MVP），隱藏王 run.script.rare（{id, chance}）由伺服器開場決定 → run.rareId
  const BOSS_ZH = { bacsojin: '白素貞', dark_snake_lord: '蛇王（Evil Snake Lord）' };
  const bossName = (id) => BOSS_ZH[id] || String(id).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const finalBosses = (run) => { const b = run?.script?.bosses || []; const mvp = b.filter((x) => x.id !== run.rareId).at(-1)?.id; return [mvp, run?.rareId].filter(Boolean); };
  const SB_KEY = 'roBot.stageBosses';
  const fbSkips = () => +localStorage.getItem('roBot.fbSkips') || 0;
  const setFbSkips = (n) => { try { localStorage.setItem('roBot.fbSkips', String(n)); } catch {} };
  const loadSB = () => { try { return JSON.parse(localStorage.getItem(SB_KEY) || '{}'); } catch { return {}; } };
  function learnBosses(run) {
    const name = stageOf(run), b = run?.script?.bosses; if (!name || !b?.length || BOT.rs.sbDone) return;
    BOT.rs.sbDone = true;
    const mvp = b.filter((x) => x.id !== run.rareId).at(-1), rare = run.script.rare;
    const sb = loadSB(), e = { mvp: mvp?.id, rare: rare?.id || null, chance: rare?.chance ?? null };
    if (JSON.stringify(sb[name]) !== JSON.stringify(e)) { sb[name] = e; try { localStorage.setItem(SB_KEY, JSON.stringify(sb)); } catch {} }
  }
  function leaveRun(why) {
    BOT.leaving = true;
    log('leave run:', why);
    BOT.lastLeave = why; BOT.rs.leaveWhy = why;
    // 和暫停選單「結束這場」相同的按鈕（#btn-endrun），按下後進入結算畫面
    const b = $('#btn-endrun');
    if (b) b.click(); else log('btn-endrun not found');
  }

  // ───────────────────────── 6.8 場次紀錄 ─────────────────────────
  // 存在瀏覽器 localStorage（roBot.log，最多 300 筆），面板「紀錄」分頁可看統計、匯出 CSV
  const LOG_KEY = 'roBot.log';
  const loadLog = () => { try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; } };
  const saveLog = (a) => { try { localStorage.setItem(LOG_KEY, JSON.stringify(a.slice(-300))); } catch {} };
  const mmss = (sec) => (sec == null ? '-' : `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`);
  // 結算標題（遊戲語系）：你存活下來了！＝通關、你死了＝死亡、已放棄本局＝放棄、本局結束＝其他結束
  function resultOf(title, run, rs) {
    if (/存活|sobreviv|surviv/i.test(title)) return '通關';
    if (/死|muerto|died/i.test(title)) return '死亡';
    if (/放棄|abandon/i.test(title) || rs.leaveWhy) return '放棄';
    if (title) return '結束';
    return run.player?.dead ? '死亡' : '結束';
  }
  function writeLog(run, title) {
    const rs = BOT.rs;
    let deity = '';
    try { const d = run.runItems?.slots?.get('deity'); if (d) deity = run.runItemName('deity', d.item) + (d.vals?.length > 1 ? ` +${d.vals.length - 1}` : ''); } catch {}
    const result = resultOf(title, run, rs);
    const e = {
      at: Date.now(),
      stage: stageOf(run),
      profile: STORE.activeProfile, job: run.classDef?.name || run.classDef?.id || '',
      time: Math.round(run.time || 0),
      level: run.level || 0,
      kills: run.kills || 0,
      chests: run.chestsOpened || 0,
      deity,
      target: huntActive() ? (huntDone() ? 'yes' : 'no') : '', huntFail: rs.huntFailed || '',
      huntAt: rs.huntAt != null ? Math.round(rs.huntAt) : null, ...(rs.skillTimeout ? { skillTimeout: rs.skillTimeout } : {}),
      result, why: rs.leaveWhy || '', title,
      seq: H.runSeq,
      drops: (rs.drops || []).map((d) => `${d.q ? d.q + ' ' : ''}${d.name}`),
      items: (rs.drops || []).map(itemOf), lootNote: rs.lootNote || '',
      ...mysteryOf(run),
      ...(run.stageId === 'louyang' ? { rare: run.rareId ? 1 : 0 } : {}), // v0.9.8 燈籠節隱藏王
      mode: phase() === 'normal' ? cfg.mode : 'hunt',
    };
    const a = loadLog(); a.push(e); saveLog(a);
    log('紀錄', e);
    if (cfg.tab === 'log') renderLog(true);
  }
  // ── 掉落紀錄：讀掉落展示 #drop-reveal 的 .dr-name / .dr-q / .dr-stats ──
  const DROP_KEY = 'roBot.drops';
  const loadDrops = () => { try { return JSON.parse(localStorage.getItem(DROP_KEY) || '[]'); } catch { return []; } };
  try { // v0.9.3：以前把扭蛋記成寵物蛋，修正舊紀錄（掉落與場次）
    if (!localStorage.getItem('roBot.fixBalls')) {
      const fix = (x) => { if (x && x.kind === '蛋' && /扭蛋|Bola|Ball/i.test(x.name || '')) x.kind = '扭蛋'; };
      const d = loadDrops(); d.forEach(fix); d.forEach((x) => { if (x.kind === '扭蛋') x.stage = FEST; }); localStorage.setItem(DROP_KEY, JSON.stringify(d));
      // 扭蛋只有燈籠節會掉 → 有扭蛋的場次一定是燈籠節（手動進燈籠節時以前記成設定的關卡）
      const lg = JSON.parse(localStorage.getItem('roBot.log') || '[]'); lg.forEach((e) => { (e.items || []).forEach(fix); if ((e.items || []).some((x) => x.kind === '扭蛋')) e.stage = FEST; }); localStorage.setItem('roBot.log', JSON.stringify(lg));
      localStorage.setItem('roBot.fixBalls', '1');
    }
  } catch {}
  const saveDrops = (a) => { try { localStorage.setItem(DROP_KEY, JSON.stringify(a.slice(-1000))); } catch {} };
  H.sessionAt ||= performance.timeOrigin; // 本次掛機＝這次開啟頁面起
  function lootLens(run) { return [run.runLoot?.length || 0, run.runCards?.length || 0, run.runEggs?.length || 0]; }
  // ── v0.7.4 伺服器掉落：關卡中只有紫色 ?（run.dropsBy：怪物 id → [裝備, 卡片]），實際物品在結算畫面 #go-server-loot ──
  const MOBN = (H.mobNames ||= {}); // 怪物 id → 名稱（關卡中看到時記下）
  function noteMobs(run) {
    if (Date.now() - (BOT.mobScanAt || 0) < 2000) return; BOT.mobScanAt = Date.now();
    for (const e of run.enemies || []) { const d = e.def; if (d?.id && d.name && !MOBN[d.id]) MOBN[d.id] = d.name; }
  }
  function mysteryOf(run) {
    let g = 0, c = 0; const src = [];
    try { for (const [id, [a, b]] of run.dropsBy || []) { g += a || 0; c += b || 0; src.push(`${MOBN[id] || id} ${a || 0}${b ? '+' + b + '卡' : ''}`); } } catch {}
    return g + c ? { myst: [g, c], src: src.join('、') } : {};
  }
  // v0.7.8 部位：結算圖片 items/<編號>.png 的編號，照 RO 編號區間判斷（對過遊戲物品資料庫 222 件全對）；素質：名稱後綴 of Dexterity → DEX
  const SLOT_R = [[1100, 1999, '武器'], [13000, 13999, '武器'], [16000, 16999, '武器'], [28600, 28699, '武器'], [2100, 2199, '盾牌'], [28900, 28999, '盾牌'],
    [2686, 2686, '頭飾'], [2200, 2299, '頭飾'], [5000, 5999, '頭飾'], [18000, 19999, '頭飾'], [49000, 49999, '頭飾'],
    [2300, 2399, '護甲'], [2400, 2499, '鞋子'], [2500, 2599, '披肩'], [2600, 2799, '飾品'], [22800, 22899, '飾品']];
  const slotOf = (id) => (SLOT_R.find(([a, b]) => id >= a && id <= b) || [])[2] || '';
  const STAT = { Strength: 'STR', Agility: 'AGI', Vitality: 'VIT', Intelligence: 'INT', Dexterity: 'DEX', Luck: 'LUK' };
  const splitName = (n) => { const m = (n || '').match(/^(.*) of (Strength|Agility|Vitality|Intelligence|Dexterity|Luck)$/); return m ? [m[1], STAT[m[2]]] : [n || '', '']; };
  const itemOf = (d) => ({ q: d.q || '', name: d.name, kind: d.kind, slot: d.slot || '', stat: d.stat ?? splitName(d.name)[1], ...(d.id ? { id: d.id } : {}), ...(d.aff ? { aff: d.aff } : {}), ...(d.refine ? { refine: d.refine } : {}) });
  // 舊紀錄只有 "品質 名稱" 字串
  const itemsOfLog = (e) => e.items || (e.drops || []).map((x) => {
    const q = QUALITY.find((k) => x.startsWith(k + ' ')), name = q ? x.slice(q.length + 1) : x;
    return itemOf({ q: q || '', name, kind: / Card$/.test(name) ? '卡片' : q ? '裝備' : '蛋' });
  });
  // v0.7.9 物品數值：結算畫面只有名稱，數值在伺服器回應 POST op {op:"loot"|"gclaim"} 的 granted.gear[].affixes。
  // 只讀回應副本（clone），不改請求、不改回應。遊戲每次呼叫時才取 window.fetch，所以熱更新後接上即可，不用刷新頁面。
  // 包裝只裝一次，處理函式放 H.onLoot（熱更新時換成新版）
  const LOOTRAW_KEY = 'roBot.lootRaw';
  if (!H.fetchWrapped) {
    H.fetchWrapped = true;
    const orig = window.fetch;
    window.fetch = function (input, init) {
      const p = orig.apply(this, arguments);
      try {
        const op = typeof init?.body === 'string' && init.body.match(/"op":"(loot|gclaim)"/)?.[1];
        if (op) p.then((r) => r.clone().json()).then((j) => H.onLoot?.(op, j)).catch(() => {});
      } catch {}
      return p;
    };
  }
  H.onLoot = (op, j) => {
    const g = j?.granted;
    if (!g || typeof g !== 'object') return;
    const raw = { at: Date.now(), seq: H.runSeq, op, gear: g.gear || [], cards: g.cards || [], eggs: g.eggs || [], mail: !!g.mail };
    BOT.rs.lootRaw = raw;
    try { const a = JSON.parse(localStorage.getItem(LOOTRAW_KEY) || '[]'); a.push(raw); localStorage.setItem(LOOTRAW_KEY, JSON.stringify(a.slice(-10))); } catch {}
    log('結算回應', op, raw.gear.length, '件裝備', JSON.stringify(raw.gear).slice(0, 300));
  };
  // affixes（2026-11-15 實測）：[{ stat: 'vit', value: 2 }, { stat: 'crit', value: 0.02 }]；六素質、HP、護甲是數值，其他是比例 → 顯示百分比
  const AFF = { str: 'STR', agi: 'AGI', vit: 'VIT', int: 'INT', dex: 'DEX', luk: 'LUK', hp: 'HP', armor: '護甲',
    crit: '爆擊', pierce: '穿透', cd: '冷卻', area: '範圍', spd: '移速', flee: '迴避', dmg: '傷害', cast: '詠唱', regen: '回復', pickup: '拾取', exp: '經驗', zeny: 'zeny', dodge: '閃避' };
  const AFF_FLAT = new Set(['str', 'agi', 'vit', 'int', 'dex', 'luk', 'hp', 'armor']);
  const fmtAff = (a) => (Array.isArray(a) ? a : []).map((x) => {
    const k = x?.stat ?? x?.k ?? x?.id, v = +(x?.value ?? x?.v);
    if (!k) return '';
    const n = !Number.isFinite(v) ? '' : AFF_FLAT.has(k) ? `+${+v.toFixed(2)}` : `+${+(v * 100).toFixed(1)}%`;
    // v0.8.5 指定技能加成：{ stat: 'skill', value: 0.18, skill: 'holy_light' } → 技能・Holy Light +18%
    if (k === 'skill') return `技能${x.skill ? '・' + String(x.skill).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : ''} ${n}`.trim();
    return `${AFF[k] || String(k).toUpperCase()} ${n}`.trim();
  }).filter(Boolean).join('、');
  function captureServerLoot(run) {
    if (BOT.rs.lootDone) return;
    const box = $('#go-server-loot');
    if (!visible(box)) return;
    const imgs = $$('img', box), note = box.innerText.trim();
    if (!imgs.length && (!note || /分配|等待|Repartiendo|Esperando|Distribut|Waiting/i.test(note))) return; // 還在分配
    BOT.rs.lootDone = true;
    if (!imgs.length) BOT.rs.lootNote = note; // 沒掉落／寄到郵差／伺服器沒回應
    const stage = stageOf(run);
    const got = imgs.map((i) => {
      const t = (i.title || '').trim(), m = t.match(/^(.*) \(([^()]+)\)$/);
      if (i.classList.contains('cardimg')) return { name: t, q: '', kind: '卡片' };
      const id = +((i.getAttribute('src') || '').match(/items\/(\d+)\./)?.[1] || 0);
      if (!m && /扭蛋|Bola|Ball/i.test(t)) return { name: t, q: '', kind: '扭蛋' }; // v0.9.3 燈籠節打王掉的扭蛋（結算時直接進帳號，不用撿）
      return m ? { name: m[1], q: m[2], kind: '裝備', slot: slotOf(id), stat: splitName(m[1])[1], id } : { name: t, q: '', kind: '蛋' };
    }).filter((d) => d.name).map((d) => ({ at: Date.now(), seq: H.runSeq, stage, stats: '', ...d }));
    // 對上伺服器回應：畫面裝備的順序＝granted.gear 的順序
    const rg = BOT.rs.lootRaw?.seq === H.runSeq ? BOT.rs.lootRaw.gear : null;
    if (rg) { let k = 0; for (const d of got) if (d.kind === '裝備') { const x = rg[k++]; if (x) { d.aff = fmtAff(x.affixes); if (x.refine) d.refine = x.refine; } } }
    if (!got.length) {
      log('結算掉落：', note || '(無)');
      const L = loadLog(), e = L.findLast?.((x) => x.seq === H.runSeq && Date.now() - x.at < 300000);
      if (e) { e.lootNote = note; saveLog(L); }
      return;
    }
    (BOT.rs.drops ||= []).push(...got);
    const a = loadDrops(); a.push(...got); saveDrops(a);
    log('結算掉落', got.length, got.map((d) => `${d.q} ${d.name}`).join('、'));
    // 紀錄可能已經先寫了（結算標題比物品早出現）→ 補上這場的掉落
    const L = loadLog(), e = L.findLast?.((x) => x.seq === H.runSeq && Date.now() - x.at < 300000);
    if (e) { e.drops = BOT.rs.drops.map((d) => `${d.q ? d.q + ' ' : ''}${d.name}`); e.items = BOT.rs.drops.map(itemOf); saveLog(L); }
    if (cfg.tab === 'log') renderLog(true);
  }
  function captureReveal(run) {
    const dr = $('#drop-reveal');
    if (!visible(dr)) { BOT.revealSig = null; BOT.lens = lootLens(run); return; }
    const name = $('.dr-name', dr)?.textContent.trim();
    if (!name) return;
    const q = $('.dr-q', dr)?.textContent.trim() || '';
    const sig = `${H.runSeq}|${name}|${q}|${dr.innerHTML.length}`;
    if (sig === BOT.revealSig) return;
    BOT.revealSig = sig;
    const now = lootLens(run), prev = BOT.lens || now;
    const kind = now[1] > prev[1] ? '卡片' : now[2] > prev[2] ? '蛋' : now[0] > prev[0] ? '裝備' : '其他';
    BOT.lens = now;
    const stats = [...dr.querySelectorAll('.dr-stats > *')].map((e) => e.textContent.trim()).filter(Boolean).slice(0, 4).join(' · ');
    const e = { at: Date.now(), seq: H.runSeq, stage: stageOf(run), name, q, kind, stats };
    (BOT.rs.drops ||= []).push(e);
    const a = loadDrops(); a.push(e); saveDrops(a);
    log('掉落', kind, q, name, stats);
    if (cfg.tab === 'log') renderLog(true);
  }
  function exportDrops() {
    const a = loadDrops();
    const db = itemDb() || {};
    const head = ['時間', '關卡', '種類', '品質', '部位', '素質', '名稱', '數值', '職業', '基本能力'];
    const rows = a.map((e) => { const it = db[e.id];
      return [new Date(e.at).toLocaleString(), e.stage, e.kind, e.q, e.slot || '', e.aff || e.stat || splitName(e.name)[1], e.name, e.stats, it ? jobsText(it.j) : '', it ? [it.b, it.x].filter(Boolean).join('、') : '']; });
    const csv = '\ufeff' + [head, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = `ro-bot-drops-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const QCOL = { 傳說: '#d35400', 史詩: '#8e44ad', 稀有: '#2471a3', 精良: '#2471a3', 優良: '#1e8449', 普通: '#666' };

  // ── v0.8.5 物品資料表：遊戲公開的 JS 分塊（目前叫 soul_linker-*.js）裡用 Z(id,"weapon",卡槽,[加成],{jobs,wtype})、
  // re(id,"weapon",n,{atk,matk,def},{jobs})… 定義每件裝備。函式名每次改版都會變 → 只靠格式比對；讀不到就退回編號區間判斷部位、不顯示職業。
  // 只讀遊戲已經載入的公開檔案（瀏覽器快取），結果依檔名存在 localStorage，改版後才重讀
  const IDB_KEY = 'roBot.itemDb';
  const SLOT_ZH = { weapon: '武器', shield: '盾牌', head_top: '頭上', head_mid: '頭中', head_low: '頭下', armor: '護甲', garment: '披肩', shoes: '鞋子', acc: '飾品' };
  const JOB_ZH = { novice: '初心者', swordsman: '劍士', mage: '魔法師', archer: '弓箭手', acolyte: '服事', thief: '盜賊', merchant: '商人', taekwon: '跆拳', ninja: '忍者', gunslinger: '槍手',
    knight: '騎士', crusader: '十字軍', wizard: '巫師', sage: '賢者', hunter: '獵人', bard: '詩人', dancer: '舞孃', priest: '祭司', monk: '武僧', assassin: '刺客', rogue: '流氓',
    blacksmith: '鐵匠', alchemist: '鍊金術師', star_gladiator: '拳聖', soul_linker: '靈媒' };
  const JOB_BASE = { knight: 'swordsman', crusader: 'swordsman', wizard: 'mage', sage: 'mage', hunter: 'archer', bard: 'archer', dancer: 'archer', priest: 'acolyte', monk: 'acolyte',
    assassin: 'thief', rogue: 'thief', blacksmith: 'merchant', alchemist: 'merchant', star_gladiator: 'taekwon', soul_linker: 'taekwon' };
  const BASE_JOBS = ['swordsman', 'mage', 'archer', 'acolyte', 'thief', 'merchant', 'taekwon', 'ninja', 'gunslinger'];
  const WT_ZH = { '검': '單手劍', '양손검': '雙手劍', '단검': '短劍', '창': '單手矛', '양손창': '雙手矛', '도끼': '單手斧', '양손도끼': '雙手斧', '클럽': '鈍器', '책': '書',
    '롯드': '杖', '양손롯드': '雙手杖', '활': '弓', '카타르': '拳刃', '수리검': '手裏劍', '권총': '手槍', '라이플': '步槍', '샷건': '霰彈槍', '개틀링': '格林機槍', '그레네이드': '榴彈槍',
    '너클': '拳套', '악기': '樂器', '채찍': '鞭', '풍마': '風魔手裏劍' };
  const FX_ZH = { damageMult: '傷害', haste: '冷卻', speedMult: '移速', maxHp: 'HP', doubleChance: '雙重施放', zenyMult: 'zeny', stunChance: '暈眩', critChance: '爆擊',
    pierceChance: '穿透', critMult: '爆擊傷害', armor: '護甲', areaMult: '範圍', reachMult: '射程', projSpeedMult: '彈速', expMult: '經驗', pickupRadius: '拾取範圍',
    bossUndeadMult: '對王／不死', bossEliteMult: '對王／菁英', regen: '回復', luck: '幸運' };
  const FX_FLAT = new Set(['maxHp', 'armor', 'regen']);
  function parseItemDb(t) {
    const fx = {}, arr = {}, db = {};
    for (const m of t.matchAll(/[,;\s]([\w$]+)=[\w$]+\(\(t,e\)=>t\.(\w+)(?:\+=|\*=)/g)) fx[m[1]] = m[2];
    for (const m of t.matchAll(/[,;\s]([\w$]+)=\[((?:"[a-z_]+",?)+)\]/g)) arr[m[1]] = m[2].match(/[a-z_]+/g);
    const re = /[;,{\s]([\w$]+)\((\d{3,6}),"(weapon|armor|acc|shoes|garment|shield|head_top|head_mid|head_low)"([^;]*)/g;
    for (const m of t.matchAll(re)) {
      const id = m[2], rest = m[4], e = (db[id] ||= { s: m[3] });
      const jm = rest.match(/jobs:(\[[^\]]*\]|[\w$]+)/);
      if (jm) e.j = jm[1][0] === '[' ? (jm[1].match(/[a-z_]+/g) || []) : arr[jm[1]] || e.j;
      const wm = rest.match(/wtype:"([^"]+)"/); if (wm) e.w = wm[1];
      const bm = rest.match(/\{atk:(\d+),matk:(\d+),def:(\d+)/);
      if (bm) { e.b = [+bm[1] ? `ATK ${bm[1]}` : '', +bm[2] ? `MATK ${bm[2]}` : '', +bm[3] ? `DEF ${bm[3]}` : ''].filter(Boolean).join(' '); e.x = ''; } // re() 會把加成清空、改用基本值
      const xm = rest.match(/^,\d+,\[([^\]]*)\]/);
      if (xm) {
        const xs = [...xm[1].matchAll(/([\w$]+)\((-?[\d.]+)\)/g)].map(([, f, v]) => { const k = fx[f]; if (!k) return ''; v = +v;
          return `${FX_ZH[k] || k} ${v < 0 ? '' : '+'}${FX_FLAT.has(k) ? v : +(v * 100).toFixed(1) + '%'}`; }).filter(Boolean);
        if (xs.length) e.x = xs.join('、');
      }
    }
    return db;
  }
  function itemDb() {
    if (H.itemDb) return H.itemDb;
    const url = performance.getEntriesByType('resource').map((r) => r.name).find((n) => /\/build\/soul_linker-[\w-]+\.js/.test(n));
    if (!url) return null;
    const file = url.split('?')[0].split('/').pop();
    try { const c = JSON.parse(localStorage.getItem(IDB_KEY) || 'null'); if (c?.file === file && c.db) return (H.itemDb = c.db); } catch {}
    if (!H.itemDbLoading) {
      H.itemDbLoading = true;
      fetch(url).then((r) => r.text()).then((t) => {
        const db = parseItemDb(t), n = Object.keys(db).length;
        log('物品資料表', file, n, '件');
        if (n < 50) return; // 格式變了：不用
        H.itemDb = db; try { localStorage.setItem(IDB_KEY, JSON.stringify({ file, db })); } catch {}
        if (cfg.tab === 'log') renderGear();
      }).catch(() => {}).finally(() => { H.itemDbLoading = false; });
    }
    return null;
  }
  const jobsText = (j) => (!j || BASE_JOBS.every((b) => j.includes(b)) ? '全職業' : j.map((x) => JOB_ZH[x] || x).join('・'));
  const myJob = () => { const id = BOT.run?.classDef?.id; if (id) { try { localStorage.setItem('roBot.myJob', id); } catch {} return id; } try { return localStorage.getItem('roBot.myJob') || ''; } catch { return ''; } };
  const canWear = (j, job) => !j || !job || j.includes(job) || j.includes(JOB_BASE[job]);

  // 裝備總覽：所有場次的裝備放一張表，依品質→時間排序；可篩選品質、部位、範圍、只看目前角色能裝
  const GV_KEY = 'roBot.gearView', GV_DEF = { q: ['傳說', '史詩', '稀有', '精良', '優良'], s: '', r: 'all', mine: false };
  const gearView = () => { try { return { ...GV_DEF, ...JSON.parse(localStorage.getItem(GV_KEY) || '{}') }; } catch { return { ...GV_DEF }; } };
  const GSLOTS = ['武器', '盾牌', '頭飾', '護甲', '披肩', '鞋子', '飾品'];
  const gslot = (d, it) => { const s = it?.s ? SLOT_ZH[it.s] : d.slot; return /^頭/.test(s || '') ? '頭飾' : s || ''; };
  function renderGear() {
    const box = panel?.querySelector('#rb-gear');
    if (!box) return;
    const v = gearView(), db = itemDb() || {}, job = myJob();
    const day = new Date(); day.setHours(0, 0, 0, 0);
    const since = v.r === 'sess' ? H.sessionAt : v.r === 'day' ? day.getTime() : 0;
    const all = loadDrops().filter((d) => d.kind === '裝備' && d.at >= since).map((d) => ({ d, it: db[d.id] }));
    const pre = all.filter(({ d, it }) => (!v.s || gslot(d, it) === v.s) && (!v.mine || canWear(it?.j, job)));
    const qn = {}; pre.forEach(({ d }) => (qn[d.q] = (qn[d.q] || 0) + 1));
    const qi = (q) => { const i = QUALITY.indexOf(q); return i < 0 ? 99 : i; };
    const list = pre.filter(({ d }) => v.q.includes(d.q)).sort((x, y) => qi(x.d.q) - qi(y.d.q) || y.d.at - x.d.at);
    const chip = (key, val, label, on, col) => `<button type="button" class="gchip${on ? ' on' : ''}" data-gv="${key}:${val}"${col ? ` style="--c:${col}"` : ''}>${label}</button>`;
    const row = ({ d, it }) => {
      const [base] = splitName(d.name), w = it?.w ? WT_ZH[it.w] || it.w : '';
      const ok = canWear(it?.j, job);
      const aff = (d.aff || (d.stat ? `${d.stat} +?` : '')).replace(/\bSKILL\b/, '技能'); // 0.8.5 前存的是 SKILL
      const t = new Date(d.at), when = `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
      return `<div class="gi"><div><span style="color:${QCOL[d.q] || '#333'};font-weight:600">${d.q}</span> <span class="hint">${it?.s ? SLOT_ZH[it.s] : d.slot || '?'}${w ? '・' + w : ''}</span> ${d.refine ? '+' + d.refine + ' ' : ''}${base}${aff ? ` <b>${aff}</b>` : ''}</div>
        <div class="hint">${it ? `<span style="color:${ok ? '#1e8449' : '#999'}">${ok && job ? '✓ ' : ''}${jobsText(it.j)}</span>` : ''}${it?.b ? '　' + it.b : ''}${it?.x ? '　' + it.x : ''}　<span style="opacity:.7">${when} ${(d.stage || '').slice(0, 6)}</span></div></div>`;
    };
    const jobZh = JOB_ZH[job] || job;
    box.innerHTML = `<div style="display:flex;align-items:center;gap:4px"><b>🎒 裝備總覽</b><span class="hint">${all.length} 件</span><span style="flex:1"></span>
        ${chip('r', 'sess', '本次', v.r === 'sess')}${chip('r', 'day', '今天', v.r === 'day')}${chip('r', 'all', '全部', v.r === 'all')}</div>
      <div class="gchips">${QUALITY.filter((q) => qn[q] || v.q.includes(q) && q !== '精良').map((q) => chip('q', q, `${q} ${qn[q] || 0}`, v.q.includes(q), QCOL[q])).join('')}</div>
      <div class="gchips">${chip('s', '', '全部位', !v.s)}${GSLOTS.map((s) => chip('s', s, s, v.s === s)).join('')}${job ? chip('mine', v.mine ? 0 : 1, `只看${jobZh}能裝`, v.mine) : ''}</div>
      <div class="glist">${list.slice(0, 200).map(row).join('') || `<div class="hint">${all.length ? '沒有符合的裝備（換個篩選看看）' : '還沒有裝備紀錄（每場結算時讀取）'}</div>`}</div>
      ${!H.itemDb && !Object.keys(db).length ? '<div class="hint">讀取物品資料表中…（職業、基本能力稍後出現）</div>' : ''}`;
  }
  function onGearClick(ev) {
    const b = ev.target.closest?.('[data-gv]');
    if (!b) return;
    const [k, val] = b.dataset.gv.split(':'), v = gearView();
    if (k === 'q') v.q = v.q.includes(val) ? v.q.filter((x) => x !== val) : [...v.q, val];
    else if (k === 'mine') v.mine = val === '1';
    else v[k] = val;
    try { localStorage.setItem(GV_KEY, JSON.stringify(v)); } catch {}
    renderGear();
  }

  function renderLog(force) {
    if (!panel || (!force && cfg.tab !== 'log')) return;
    const a = loadLog(), box = panel.querySelector('#rb-log');
    if (!box) return;
    const n = a.length, hunted = a.filter((e) => e.target), got = hunted.filter((e) => e.target === 'yes');
    const avg = (xs) => (xs.length ? xs.reduce((p, c) => p + c, 0) / xs.length : null);
    const wins = a.filter((e) => e.result === '通關').length;
    const pct = (x, y) => (y ? Math.round((x / y) * 100) : 0);
    const stages = {};
    a.forEach((e) => { const k = `${e.profile ? e.profile + '．' : ''}${e.stage || '?'}`; (stages[k] ||= { n: 0, w: 0 }).n++; if (e.result === '通關') stages[k].w++; });
    const sess = a.filter((e) => e.at >= H.sessionAt), sessW = sess.filter((e) => e.result === '通關').length;
    const sum = `<div class="sub" style="gap:2px">
      <div style="font-size:13px">達成率 <b style="color:#1e8449">${pct(wins, n)}%</b>（通關 ${wins}/${n} 場）</div>
      <div class="hint">本次掛機 ${pct(sessW, sess.length)}%（${sessW}/${sess.length}）</div>
      ${Object.keys(stages).length > 1 ? Object.entries(stages).map(([k, v]) => `<div class="hint">${k}：${pct(v.w, v.n)}%（${v.w}/${v.n}）</div>`).join('') : ''}
      <div>死亡 ${a.filter((e) => e.result === '死亡').length}／放棄 ${a.filter((e) => e.result === '放棄').length}／其他 ${a.filter((e) => e.result === '結束').length}</div>
      <div>平均時長 ${mmss(avg(a.map((e) => e.time)))}　平均等級 ${avg(a.map((e) => e.level))?.toFixed(1) ?? '-'}</div>
      ${hunted.length ? `<div>獵神成功 <b>${got.length}/${hunted.length}</b>（${Math.round((got.length / hunted.length) * 100)}%）　平均獵到 ${mmss(avg(got.filter((e) => e.huntAt != null).map((e) => e.huntAt)))}</div>` : ''}
    </div>`;
    const rows = a.slice(-60).reverse().map((e) => {
      const d = new Date(e.at), t = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const col = e.result === '死亡' ? '#c0392b' : e.result === '放棄' ? '#b9770e' : e.result === '通關' ? '#1e8449' : '#666';
      const bq = QUALITY.find((q) => (e.drops || []).some((x) => x.startsWith(q + ' '))); // 這場最好的品質
      const tip = [e.why, e.src && `? 來源：${e.src}`, (e.drops || []).length && `掉落：${e.drops.join('、')}`].filter(Boolean).join('\n').replace(/"/g, '&quot;');
      return `<tr title="${tip}"><td>${t}</td><td>${(e.stage || '').slice(0, 4)}</td><td>${mmss(e.time)}</td><td>${e.level}</td>
        <td>${e.target === 'yes' ? '🎯' + mmss(e.huntAt) : e.target === 'no' ? '✗' : ''}${e.deity && e.target !== 'yes' ? (e.deity || '').slice(0, 2) : ''}</td>
        <td style="color:${QCOL[bq] || '#333'}">${e.myst ? `${e.myst[0]}/${e.myst[1]}` : ''}</td><td style="color:${col}">${e.result}</td></tr>`;
    }).join('');
    // 本次掛機掉落
    const ds = loadDrops().filter((d) => d.at >= H.sessionAt);
    const byKind = {}; ds.forEach((d) => (byKind[d.kind] = (byKind[d.kind] || 0) + 1));
    const byQ = {}; ds.forEach((d) => d.q && (byQ[d.q] = (byQ[d.q] || 0) + 1));
    const curRun = (BOT.rs.drops || []).length;
    const sessRuns = sess.filter((e) => e.myst), avgN = (i) => avg(sessRuns.map((e) => e.myst[i]))?.toFixed(1) ?? '-';
    // 每場一張小卡（最新在上）：裝備一件一行「品質 部位 名稱 +素質」、卡片一行；最近 3 場展開
    const hm = (at) => { const t = new Date(at); return `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; };
    const runCard = (e, open) => {
      const it = itemsOfLog(e), qi = (x) => { const i = QUALITY.indexOf(x.q); return i < 0 ? 99 : i; };
      const gear = it.filter((x) => x.kind === '裝備').sort((x, y) => qi(x) - qi(y));
      const cards = it.filter((x) => x.kind === '卡片').map((x) => x.name.replace(/ Card$/, ''));
      const eggs = it.filter((x) => x.kind === '蛋').length;
      const balls = it.filter((x) => x.kind === '扭蛋').reduce((o, x) => ((o[x.name] = (o[x.name] || 0) + 1), o), {});
      const col = e.result === '死亡' ? '#c0392b' : e.result === '放棄' ? '#b9770e' : e.result === '通關' ? '#1e8449' : '#666';
      const bq = gear[0]?.q;
      const body = gear.map((x) => { const [base] = splitName(x.name);
        const ij = x.id && H.itemDb?.[x.id];
        return `<div style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span style="color:${QCOL[x.q] || '#333'}">${x.q}</span> <span class="hint">${x.slot || ''}</span> ${x.refine ? '+' + x.refine + ' ' : ''}${base}${x.aff ? ` <b>${x.aff}</b>` : x.stat ? ` <b>+${x.stat}</b>` : ''}${ij ? ` <span class="hint">${jobsText(ij.j)}</span>` : ''}</div>`; }).join('')
        + (cards.length ? `<div style="font-size:11px"><span class="hint">卡片</span> ${cards.join('・')}</div>` : '')
        + (eggs ? `<div style="font-size:11px"><span class="hint">寵物蛋</span> ×${eggs}</div>` : '')
        + (Object.keys(balls).length ? `<div style="font-size:11px"><span class="hint">扭蛋</span> ${Object.entries(balls).map(([k, n]) => `${k} ×${n}`).join('・')}</div>` : '')
        || `<div class="hint">${e.lootNote || (e.myst ? '沒抓到結算物品' : '沒有掉落')}</div>`;
      return `<details class="run"${open ? ' open' : ''}><summary style="font-size:11px"><span class="hint">${hm(e.at)}</span> ${(e.stage || '').slice(0, 6)} <span style="color:${col}">${e.result}</span> ${mmss(e.time)}
        <span style="float:right;color:${QCOL[bq] || '#666'}">${e.myst ? `裝備 ${e.myst[0]}・卡 ${e.myst[1]}` : it.length ? `${it.length} 件` : ''}</span></summary>
        <div style="padding:2px 0 4px 10px">${body}${e.src ? `<div class="hint" style="font-size:10px">? 來源：${e.src}</div>` : ''}</div></details>`;
    };
    const recent = a.slice(-20).reverse();
    const dropHtml = `<div class="sub" style="gap:3px">
      <div><b>本次掛機掉落</b> ${ds.length} 件　<span class="hint">這一場 ${curRun} 件</span></div>
      <div class="hint">${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join('　') || '還沒有掉落（結算時讀取）'}${sessRuns.length ? `　平均每場 裝備 ${avgN(0)}・卡 ${avgN(1)}` : ''}</div>
      <div>${QUALITY.filter((q) => byQ[q]).map((q) => `<span style="color:${QCOL[q] || '#333'}">${q} ${byQ[q]}</span>`).join('　')}</div>
      <div id="rb-gear" class="gear"></div>
      ${recent.length ? `<div class="hint">每場掉落（點標題展開／收合）</div><div style="max-height:260px;overflow:auto">${recent.map((e, i) => runCard(e, i < 3)).join('')}</div>` : ''}
    </div>`;
    const stalls = loadStalls().filter((x) => x.at >= H.sessionAt);
    const stallHtml = stalls.length ? `<div class="sub" style="gap:2px;background:#fff4e5">
      <div><b>⏸ 遊戲停住</b> ${stalls.length} 次，共 ${mmss(stalls.reduce((p, x) => p + x.dur, 0))}</div>
      ${stalls.slice(-4).reverse().map((x) => { const d = new Date(x.at); return `<div class="hint">${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 停了 ${mmss(x.dur)}${x.inRun ? '（關卡中）' : ''}</div>`; }).join('')}
      <div class="hint">分頁被切走、最小化或被蓋住時遊戲會停</div></div>` : '';
    box.onclick = onGearClick;
    box.innerHTML = stallHtml + dropHtml + sum + `<table class="lg"><thead><tr><th>時間</th><th>關卡</th><th>時長</th><th>Lv</th><th>神祇</th><th title="裝備／卡片（紫色 ?）">掉落</th><th>結果</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="hint">還沒有紀錄（每場結束時寫入）</td></tr>'}</tbody></table>`;
    renderGear();
  }
  function exportLog() {
    const a = loadLog();
    const head = ['時間', '設定檔', '職業', '關卡', '時長(秒)', '等級', '擊殺', '開寶箱', '神祇', '拿到目標', '獵到時間(秒)', '結果', '結算標題', '原因', '模式', '掉落', '裝備?', '卡片?', '?來源'];
    const rows = a.map((e) => [new Date(e.at).toLocaleString(), e.profile || '', e.job || '', e.stage, e.time, e.level, e.kills, e.chests, e.deity, e.target, e.huntAt ?? '', e.result, e.title || '', e.why, e.mode, (e.drops || []).join('／'), e.myst?.[0] ?? '', e.myst?.[1] ?? '', e.src || '']);
    const csv = '\ufeff' + [head, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = `ro-bot-log-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ───────────────────────── 6.9 組隊掉落擲骰 ─────────────────────────
  // 組隊時裝備/卡片/蛋掉落要擲骰：掉落展示 #drop-reveal 下方、或右側 #loot-rolls 每列，按鈕 [data-c="need|greed|pass"]，約 20 秒逾時
  const ROLL_SEEN = new WeakMap();
  function rollDecide(it) {
    const r = cfg.roll;
    if (r.mode !== 'rule') return r.mode;
    if (hit(r.needList, it.name) >= 0) return 'need';
    if (hit(r.passList, it.name) >= 0) return 'pass';
    if (it.kind === '卡片' && r.card !== 'rule') return r.card;
    const q = QUALITY.findIndex((x) => (it.q || '').includes(x)), minQ = QUALITY.indexOf(r.needQ);
    if (q >= 0 && minQ >= 0 && q <= minQ) return 'need';
    return r.other;
  }
  function rollTick() {
    if (!cfg.roll || cfg.roll.mode === 'off') return;
    const groups = [];
    const dr = $('#drop-reveal');
    if (visible(dr) && $('[data-c]', dr)) {
      const txt = dr.textContent;
      groups.push({ el: dr, name: $('.dr-name', dr)?.textContent.trim() || '', q: $('.dr-q', dr)?.textContent.trim() || '', kind: /卡片|Carta|Card/.test(txt) ? '卡片' : /蛋|Huevo|Egg/.test(txt) ? '蛋' : '裝備' });
    }
    for (const row of $$('#loot-rolls .lr-row')) {
      if (!$('[data-c]', row)) continue;
      const small = $('.lr-item small', row)?.textContent || '';
      groups.push({ el: row, name: $('.lr-item b', row)?.textContent.trim() || '', q: '', kind: /卡片|Carta|Card/.test(small) ? '卡片' : /蛋|Huevo|Egg/.test(small) ? '蛋' : '裝備' });
    }
    const now = Date.now();
    for (const it of groups) {
      if (!ROLL_SEEN.has(it.el)) { ROLL_SEEN.set(it.el, now + rnd(800, 1600)); continue; } // 稍等一下再按，像真人
      if (now < ROLL_SEEN.get(it.el)) continue;
      const choice = rollDecide(it);
      const b = [...it.el.querySelectorAll('[data-c]')].find((x) => x.dataset.c === choice && !x.disabled && visible(x));
      if (b) { log('擲骰', it.kind, it.q, it.name, '→', choice); b.click(); ROLL_SEEN.set(it.el, Infinity); }
    }
  }

  // ───────────────────────── 6.95 長時間掛機 ─────────────────────────
  // 擴充功能背景（bg.js）幫忙：分頁不被釋放、保持電腦清醒、最小化自動還原、移到獨立視窗
  function extMsg(msg, cb) {
    const id = document.documentElement.dataset.robotExt;
    if (!id || !window.chrome?.runtime?.sendMessage) { cb?.({ ok: false, error: '擴充功能連線未啟用（請重新整理一次）' }); return; }
    try { chrome.runtime.sendMessage(id, msg, (r) => { void chrome.runtime.lastError; cb?.(r || { ok: false, error: chrome.runtime.lastError?.message }); }); } catch (e) { cb?.({ ok: false, error: e.message }); }
  }
  function careTick() {
    if (cfg.noDiscard) extMsg({ type: 'nodiscard' });
    extMsg({ type: 'awake', on: !!(cfg.keepAwake && (cfg.fight || cfg.loop)) });
  }
  // 停住紀錄：分頁被藏起來（切走 / 最小化 / 被蓋住）時遊戲會停，記下停了多久
  const STALL_KEY = 'roBot.stalls';
  const loadStalls = () => { try { return JSON.parse(localStorage.getItem(STALL_KEY) || '[]'); } catch { return []; } };
  function onVisibility() {
    if (document.hidden) {
      H.hiddenAt = Date.now();
      if (cfg.autoRestore) setTimeout(() => { if (document.hidden) extMsg({ type: 'restore' }, (r) => r?.restored && log('視窗被最小化 → 已還原')); }, 1500);
    } else if (H.hiddenAt) {
      const dur = Date.now() - H.hiddenAt;
      if (dur > 10000 && (cfg.fight || cfg.loop)) {
        const a = loadStalls(); a.push({ at: H.hiddenAt, dur: Math.round(dur / 1000), inRun: !!inRun() });
        try { localStorage.setItem(STALL_KEY, JSON.stringify(a.slice(-200))); } catch {}
        log('分頁在背景', Math.round(dur / 1000), '秒（遊戲停住）');
      }
      H.hiddenAt = null;
    }
  }
  document.addEventListener('visibilitychange', onVisibility);
  BOT.cleanup.push(() => document.removeEventListener('visibilitychange', onVisibility));

  // 自動登入：標題畫面「開始遊戲！」(#sp-play) → 角色選擇 (#slots .slot，選上次的角色) → #btn-play → 大廳選擇在 lobbyTick 處理
  // v0.7.9：角色名稱改在選角畫面按「開始遊戲」時記（選中的 .slot-name），存進目前設定檔（設定檔＝一隻角色）。
  // 以前讀 #hud-name，那裡有時是職業名（例：Espadachín）、有時是「名稱 職業」，對不上選角畫面 → 選到預設的第一隻角色
  const slotName = (sl) => $('.slot-name', sl)?.textContent.trim() || '';
  function onPlayClick(ev) {
    if (!ev.target?.closest?.('#btn-play')) return;
    const nm = slotName($('#slots .slot.selected'));
    if (!nm) return;
    H.lastChar = nm; try { localStorage.setItem('roBot.lastChar', nm); } catch {}
    if (!(cfg.char || '').trim()) { cfg.char = nm; save(); render(); log('記住角色', nm, '→ 設定檔', STORE.activeProfile); } // 使用者自己填的不覆蓋
  }
  document.addEventListener('click', onPlayClick, true);
  BOT.cleanup.push(() => document.removeEventListener('click', onPlayClick, true));
  // v0.7.9 帳號密碼自動登入：登入狀態被清掉（遊戲改版、session 過期）時，標題畫面變成「建立帳號／進入」。
  // 關掉「現在需要帳號」對話框 → 切到「進入」→ 填帳號密碼 → 按進入。10 分鐘內最多試一次（跨重新整理也算），失敗就停下提示，避免一直試錯被鎖
  // v0.8.4 自動登入節流（存 localStorage，重新整理也算）：一次「送密碼 → 開始遊戲 → 選角開始」算一回合，回合內每個按鈕只按一次。
  // 沒進到大廳／關卡＝這回合失敗，下一回合等 1→3→10→20→30 分（±20%）；送密碼 24 小時最多 6 次；維修中、排隊中不動作。
  // 進到大廳或關卡就歸零。目的：伺服器維修／更新時不要一直重複登入。
  const LG_KEY = 'roBot.loginGuard', LG_WAIT = [0, 1, 3, 10, 20, 30], LG_PW_DAY = 6, LG_WIN = 120000;
  const lgLoad = () => { try { return JSON.parse(localStorage.getItem(LG_KEY)) || {}; } catch { return {}; } };
  const lgSave = (g) => { try { localStorage.setItem(LG_KEY, JSON.stringify(g)); } catch {} };
  BOT.lgPending = true;
  function loginStep(step) {
    const g = lgLoad(), now = Date.now();
    g.pw = (g.pw || []).filter((t) => now - t < 86400000);
    if (step === 'pw' && g.pw.length >= LG_PW_DAY) { BOT.loginErr = `24 小時內已自動送出 ${LG_PW_DAY} 次密碼，先停下，請手動登入`; return false; }
    if (!g.win || now - g.win > LG_WIN) {
      if (now < (g.next || 0)) { BOT.loginErr = `自動登入第 ${g.n} 次沒進到遊戲，約 ${Math.ceil((g.next - now) / 60000)} 分鐘後再試`; return false; }
      g.n = (g.n || 0) + 1; g.win = now; g.steps = [];
      g.next = now + LG_WAIT[Math.min(g.n, LG_WAIT.length - 1)] * 60000 * (0.8 + Math.random() * 0.4);
    }
    if (g.steps.includes(step)) return false;
    g.steps.push(step); if (step === 'pw') g.pw.push(now);
    lgSave(g); BOT.lgPending = true; return true;
  }
  function loginOk() { // 進到大廳／關卡：回合數歸零（送密碼的 24 小時紀錄保留）
    if (!BOT.lgPending) return;
    BOT.lgPending = false; const g = lgLoad();
    if (g.n || g.win) { lgSave({ pw: g.pw || [] }); log('登入成功 → 重試計數歸零'); }
  }
  function lgHold() { const g = lgLoad(); if (g.win) { g.win = Date.now(); lgSave(g); } } // 排隊中：回合延長，不算失敗
  function setInput(el, v) {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function accountTick() {
    const lf = $('#sp-login'), rf = $('#sp-register');
    if (!visible(lf) && !visible(rf)) { BOT.loginErr = null; return false; }
    if (!BOT.credUser) {
      // 頁面剛載入時擴充功能連線可能還沒好 → 每 5 秒再問一次
      if (Date.now() - (BOT.credAt || 0) > 5000) { BOT.credAt = Date.now(); extMsg({ type: 'cred:get' }, (r) => { if (r?.user) BOT.credUser = r.user; }); }
      BOT.loginErr = '已被登出：到「控制 → 長時間掛機」填帳號密碼才能自動登入'; return true;
    }
    const err = lf && $('.sp-error', lf)?.textContent.trim();
    if (err) { BOT.loginErr = '自動登入失敗：' + err; return true; }
    const dlg = $('#npc-dialog');
    if (visible(dlg) && /需要帳號|hace falta una cuenta|need an account/i.test($('#npc-name')?.textContent || '')) {
      // 有「我已經有帳號」就按它；只有「建立我的帳號」時按了只是切到註冊頁，之後再切到「進入」
      const btns = $$('button', dlg).filter(visible);
      const pb = btns.find((b) => /已經有帳號|已有帳號|Ya tengo cuenta|already have/i.test(b.innerText)) || btns.find((b) => b.classList.contains('primary'));
      if (pb) { log('自動登入：關閉「需要帳號」'); clickBtn(pb, rnd(800, 1200)); }
      return true;
    }
    if (!visible(lf)) { const tab = $('[data-sp-tab="login"]'); if (tab) { log('自動登入：切到「進入」'); clickBtn(tab, rnd(600, 900)); } return true; }
    if (BOT.loginBusy) return true;
    if (!loginStep('pw')) return true;
    BOT.loginBusy = true; wait(5000);
    extMsg({ type: 'cred:get', full: true }, (r) => {
      BOT.loginBusy = false;
      const c = r?.cred, u = $('input[name="username"]', lf), pw = $('input[name="password"]', lf), sub = $('button[type="submit"]', lf);
      if (!c?.u || !c?.p || !u || !pw || !sub) { BOT.loginErr = '自動登入：讀不到帳號密碼或登入表單'; return; }
      setInput(u, c.u); setInput(pw, c.p);
      log('自動登入：帳號', c.u);
      setTimeout(() => { sub.click(); setTimeout(() => { try { setInput(pw, ''); } catch {} }, 3000); }, rnd(500, 900));
    });
    return true;
  }
  function loginTick() {
    if (!ready()) return;
    if (lastRunTick()) return;
    // 維修中：不登入，每 5 分鐘（±20%）按一次「重新檢查」
    const retry = $('.sp-maint-retry');
    if (visible(retry)) {
      BOT.loginErr = '伺服器維修中：暫停自動登入，每 5 分鐘重新檢查一次';
      if (!retry.disabled && Date.now() > (BOT.maintAt || 0)) { BOT.maintAt = Date.now() + 300000 * (0.8 + Math.random() * 0.4); log('維修中 → 重新檢查'); clickBtn(retry, 3000); }
      return;
    }
    // 伺服器額滿排隊中：什麼都不按（再按開始會重新排隊），也不算登入失敗
    const qt = queueText();
    if (qt) { BOT.loginErr = '伺服器額滿排隊中' + (qt.match(/第\s*([\d,]+)\s*位，共\s*([\d,]+)\s*位/) ? `：第 ${RegExp.$1} 位／共 ${RegExp.$2} 位` : '') + '（什麼都不按，排到會自動進場）'; lgHold(); return; }
    // 廣場 5 分鐘沒動作被登出：「你已 5 分鐘沒有動作…」→ 按「我知道了」，再照常按開始遊戲
    // （v0.8.2 移到帳號登入之前：提示蓋在登入畫面上時先關掉）
    // （維護前伺服器踢人也是這個提示，標題「暫離」，按鈕「接受」）
    // v0.8.6：維修斷線的「離線：沒有連線到伺服器…戰利品由郵差送給你」也一樣按「接受」
    if (/沒有動作|已離開遊戲|sin tocar|inactiv|沒有連線到伺服器|sin conexión|not connected/i.test(document.body.innerText)) {
      const ok = btnByText(/^(接受|我知道了|Aceptar|Accept|Entendido|OK|Got it|Vale)$/i);
      if (ok) { log('閒置被登出 → 關閉提示，重新登入'); return void clickBtn(ok, rnd(1500, 2500)); }
    }
    if (accountTick()) return;
    const play = $('#btn-play');
    if (visible(play)) {
      let want = (cfg.char || '').trim() || H.lastChar; try { want ||= localStorage.getItem('roBot.lastChar'); } catch {}
      const slots = $$('#slots .slot').filter((sl) => slotName(sl));
      // 完全相符；舊版存的「名稱 職業」取前段比對
      const slot = want && (slots.find((sl) => slotName(sl) === want) || slots.find((sl) => want.startsWith(slotName(sl) + ' ')));
      if (want && !slot) {
        if (BOT.loginWarn !== want) { BOT.loginWarn = want; log('自動登入：找不到角色', want, '→ 停在選角畫面，請手動選'); }
        return; // 寧可停下也不要用錯角色進遊戲
      }
      BOT.loginWarn = null;
      if (slot && !slot.classList.contains('selected')) return void clickBtn(slot, rnd(600, 1000));
      if (!play.disabled && loginStep('char')) { log('自動登入：開始遊戲', want || '(目前選取的角色)'); return void clickBtn(play, rnd(3000, 4000)); }
      return;
    }
    const sp = $('#sp-play');
    if (visible(sp) && !sp.disabled && /開始遊戲|Jugar|Play/i.test(sp.textContent) && loginStep('play')) { log('自動登入：標題畫面'); return void clickBtn(sp, rnd(2500, 3500)); }
  }

  // ───────────────────────── 7. Run end ─────────────────────────
  function endTick(run) {
    if (!ready()) return;
    // v0.8.2：結算畫面「返回角色」還沒出來前，上方帳號列的「離開」(#pb-exit) 也看得到，按到會登出 → 等 5 秒才用文字找，且排除帳號列／標題畫面
    const late = Date.now() - (BOT.rs.overAt || Date.now()) > 5000;
    const b = (visible($('#btn-restart')) && $('#btn-restart')) || (late && $$('button').find((x) => visible(x) && !x.closest('#profile-bar,#splash') && /返回角色|回城|返回|回到|離開|城鎮/.test(x.innerText.trim())));
    if (b) {
      log('end of run →', b.innerText.trim());
      clickBtn(b, rnd(1500, 2500)); BOT.endHandled = true;
      H.nextEnterAt = Date.now() + cfg.reenterDelay * 1000 * rnd(0.8, 1.2); // 回城後先等一下再進關
    }
    else if (!BOT.endLogged) { BOT.endLogged = true; log('end screen buttons:', $$('button').filter(visible).map((x) => x.innerText.trim())); }
  }

  // ───────────────────────── 8. Main loop ─────────────────────────
  const queueText = () => $$('.ro-window').find((w) => visible(w) && /伺服器已滿|正在排隊|en cola|queue/i.test(w.innerText))?.innerText.replace(/\s+/g, ' ') || '';
  function inRun() {
    const r = BOT.run;
    // v0.8.2：被登出回到標題／選角畫面時，hook 裡的 run 還停在 over → 不算在關卡中，改走自動登入
    // v0.8.6：伺服器維修（.sp-maint-retry）、標題頁「開始遊戲」(#sp-play) 也算（維修斷線時 run 會一直停在 over）
    if (visible($('#sp-login')) || visible($('#sp-register')) || visible($('#btn-play')) || visible($('#sp-play')) || visible($('.sp-maint-retry'))) return null;
    if (queueText()) return null; // v0.9.4 伺服器額滿排隊中：也不算在關卡（以前狀態列一直顯示上一場的「關卡中 · over」）
    return r && r.player && !r.replayMoves && visible($('#lobby-ui')) === false ? r : null;
  }

  const on = (k) => !cfg.manual && !!cfg[k];
  BOT.timers.push(setInterval(() => {
    try {
      if (BOT.seq !== H.runSeq) { // new run started
        BOT.seq = H.runSeq; VISIT.clear(); BOT.phase = null; BOT.sweep = null; BOT.sweepEnd = Date.now(); BOT.leaving = false; BOT.endHandled = false; BOT.rs;
      }
      const run = inRun();
      if ((run && run.state === 'playing') || visible($('#lobby-ui'))) loginOk();
      if (run) {
        const st = run.state;
        const ph = phase();
        if (BOT.phase !== ph) {
          if (BOT.phase === 'hunt' && ph === 'farm') { log(BOT.rs.huntFailed ? '獵神失敗 → 切換' : '達成掛機條件 → 切換', effMode()); BOT.anchor = null; BOT.safeAnchorNext = true; steer.target = null; steer.path = null; }
          BOT.phase = ph;
        }

        // ① 自動戰鬥：移動 / 閃避 / 撿東西
        if (on('fight') && st === 'playing') { combatTick(run); BOT.driving = true; }
        else if (BOT.driving) { setMove(run, 0, 0); BOT.driving = false; } // touchMove keeps its last value → zero once

        // ② 自動選卡：升級技能、寶箱、交換確認、掉落展示
        if (on('pick')) {
          if (st === 'reveal') {
            // equipment / card / egg drop popup: already added to run loot; it closes itself after 4–8 s.
            // Click it after a short look to save time, unless it is a roll choice ([data-c]).
            const dr = $('#drop-reveal');
            if (visible(dr) && !$('[data-c]', dr)) {
              if (!BOT.revealAt) BOT.revealAt = Date.now();
              if (Date.now() - BOT.revealAt > rnd(1200, 1800)) { BOT.revealAt = 0; BOT.drops = (BOT.drops || 0) + 1; clickBtn(dr); }
            }
          } else if (st === 'levelup' && !$('#picker')?.classList.contains('closing')) { // 選完卡後 820ms 關閉動畫，期間點擊無效
            // swap confirmation ("是，交換") lives on the back of the card we just clicked
            const lp = BOT.lastPicked;
            const ok = ready() && lp && Date.now() - lp.at < 4000 && lp.el.isConnected && lp.el.parentElement?.querySelector('[data-yes]');
            if (ok) { BOT.lastPicked = null; clickBtn(ok); } else pickCard(run);
          }
        }

        // ②.4 自動繼續：不小心按到暫停（Esc / 切視窗）時，1~2 秒後按「繼續」
        if (on('autoResume') && (st === 'paused' || visible($('#pause'))) && !BOT.leaving) { // 組隊時暫停只開選單，state 不變
          if (!BOT.pausedAt) BOT.pausedAt = Date.now();
          else if (Date.now() - BOT.pausedAt > BOT.resumeDelay) {
            const b = $('#btn-resume');
            if (b) { log('自動繼續'); b.click(); }
            BOT.pausedAt = 0;
          }
        } else { BOT.pausedAt = 0; BOT.resumeDelay = rnd(1000, 2000); }

        // ②.48 v0.9.9 指定最終王：這場的最終王（關卡 MVP，加上伺服器開場決定的隱藏王 run.rareId）整場不會變。
        // 有勾到其中一隻才打；都沒勾到就在開場幾秒（隨機 3～8 秒，不要一進場就秒退）後結束這場，回城重進
        if (st === 'playing') learnBosses(run);
        // v0.9.10 在場內照常打隨機 fbWait.min～max 秒再離開；連續離開 fbMaxSkip 次後下一場照打（次數存 localStorage，重新整理也算）
        const fbWant = lines(cfg.finalBoss?.[stageOf(run)]);
        if (fbWant.length && on('loop') && st === 'playing' && !BOT.leaving && !BOT.rs.fbPlay) {
          const fin = finalBosses(run);
          if (fin.length && !fin.some((b) => fbWant.includes(b))) {
            const n = fbSkips();
            if (cfg.fbMaxSkip && n >= cfg.fbMaxSkip) { BOT.rs.fbPlay = `連續離開 ${n} 次，這場照打`; setFbSkips(0); log('最終王不符，但' + BOT.rs.fbPlay); }
            else {
              const lo = Math.max(0, +cfg.fbWait.min || 0), hi = Math.max(lo, +cfg.fbWait.max || 0);
              BOT.rs.fbLeaveAt ??= Math.round(rnd(lo, hi));
              if ((run.time || 0) >= BOT.rs.fbLeaveAt) { setFbSkips(n + 1); leaveRun(`最終王不是指定的（${fin.map(bossName).join('、')}），連續第 ${n + 1} 次`); }
            }
          } else if (fin.length) { BOT.rs.fbPlay = '最終王符合'; setFbSkips(0); }
        }

        // ②.5 獵目標失敗 → 放棄這場
        if (on('pick') && st === 'playing' && !BOT.leaving) {
          const why = huntGiveUp(run);
          if (why) {
            if (cfg.huntPhase.onFail === 'farm') { BOT.rs.huntFailed = why; log('獵神失敗 → 直接掛機：', why); }
            else leaveRun(why);
          }
        }

        if (st === 'playing') learnSkill(run);

        // ②.52 組隊掉落擲骰（Need / Greed / 放棄）
        if (on('pick')) rollTick();

        // ②.55 掉落紀錄（不論開關，看到掉落展示就記）
        captureReveal(run);
        noteMobs(run);
        if (st === 'over' || st === 'done') captureServerLoot(run);

        // ②.6 紀錄：拿到神祇的時間、結束時寫一筆
        if (huntActive() && huntDone() && BOT.rs.huntAt == null) BOT.rs.huntAt = run.time || 0;
        if (st === 'over' || st === 'done') {
          // 等結算標題出現再記（最多等 2 秒），用標題判斷 通關 / 死亡 / 放棄
          BOT.rs.overAt ||= Date.now();
          const title = $('#go-title')?.textContent.trim();
          if (!BOT.rs.logged && (title || Date.now() - BOT.rs.overAt > 2000)) { BOT.rs.logged = true; writeLog(run, title || ''); }
        }

        // ③ 自動進關：結算後返回廣場
        if ((st === 'over' || st === 'done') && on('loop')) endTick(run);
      } else if (on('loop') && !visible($('#lobby-ui')) && cfg.autoLogin) {
        loginTick();
      } else if (on('loop') && visible($('#lobby-ui'))) {
        lobbyTick();
      }
    } catch (e) { log('tick error', e); }
  }, 50));
  BOT.timers.push(setInterval(render, 500));
  BOT.timers.push(setInterval(() => { try { careTick(); } catch {} }, 30000));
  setTimeout(() => { try { careTick(); } catch {} }, 1500);

  // ───────────────────────── 9. Panel UI ─────────────────────────
  // 分頁：控制 / 關卡 / 選卡 / 寶箱；內容區最高 = 視窗高度，超出可捲動；狀態列固定在底部
  let panel;
  const listVal = (a) => (a || []).join('\n');
  const parseList = (v) => v.split('\n').map((x) => x.trim()).filter(Boolean);

  // ── 宣告式綁定 ──
  // data-k="路徑"：checkbox / number / select / range 直接對應 cfg 的值
  // data-list="路徑"：textarea 一行一個
  // data-show="條件"：路徑為真才顯示；"路徑=值" 比對；前面加 ! 反向
  const pathOf = (p) => p.split('.');
  function getP(p) { return pathOf(p).reduce((o, k) => (o == null ? undefined : o[k]), cfg); }
  function setP(p, v) {
    const ks = pathOf(p); let o = cfg;
    for (const k of ks.slice(0, -1)) o = o[k] ??= {};
    o[ks[ks.length - 1]] = v;
  }
  function showOk(expr) {
    const neg = expr.startsWith('!'); if (neg) expr = expr.slice(1);
    if (expr === '@idle') return (cfg.gate.on || cfg.mode === 'idle') !== neg; // 先巡邏再掛機也會原地掛機
    if (expr === '@roam') return (cfg.gate.on || cfg.mode === 'roam') !== neg; // 巡邏＝遊走
    const [p, v] = expr.split('=');
    const val = getP(p);
    const ok = v === undefined ? !!val : String(val) === v;
    return neg ? !ok : ok;
  }

  const SEC = (title, body, open, scope = '') => `<details class="dt" data-dt="${title}"${open ? ' open' : ''}><summary>${title}${scope ? `<span class="scope">${scope}</span>` : ''}</summary><div class="dtb">${body}</div></details>`;
  const LEGEND = (want = '優先，越上面越先', focus = '專注，之後更常出現', ban = '放逐，絕不選') => `<div class="hint ileg">🎯 ${want}${focus ? `　★ ${focus}` : ''}　✕ ${ban}</div>`;
  const NUM = (k, w = 44, min = 0, step = 1) => `<input type="number" data-k="${k}" min="${min}" step="${step}" style="width:${w}px">`;
  const CHK = (k, label, hint = '') => `<label><input type="checkbox" data-k="${k}">${label}${hint ? ` <span class="hint">${hint}</span>` : ''}</label>`;
  const RADIO = (k, opts) => opts.map(([v, t]) => `<label><input type="radio" name="rb-${k}" data-k="${k}" value="${v}">${t}</label>`).join('');
  const SELECT = (k, opts) => `<select data-k="${k}">${opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`;
  const LIST = (k, ph, h = 46) => `<textarea data-list="${k}" style="height:${h}px" placeholder="${ph}"></textarea>`;
  const PERKS = [['reroll_card', '單張'], ['reroll', '全部'], ['banish', '放逐'], ['focus', '專注']];
  const PERKROW = (k) => `<table class="pk"><thead><tr>${PERKS.map(([, t]) => `<th>${t}</th>`).join('')}</tr></thead><tbody><tr>${PERKS.map(([p]) => `<td>${NUM(`perks.${k}.${p}`, 38)}</td>`).join('')}</tr></tbody></table>`;

  function buildPanel() {
    document.getElementById('robot-panel')?.remove();
    panel = document.createElement('div');
    panel.id = 'robot-panel';
    let pos = {};
    try { pos = JSON.parse(localStorage.getItem('roBot.pos') || '{}'); } catch {}
    panel.style.left = (pos.left ?? 12) + 'px';
    panel.style.top = (pos.top ?? 70) + 'px';
    if (pos.w) panel.style.width = pos.w + 'px'; // v0.7.5 面板可拖右下角調整大小，記住寬高
    if (pos.h) panel.style.height = pos.h + 'px';
    const savePos = () => { try { const o = { left: panel.offsetLeft, top: panel.offsetTop }; if (!panel.classList.contains('min')) { o.w = panel.offsetWidth; o.h = panel.offsetHeight; } else { const old = JSON.parse(localStorage.getItem('roBot.pos') || '{}'); o.w = old.w; o.h = old.h; } localStorage.setItem('roBot.pos', JSON.stringify(o)); } catch {} };
    panel.innerHTML = `
<style>
#robot-panel{position:fixed;z-index:2147483647;box-sizing:border-box;width:240px;min-width:240px;min-height:140px;max-width:calc(100vw - 8px);max-height:calc(100vh - 16px);resize:both;overflow:hidden;display:flex;flex-direction:column;font:12px/1.4 system-ui,sans-serif;color:#1d2a44;background:rgba(255,255,255,.97);border:1px solid #9fb3d9;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.25);user-select:none}
#robot-panel *{box-sizing:border-box}
#robot-panel header{cursor:move;padding:5px 8px;background:#5b8def;color:#fff;border-radius:7px 7px 0 0;display:flex;align-items:center;gap:6px;font-weight:600}
#robot-panel header .sp{flex:1}
#robot-panel header button{all:unset;cursor:pointer;padding:0 4px;font-size:13px}
#robot-panel .pf{display:flex;align-items:center;gap:3px;padding:4px 6px;background:#eef2fa;border-bottom:1px solid #d5def0}
#robot-panel .pf select{flex:1;min-width:0;font:inherit;font-weight:600}
#robot-panel .pf button{all:unset;cursor:pointer;padding:0 3px;font-size:12px;border:1px solid #c5d2ea;border-radius:3px;background:#fff;line-height:18px}
#robot-panel header button.pw{padding:0 7px;border-radius:9px;background:rgba(255,255,255,.22);font-size:11px;line-height:18px;font-weight:600}
#robot-panel.manual header{background:#8a95a8}
#robot-panel.manual header button.pw{background:#d9534f}
#robot-panel .man-note{display:none;color:#c0392b}
#robot-panel.manual .man-note{display:block}
#robot-panel.manual .box.auto label{opacity:.45}
#robot-panel .il{display:grid;gap:3px}
#robot-panel .il-rows{display:grid;gap:2px}
#robot-panel .ir{display:flex;align-items:center;gap:4px;font-size:12px;padding:1px 4px;border:1px solid #dfe6f3;border-radius:4px;background:#fff}
#robot-panel .ir.w{border-color:#b9cdf3;background:#f3f7ff}
#robot-panel .ir.b .nm{color:#999;text-decoration:line-through}
#robot-panel .ir .no{color:#5b8def;min-width:14px;font-size:11px}
#robot-panel .ir .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}
#robot-panel .ir button{all:unset;cursor:pointer;padding:0 4px;line-height:18px;border-radius:3px;color:#456;opacity:.35}
#robot-panel .ir button.on{opacity:1;background:#5b8def;color:#fff}
#robot-panel .ir button[data-s=ban].on{background:#d9534f}
#robot-panel .ir .mv button{opacity:.8}
#robot-panel .ir .mv button[disabled]{opacity:.15;cursor:default}
#robot-panel .ir .del{opacity:.5;width:22px;padding:0;text-align:center;box-sizing:border-box;flex:none}
#robot-panel .il-add{display:flex;gap:4px}
#robot-panel #rb-upg .ir[draggable=true]{cursor:grab}
#robot-panel #rb-upg .grip{width:10px;color:#8aa3cf}
#robot-panel #rb-upg .ir.drag{opacity:.4}
#robot-panel #rb-upg .ir.over{border-color:#5b8def;box-shadow:inset 0 2px 0 #5b8def}

#robot-panel .il-add input{flex:1;min-width:0}
#robot-panel .il-add button{all:unset;cursor:pointer;padding:0 6px;border:1px solid #9fb3d9;border-radius:4px;background:#fff;font-size:12px}
#robot-panel details.dt>summary .scope{float:right;margin-left:6px}
#robot-panel .dorder{display:grid;gap:2px}
#robot-panel .dor{display:flex;align-items:center;gap:5px;font-size:12px;padding:1px 4px;border:1px solid #dfe6f3;border-radius:4px;background:#fff}
#robot-panel .dor b{color:#5b8def;min-width:12px}
#robot-panel .dor span{flex:1}
#robot-panel .dor button{all:unset;cursor:pointer;padding:0 5px;color:#456}
#robot-panel .dor button[disabled]{opacity:.25;cursor:default}
#robot-panel .gear{display:grid;gap:3px;border-top:1px dashed #d5dcea;padding-top:4px}
#robot-panel .gchips{display:flex;flex-wrap:wrap;gap:3px}
#robot-panel .gchip{all:unset;cursor:pointer;font-size:10px;line-height:16px;padding:0 6px;border:1px solid #c5d2ea;border-radius:8px;color:var(--c,#456);background:#fff}
#robot-panel .gchip.on{background:var(--c,#5b8def);border-color:var(--c,#5b8def);color:#fff}
#robot-panel .glist{max-height:280px;overflow:auto;display:grid;gap:2px}
#robot-panel .gi{font-size:11px;line-height:1.35;padding:2px 3px;border-bottom:1px solid #eef1f7;text-align:left}
#robot-panel .gi .hint{font-size:10px}
#robot-panel .gi>.hint{text-align:left}
#robot-panel .scope{justify-self:end;font-size:10px;color:#6a7a99;background:#eef2fa;border-radius:3px;padding:0 5px}
#robot-panel nav{display:flex;border-bottom:1px solid #d5def0}
#robot-panel nav button{all:unset;flex:1;text-align:center;padding:5px 0;cursor:pointer;color:#556}
#robot-panel nav button.on{color:#2b5fd9;font-weight:600;box-shadow:inset 0 -2px #5b8def}
#robot-panel .body{overflow-y:auto;min-height:0;flex:1;padding:6px 8px}
#robot-panel .pg{display:none;gap:6px}
#robot-panel .pg.on{display:grid}
#robot-panel label{display:flex;align-items:center;flex-wrap:wrap;gap:2px 5px;white-space:nowrap}
#robot-panel label>.hint{flex-basis:100%;padding-left:18px;line-height:1.3;margin-top:-4px}
#robot-panel select{flex:1;min-width:0;font:inherit}
#robot-panel input[type=number]{font:inherit}
#robot-panel textarea{width:100%;resize:vertical;font:inherit}
#robot-panel .r{display:grid;grid-template-columns:56px 1fr 36px;align-items:center;gap:4px}
#robot-panel .r input{width:100%}
#robot-panel .grid2{display:grid;grid-template-columns:1fr 1fr;gap:3px 8px}
#robot-panel .box{padding:6px;background:#f3f6fc;border-radius:5px;display:grid;gap:5px}
#robot-panel .h{font-weight:600;color:#2b3f66}
#robot-panel .hint{font-size:11px;color:#778;white-space:normal;text-align:left}
#robot-panel .st{font-size:11px;color:#445;white-space:pre-line;background:#eef2fa;padding:5px 8px;border-top:1px solid #d5def0;border-radius:0 0 7px 7px}
#robot-panel .btn{all:unset;cursor:pointer;text-align:center;padding:3px 6px;border:1px solid #9fb3d9;border-radius:4px;background:#fff}
#robot-panel.min .pf,#robot-panel.min nav,#robot-panel.min .body{display:none}
#robot-panel.min{height:auto!important;min-height:0;resize:none}
#robot-panel details.dt{border:1px solid #d5def0;border-radius:5px}
#robot-panel details.dt summary{cursor:pointer;padding:4px 6px;font-weight:600;color:#2b3f66;background:#f3f6fc;border-radius:5px}
#robot-panel details.dt .dtb{display:grid;gap:5px;padding:6px}
#robot-panel table.pk{width:100%;border-collapse:collapse;font-size:12px}
#robot-panel table.pk th{font-weight:600;color:#556;font-size:11px;padding:2px;text-align:center}
#robot-panel table.pk td{padding:2px;text-align:center}
#robot-panel table.pk input{width:38px}
#robot-panel table.lg{width:100%;border-collapse:collapse;font-size:11px}
#robot-panel table.lg th{text-align:left;color:#556;font-weight:600;border-bottom:1px solid #d5def0;padding:2px}
#robot-panel table.lg td{padding:2px;border-bottom:1px solid #eef2fa;white-space:nowrap}
#robot-panel .seg{display:inline-flex;border:1px solid #9fb3d9;border-radius:4px;overflow:hidden}
#robot-panel .seg button{all:unset;cursor:pointer;padding:0 5px;font-size:11px;line-height:18px;color:#667}
#robot-panel .seg button.on{background:#5b8def;color:#fff}
#robot-panel .seg button[data-v=ban].on{background:#d9534f}
</style>
<header><span>RO Bot</span><small id="rb-ver" style="opacity:.8"></small><span class="sp"></span>
  <button id="rb-manual" class="pw" title="F8：bot 全部停止／恢復，下面的設定都不變"></button>
  <button id="rb-reload" title="從硬碟重新載入 bot（不用刷新頁面）">⟳</button><button id="rb-min" title="收合">－</button></header>
<div class="pf"><span>設定檔</span><select id="rb-prof"></select>
  <button id="rb-pnew" title="新增（預設值）">＋</button><button id="rb-pcopy" title="複製目前設定檔">⧉</button><button id="rb-pren" title="改名">✎</button><button id="rb-pdel" title="刪除">🗑</button></div>
<nav>${[['main', '玩法'], ['stage', '關卡'], ['skill', '技能'], ['chest', '寶箱'], ['log', '紀錄'], ['sys', '⚙']].map(([k, t]) => `<button data-tab="${k}">${t}</button>`).join('')}</nav>
<div class="body">

  <div class="pg" data-pg="main">
    <div class="box auto">
      <div class="h" style="display:flex">自動做哪些事<span class="sp" style="flex:1"></span><span class="scope">共用</span></div>
      <div class="hint man-note">✋ 手動中，下面勾的都不會執行（按標題列「✋ 手動」恢復）</div>
      ${CHK('fight', '戰鬥', '移動・閃怪・撿東西')}
      ${CHK('pick', '選卡', '技能・寶箱・擲骰')}
      ${CHK('loop', '進關', '隊長→關卡→結算回城')}
    </div>
    <div class="scope">以下跟著設定檔</div>
    <div class="box">
      <label class="h">玩法 <select id="rb-flow">
        <option value="gate">先巡邏，再原地掛機</option>
        <option value="idle">一開始就原地掛機</option>
        <option value="roam">一直遊走</option></select></label>
      <div data-show="gate.on" style="display:grid;gap:5px">
        <div class="hint">巡邏＝遊走打怪撿東西。下列勾的都做到，才切換原地掛機：</div>
        ${CHK('gate.deity', '拿到🎯神祇', '目標和放棄條件在「寶箱」頁')}
        ${CHK('gate.skillOn', '學到技能優先序')}
        <div data-show="gate.skillOn" style="display:grid;gap:4px;padding-left:18px">
          <label>前 ${NUM('gate.skillTop', 38, 1)} 個都升到 Lv ${NUM('gate.skillLv', 38, 1)} 以上</label>
          <label>最多等 ${NUM('gate.skillMaxMin', 38)} 分鐘 <span class="hint">沒出現這個技能時（隨機），時間到就直接掛機；0＝一直等</span></label>
          <div class="hint" id="rb-gskl"></div>
        </div>
      </div>
    </div>
    <div data-show="@idle" style="display:grid">${SEC('原地掛機細節', `
      <div class="hint">會去撿：</div>
      <div class="grid2">
        ${CHK('idleKinds.chest', '寶箱')}${CHK('idleKinds.loot', '裝備/卡/蛋')}
        ${CHK('idleKinds.magnet', '磁鐵')}${CHK('idleKinds.meat', '肉')}
        ${CHK('idleKinds.zeny', 'zeny')}
      </div>
      <label>撿東西範圍 ${NUM('idleRadius', 56, 100, 100)}</label>
      <label>寶箱範圍 ${NUM('idleChestRange', 56, 100, 100)}</label>
      ${CHK('idleDodge', '站著時也閃怪')}
      ${CHK('sweep.on', '定時去撿經驗一圈')}
      <div data-show="sweep.on" class="grid2">
        <label>每 ${NUM('sweep.every', 38, 5)} 秒</label><label>最多 ${NUM('sweep.maxSec', 38, 2)} 秒</label>
        <label>資源 ≥ ${NUM('sweep.minValue', 38, 1)}</label><label>範圍 ${NUM('sweep.radius', 46, 200, 100)}</label>
      </div>
      <button class="btn" id="rb-anchor" type="button">把目前位置設為原點</button>`)}</div>
    <div data-show="@roam" style="display:grid">${SEC('遊走細節', `
      <label>閃怪距離 ${NUM('dangerR', 50, 50, 10)}</label>
      ${CHK('lootChest', '錢夠就去開寶箱')}
      <label>zeny 單筆 ≥ ${NUM('zenyMin', 46, 0, 10)} 才特地去撿</label>`)}</div>
    <div class="hint">F8 或標題列的「▶ 自動中／✋ 手動」：bot 全部停止／恢復，設定都不變</div>
  </div>

  <div class="pg" data-pg="stage">
    <div class="scope">關卡、難度跟著設定檔；其他共用</div>
    <label>關卡 <select data-k="stage">${STAGES.map((s) => `<option value="${s}">${s === FEST ? '燈籠節（季節活動）' : s}</option>`).join('')}</select></label>
    <div class="hint" data-show="stage=燈籠節">燈籠節從廣場的「節慶主持人」進入；沒有難度可調，打王掉扭蛋（不掉裝備）</div>
    <div id="rb-fboss"></div>
    <div id="rb-fbopt" style="display:none">
      <div class="hint">沒遇到勾選的最終王時</div>
      <label>在場內照常打 ${NUM('fbWait.min', 44)} ～ ${NUM('fbWait.max', 44)} 秒後離開 <span class="hint">隨機；回城後照「結算後等幾秒再進關」重進</span></label>
      <label>連續離開 ${NUM('fbMaxSkip', 38)} 次後，下一場照打 <span class="hint">0＝不限</span></label>
    </div>
    ${DIFF.map((d, i) => `<div class="r"><span>${d.name}</span><input type="range" data-k="diff.${i}" min="${d.min}" max="${d.max}" step="0.05"><span id="rb-dv${i}"></span></div>`).join('')}
    <label>打 ${NUM('maxRuns', 44)} 場後停止 <span class="hint">0＝不停</span></label>
    <label>結算後等 ${NUM('reenterDelay', 44, 0, 5)} 秒再進關</label>
    ${CHK('autoResume', '自動繼續', '誤按暫停時')}
  </div>

  <div class="pg" data-pg="skill">
    ${SEC('技能', `
      ${LEGEND()}
      ${ILIST('skill', '技能名稱，例：神聖之光')}
      <div class="h">升級項目順序 <span class="hint">同時出現上面清單裡的技能升級時，先比強化項目，同項目再照技能順序；沒學過的優先技能永遠最先。輸入卡片上的強化文字（模糊比對，例：目標、冷卻、脈衝），拖曳（或 ▲▼）排順序；空白＝只照技能順序</span></div>
      <div class="il"><div id="rb-upg" class="il-rows"></div>
        <div id="rb-upg-add" style="display:flex;gap:4px"><input type="text" list="rb-upg-dl" style="flex:1;min-width:0" placeholder="強化文字，例：目標、冷卻、脈衝"><button type="button">＋ 新增</button></div>
        <datalist id="rb-upg-dl"></datalist></div>
      <div class="h">重抽次數 <span class="hint">每場最多；沒出現優先的技能時用來換卡，0＝不用</span></div>
      ${PERKROW('skill')}`, true, '設定檔')}
    <div class="hint perkleft"></div>
  </div>

  <div class="pg" data-pg="chest">
    <div class="hint">開寶箱時先看神祇，再看其他卡。重抽次數是遊戲每場共用的，技能頁也會用到</div>
    ${SEC('🎯 神祇', `
      ${LEGEND('目標，越上面越先（出現就專注；沒出現就重抽神祇卡）', '', '放逐，絕不選')}
      ${ILIST('deity', '清單外的神祇，例：神聖之光')}
      ${CHK('deitySwapUp', '已拿到後，出現更優先的也換上去', '換了原本的精煉 +N 會歸零')}
      ${CHK('deityRerollAll', '三張都沒有神祇時也「重抽全部」')}
      <div class="h">重抽次數 <span class="hint">每場最多</span></div>
      ${PERKROW('deity')}
      ${CHK('perks.huntAll', '獵神時全部先給神祇', '拿到後才照各自的次數')}
      <div class="h">找不到時 <span class="hint">玩法頁勾「拿到🎯神祇」才有作用；0＝不看這個條件</span></div>
      <label>開了 ${NUM('huntLeaveChests', 40)} 個寶箱</label>
      <label>或打了 ${NUM('huntLeaveMin', 40)} 分鐘</label>
      <label>或錢不夠開寶箱 ${NUM('huntPoorSec', 40, 0, 10)} 秒</label>
      <div>還沒拿到就：</div>
      ${RADIO('huntPhase.onFail', [['leave', '離開這場重來'], ['farm', '放棄神祇，照常掛機']])}
    `, true, '設定檔')}
    ${SEC('其他寶箱卡', `
      ${LEGEND()}
      ${ILIST('chest', '比對卡片文字，例：詠唱速度、傳說')}
      <label>品質 ≥ ${SELECT('chestMinQ', QUALITY.map((q) => [q, q]))} 才選，不到就重抽</label>
      ${CHK('chestAvoidSwap', '盡量不換掉身上的裝備')}
      <div class="h">重抽次數 <span class="hint">每場最多</span></div>
      ${PERKROW('chest')}
    `, true, '設定檔')}
    ${SEC('👥 組隊擲骰', `
      <label>${SELECT('roll.mode', [['off', '自己按'], ['pass', '全部放棄'], ['greed', '全部 Greed'], ['need', '全部 Need'], ['rule', '依規則']])}</label>
      <div data-show="roll.mode=rule" style="display:grid;gap:4px">
        <label>品質 ≥ ${SELECT('roll.needQ', QUALITY.map((q) => [q, q]))} 就 Need</label>
        <label>卡片 ${SELECT('roll.card', [['rule', '照品質'], ['need', 'Need'], ['greed', 'Greed'], ['pass', '放棄']])}</label>
        <label>其他 ${SELECT('roll.other', [['greed', 'Greed'], ['pass', '放棄'], ['need', 'Need']])}</label>
        ${LEGEND('一定 Need', '', '一定放棄')}
        ${ILIST('roll', '裝備名稱，例：Tidal Shoes')}
      </div>
    `, false, '設定檔')}
    <div class="hint perkleft"></div>
  </div>

  <div class="pg" data-pg="sys">
    ${SEC('帳號與自動登入', `
      ${CHK('autoLogin', '重新整理後自動回到遊戲', '登入→選角色→大廳')}
      <div data-show="autoLogin" style="display:grid;gap:4px">
        <label>角色 <input type="text" data-k="char" style="flex:1;min-width:0"> <span class="hint">跟著設定檔</span></label>
        <div class="hint">要跟選角畫面的名稱一樣；空白＝自動記住上次按「開始遊戲」的角色。找不到這個角色時會停在選角畫面，不會用別的角色進遊戲</div>
        <label>帳號 <input id="rb-cu" type="text" autocomplete="off" spellcheck="false" style="flex:1;min-width:0"></label>
        <label>密碼 <input id="rb-cp" type="password" autocomplete="new-password" style="flex:1;min-width:0"></label>
        <div><button class="btn" id="rb-csave" type="button">儲存帳號密碼</button> <button class="btn" id="rb-cclr" type="button">清除</button> <span class="hint" id="rb-cst"></span></div>
        <div class="hint">被登出時自動登入。存在擴充功能裡，遊戲網頁讀不到；密碼以明碼存在這台電腦的 Chrome 設定檔。登入失敗會停下，重試會越等越久</div>
      </div>`, true, '共用')}
    ${SEC('長時間掛機', `
      ${CHK('noDiscard', '分頁不被 Chrome 釋放')}
      ${CHK('keepAwake', '掛機時電腦保持清醒', '螢幕不關、不自動鎖定')}
      ${CHK('autoRestore', '被最小化時自動還原視窗')}
      <button class="btn" id="rb-popout" type="button">把遊戲移到獨立視窗</button>
      <div class="hint">遊戲分頁被切走、最小化、被完全蓋住時遊戲會停住；請讓它單獨一個視窗並露出來</div>`, true, '共用')}
  </div>

  <div class="pg" data-pg="log">
    <div id="rb-log" style="display:grid;gap:5px"></div>
    <div style="display:flex;gap:6px"><button class="btn" id="rb-lexp" type="button" style="flex:1">匯出場次</button><button class="btn" id="rb-dexp" type="button" style="flex:1">匯出掉落</button><button class="btn" id="rb-lclr" type="button">清除</button></div>
    <div class="hint">每場結束自動記錄（存在這個瀏覽器）。滑鼠移到「放棄」看原因</div>
  </div>
</div>
<div class="st" id="rb-st"></div>`;
    document.documentElement.appendChild(panel);
    // keep the game from reading keys typed into the panel
    for (const t of ['keydown', 'keyup', 'keypress']) panel.addEventListener(t, (e) => { if (e.key !== 'F8') e.stopPropagation(); });
    const g = (id) => panel.querySelector('#' + id);

    // 宣告式綁定
    panel.querySelectorAll('[data-k]').forEach((el) => {
      const k = el.dataset.k;
      const ev = el.type === 'range' || el.type === 'checkbox' || el.tagName === 'SELECT' ? (el.type === 'range' ? 'oninput' : 'onchange') : 'onchange';
      el[ev] = () => {
        let v = el.type === 'checkbox' ? el.checked : el.type === 'number' || el.type === 'range' ? Math.max(+el.min || 0, +el.value || 0) : el.value;
        setP(k, v);
        if (k === 'gate.deity' && v && !cfg.huntLeaveChests && !cfg.huntLeaveMin && !cfg.huntPoorSec) cfg.huntPoorSec = 60;
        save(); render();
      };
    });
    panel.querySelectorAll('[data-list]').forEach((el) => { el.oninput = () => { setP(el.dataset.list, parseList(el.value)); save(); }; });
    g('rb-flow').onchange = (e) => {
      const v = e.target.value;
      if (v === 'gate') { cfg.gate.on = true; cfg.gate.after = 'idle'; if (!cfg.gate.skillOn && !cfg.gate.deity) cfg.gate.skillOn = true; }
      else { cfg.gate.on = false; cfg.mode = v; }
      BOT.anchor = null; save(); render(true);
    };
    panel.addEventListener('click', onListClick);
    panel.addEventListener('change', onFBoss);
    panel.addEventListener('click', onUpgClick);
    panel.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.closest?.('#rb-upg-add')) { ev.preventDefault(); upgAdd(); } });
    for (const t of ['dragstart', 'dragover', 'drop', 'dragend']) panel.addEventListener(t, onUpgDrag);
    panel.querySelectorAll('.il-add input').forEach((inp) => { inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ilAdd(inp.closest('.il')); } }; });
    // 摺疊區塊記住開合（每個瀏覽器）
    panel.querySelectorAll('details.dt').forEach((d) => {
      try { if (localStorage.getItem('roBot.dt.' + d.dataset.dt) === '1') d.open = true; } catch {}
      d.ontoggle = () => { try { localStorage.setItem('roBot.dt.' + d.dataset.dt, d.open ? '1' : '0'); } catch {} };
    });
    panel.querySelectorAll('nav button').forEach((b) => { b.onclick = () => { cfg.tab = b.dataset.tab; save(); render(true); }; });
    // 帳號密碼：不走 cfg（不進 localStorage），透過背景頁存在 chrome.storage.local；面板只顯示帳號
    const credShow = () => { g('rb-cst').textContent = BOT.credUser ? `已儲存：${BOT.credUser}` : '尚未儲存'; if (BOT.credUser && document.activeElement !== g('rb-cu')) g('rb-cu').value = BOT.credUser; };
    extMsg({ type: 'cred:get' }, (r) => { BOT.credUser = r?.user || ''; credShow(); });
    g('rb-csave').onclick = () => {
      const u = g('rb-cu').value.trim(), pw = g('rb-cp').value;
      if (!u || !pw) { g('rb-cst').textContent = '帳號密碼都要填'; return; }
      extMsg({ type: 'cred:set', u, p: pw }, (r) => {
        g('rb-cp').value = '';
        if (!r?.ok) { g('rb-cst').textContent = '儲存失敗：' + (r?.error || '') + '（擴充功能要先 ⟳ 或到 chrome://extensions 按 ↻）'; return; }
        BOT.credUser = u; lgSave({}); BOT.loginErr = null; credShow(); // 重新存帳密＝使用者處理過了，節流紀錄清空
      });
    };
    g('rb-cclr').onclick = () => extMsg({ type: 'cred:clear' }, () => { BOT.credUser = ''; g('rb-cu').value = ''; g('rb-cp').value = ''; credShow(); });
    g('rb-manual').onclick = () => setManual(!cfg.manual);
    g('rb-popout').onclick = () => extMsg({ type: 'popout' }, (r) => { panel.querySelector('#rb-st').textContent = r?.ok ? (r.alone ? '已經是獨立視窗了' : '已移到獨立視窗') : '失敗：' + (r?.error || '請先重新載入擴充功能'); });
    g('rb-anchor').onclick = () => { const P = BOT.run?.player; if (P) BOT.anchor = { x: P.x, y: P.y }; render(); };
    g('rb-min').onclick = () => panel.classList.toggle('min');
    g('rb-reload').onclick = hotReload;
    g('rb-prof').onchange = (e) => switchProfile(e.target.value);
    g('rb-pnew').onclick = () => { const n = prompt('新設定檔名稱（例：弓箭手、騎士-刷洞穴）'); if (n && !newProfile(n)) alert('名稱重複或空白'); };
    g('rb-pcopy').onclick = () => { const n = prompt(`複製「${STORE.activeProfile}」為新設定檔，名稱：`, STORE.activeProfile + ' 複製'); if (n && !newProfile(n, STORE.activeProfile)) alert('名稱重複或空白'); };
    g('rb-pren').onclick = () => { const n = prompt('改名為：', STORE.activeProfile); if (n && n !== STORE.activeProfile && !renameProfile(n)) alert('名稱重複或空白'); };
    g('rb-pdel').onclick = () => { if (profileNames().length <= 1) return alert('至少要保留一個設定檔'); if (confirm(`刪除設定檔「${STORE.activeProfile}」？`)) deleteProfile(); };
    g('rb-lexp').onclick = exportLog;
    g('rb-dexp').onclick = exportDrops;
    g('rb-lclr').onclick = () => { if (confirm('清除所有場次與掉落紀錄？')) { saveLog([]); saveDrops([]); renderLog(true); } };

    // drag (kept inside the viewport, position remembered)
    const h = panel.querySelector('header');
    h.onpointerdown = (e) => {
      if (e.target.tagName === 'BUTTON') return;
      const ox = e.clientX - panel.offsetLeft, oy = e.clientY - panel.offsetTop;
      const mv = (ev) => {
        panel.style.left = Math.max(0, Math.min(innerWidth - 60, ev.clientX - ox)) + 'px';
        panel.style.top = Math.max(0, Math.min(innerHeight - 30, ev.clientY - oy)) + 'px';
        panel.style.maxHeight = innerHeight - panel.offsetTop - 8 + 'px';
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', () => {
        window.removeEventListener('pointermove', mv);
        savePos();
      }, { once: true });
    };
    const fit = () => {
      panel.style.left = Math.max(0, Math.min(innerWidth - 60, panel.offsetLeft)) + 'px';
      panel.style.top = Math.max(0, Math.min(innerHeight - 30, panel.offsetTop)) + 'px';
      panel.style.maxHeight = innerHeight - panel.offsetTop - 8 + 'px'; // body scrolls instead of overflowing
    };
    window.addEventListener('resize', fit);
    // 拖右下角改大小（CSS resize）→ 放開時有變才記住；切分頁造成的高度變化不記
    panel.addEventListener('pointerdown', (e) => {
      const r = panel.getBoundingClientRect();
      if (e.clientX < r.right - 18 || e.clientY < r.bottom - 18) return;
      const w0 = panel.offsetWidth, h0 = panel.offsetHeight;
      window.addEventListener('pointerup', () => { if (panel.offsetWidth !== w0 || panel.offsetHeight !== h0) savePos(); }, { once: true });
    });
    BOT.cleanup.push(() => window.removeEventListener('resize', fit));
    fit();
    render(true);
  }

  function hotReload() {
    const id = document.documentElement.dataset.robotExt;
    const st = panel.querySelector('#rb-st');
    if (!id || !window.chrome?.runtime?.sendMessage) {
      st.textContent = '熱更新尚未啟用：裝好 v0.4 後需要再重新整理頁面一次。';
      return;
    }
    st.textContent = '重新載入中…';
    try {
      chrome.runtime.sendMessage(id, { type: 'reload' }, () => {
        if (chrome.runtime.lastError) st.textContent = '重新載入失敗：' + chrome.runtime.lastError.message;
      });
    } catch (e) { st.textContent = '重新載入失敗：' + e.message; }
  }

  // ── v0.9.0 統一清單：技能、神祇、其他寶箱卡、組隊擲骰都用同一種表格
  // 每列：名稱｜🎯 優先（越上面越先）｜★ 專注｜✕ 放逐｜▲▼｜🗑；最下面「＋ 新增」。資料仍存在原本的設定（陣列），不用另外轉換
  const ILEG = { want: '🎯', focus: '★', ban: '✕' };
  function arrList(w, f, b, opt = {}) {
    const get = (k) => (k ? lines(getP(k)) : []), put = (k, v) => k && setP(k, v);
    return {
      focus: !!f, ban: !!b, order: opt.order !== false,
      rows() {
        const W = get(w), F = get(f), B = get(b);
        return [...new Set([...W, ...F, ...B])].map((n) => ({ n, want: W.indexOf(n), focus: F.includes(n), ban: B.includes(n), del: true }));
      },
      toggle(n, st) {
        const W = get(w), F = get(f), B = get(b), has = { want: W, focus: F, ban: B }[st].includes(n);
        if (st === 'want') put(w, has ? W.filter((x) => x !== n) : [...W, n]);
        if (st === 'focus') put(f, has ? F.filter((x) => x !== n) : [...F, n]);
        if (st === 'ban') put(b, has ? B.filter((x) => x !== n) : [...B, n]);
        if (!has && st === 'ban') { put(w, W.filter((x) => x !== n)); put(f, F.filter((x) => x !== n)); } // 放逐就不會又優先／專注
        if (!has && st !== 'ban') put(b, B.filter((x) => x !== n));
      },
      move(n, d) { const W = get(w), i = W.indexOf(n), j = i + d; if (i < 0 || j < 0 || j >= W.length) return; [W[i], W[j]] = [W[j], W[i]]; put(w, W); },
      add(n) { if (!this.rows().some((r) => r.n === n)) put(w, [...get(w), n]); },
      del(n) { for (const k of [w, f, b]) put(k, get(k).filter((x) => x !== n)); },
    };
  }
  const IL = {
    skill: arrList('priority', 'skillFocus', 'skillBanish'),
    chest: arrList('chestPriority', 'chestFocus', 'chestBanish'),
    roll: arrList('roll.needList', null, 'roll.passList', { order: false }),
    deity: {
      focus: false, order: true,
      rows() {
        const W = deityWant(), ex = lines(cfg.deityExtra);
        return [...new Set([...W, ...DEITIES, ...ex])].map((n) => ({ n, want: W.indexOf(n), focus: false, ban: cfg.deity[n] === 'ban', del: ex.includes(n) && !DEITIES.includes(n) }));
      },
      toggle(n, st) { cfg.deity[n] = cfg.deity[n] === st ? 'none' : st; },
      move(n, d) { const W = deityWant(), i = W.indexOf(n), j = i + d; if (i < 0 || j < 0 || j >= W.length) return; [W[i], W[j]] = [W[j], W[i]]; cfg.deityOrder = W; },
      add(n) { if (!DEITIES.includes(n) && !lines(cfg.deityExtra).includes(n)) cfg.deityExtra = [...lines(cfg.deityExtra), n]; cfg.deity[n] = 'want'; },
      del(n) { cfg.deityExtra = lines(cfg.deityExtra).filter((x) => x !== n); delete cfg.deity[n]; cfg.deityOrder = (cfg.deityOrder || []).filter((x) => x !== n); },
    },
  };
  const ilRows = (k) => { const a = IL[k].rows(); return [...a.filter((r) => r.want >= 0).sort((x, y) => x.want - y.want), ...a.filter((r) => r.want < 0)]; };
  const htmlEsc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  function renderLists() {
    panel?.querySelectorAll('.il[data-il]').forEach((box) => {
      const k = box.dataset.il, L = IL[k], rows = ilRows(k), sig = JSON.stringify(rows);
      const list = box.querySelector('.il-rows');
      if (list.dataset.sig === sig) return;
      list.dataset.sig = sig;
      const nW = rows.filter((r) => r.want >= 0).length;
      list.innerHTML = rows.map((r, i) => `<div class="ir${r.want >= 0 ? ' w' : ''}${r.ban ? ' b' : ''}" data-i="${i}">
        <b class="no">${r.want >= 0 && L.order ? r.want + 1 : ''}</b><span class="nm">${htmlEsc(r.n)}</span>
        <span class="s3"><button type="button" data-s="want" class="${r.want >= 0 ? 'on' : ''}" title="優先">🎯</button>${L.focus ? `<button type="button" data-s="focus" class="${r.focus ? 'on' : ''}" title="專注">★</button>` : ''}${L.ban !== false ? `<button type="button" data-s="ban" class="${r.ban ? 'on' : ''}" title="放逐">✕</button>` : ''}</span>
        ${L.order ? `<span class="mv"><button type="button" data-mv="-1"${r.want > 0 ? '' : ' disabled'}>▲</button><button type="button" data-mv="1"${r.want >= 0 && r.want < nW - 1 ? '' : ' disabled'}>▼</button></span>` : ''}
        ${r.del ? '<button type="button" class="del" data-del title="移除">🗑</button>' : '<span class="del"></span>'}</div>`).join('')
        || '<div class="hint">還沒有項目，從下面新增</div>';
    });
  }
  function onListClick(ev) {
    const box = ev.target.closest?.('.il[data-il]'); if (!box) return;
    const k = box.dataset.il, L = IL[k];
    if (ev.target.closest('.il-add button')) return ilAdd(box);
    const row = ev.target.closest('.ir'); if (!row) return;
    const r = ilRows(k)[+row.dataset.i]; if (!r) return;
    const b = ev.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.s) L.toggle(r.n, b.dataset.s);
    else if (b.dataset.mv) L.move(r.n, +b.dataset.mv);
    else if (b.hasAttribute('data-del')) L.del(r.n);
    else return;
    save(); renderLists(); render();
  }
  function ilAdd(box) {
    const inp = box.querySelector('.il-add input'), n = inp.value.trim();
    if (!n) return;
    IL[box.dataset.il].add(n); inp.value = '';
    save(); renderLists(); render();
  }
  const ILIST = (k, ph) => `<div class="il" data-il="${k}"><div class="il-rows"></div><div class="il-add"><input type="text" placeholder="${ph}"><button type="button">＋ 新增</button></div></div>`;
  // v0.9.9 指定最終王（目前選的關卡；王表要先打過一場這個關卡才知道）
  function renderFBoss() {
    const box = panel?.querySelector('#rb-fboss'); if (!box) return;
    // v0.9.10 預設（這個關卡還沒設定過）＝全部勾（白素貞＋蛇王都打＝每場都打）
    const e = loadSB()[cfg.stage], want = fbDisplay(e);
    const ob = panel.querySelector('#rb-fbopt'); if (ob) ob.style.display = e ? '' : 'none';
    const sig = JSON.stringify([cfg.stage, e, want]); if (box.dataset.sig === sig) return; box.dataset.sig = sig;
    if (!e) { box.innerHTML = '<div class="hint">指定最終王：先打過一場這個關卡，才知道有哪些王</div>'; return; }
    const opt = [[e.mvp, 'MVP'], ...(e.rare ? [[e.rare, `隱藏王，約 ${Math.round((e.chance || 0) * 1000) / 10}% 的場次出現`]] : [])];
    box.innerHTML = `<div class="h">只打這些最終王 <span class="hint">預設全勾＝每場都打；這場的最終王（含伺服器開場決定的隱藏王）都沒勾到時，照下面的秒數離開重進，那場的掉落就沒了</span></div>`
      + opt.map(([id, h]) => `<label><input type="checkbox" data-fb="${htmlEsc(id)}"${want.includes(id) ? ' checked' : ''}>${htmlEsc(bossName(id))} <span class="hint">${h}</span></label>`).join('');
  }
  const fbDisplay = (e) => (cfg.finalBoss?.[cfg.stage] ? lines(cfg.finalBoss[cfg.stage]) : e ? [e.mvp, e.rare].filter(Boolean) : []);
  // v0.9.11 升級項目：自由輸入（cfg.skillUpg，依序），拖曳／▲▼ 排序、🗑 刪除；輸入建議＝常見 10 種＋看過的強化文字
  function renderUpg() {
    const box = panel?.querySelector('#rb-upg'); if (!box) return;
    const U = lines(cfg.skillUpg); let seen = []; try { seen = JSON.parse(localStorage.getItem(UPG_SEEN) || '[]'); } catch {}
    const sig = JSON.stringify([U, seen]); if (box.dataset.sig === sig) return; box.dataset.sig = sig;
    box.innerHTML = U.map((n, i) => `<div class="ir w" draggable="true" data-upg="${htmlEsc(n)}">
      <span class="grip" title="拖曳排序">⠿</span><b class="no">${i + 1}</b><span class="nm">${htmlEsc(n)}</span>
      <span class="mv"><button type="button" data-umv="-1"${i > 0 ? '' : ' disabled'}>▲</button><button type="button" data-umv="1"${i < U.length - 1 ? '' : ' disabled'}>▼</button></span>
      <button type="button" class="del" data-udel title="移除">🗑</button></div>`).join('') || '<div class="hint">還沒有項目，從下面新增（空白＝只照技能順序）</div>';
    const dl = panel.querySelector('#rb-upg-dl');
    if (dl) dl.innerHTML = [...new Set([...UPG_HINT, ...seen])].filter((x) => !U.includes(x)).map((x) => `<option value="${htmlEsc(x)}">`).join('');
  }
  const setUpg = (a) => { cfg.skillUpg = a; save(); renderUpg(); render(); };
  function upgAdd() {
    const inp = panel.querySelector('#rb-upg-add input'), n = inp.value.trim(); if (!n) return;
    const U = lines(cfg.skillUpg); inp.value = ''; if (!U.includes(n)) setUpg([...U, n]);
  }
  function onUpgClick(ev) {
    if (ev.target.closest?.('#rb-upg-add button')) return upgAdd();
    const row = ev.target.closest?.('#rb-upg [data-upg]'); if (!row) return;
    const n = row.dataset.upg, U = lines(cfg.skillUpg);
    if (ev.target.closest('[data-udel]')) return setUpg(U.filter((x) => x !== n));
    const b = ev.target.closest('[data-umv]'); if (!b || b.disabled) return;
    const i = U.indexOf(n), j = i + +b.dataset.umv; if (i < 0 || j < 0 || j >= U.length) return;
    [U[i], U[j]] = [U[j], U[i]]; setUpg(U);
  }
  let upgDrag = null;
  function onUpgDrag(ev) {
    const row = ev.target.closest?.('#rb-upg [data-upg]');
    if (ev.type === 'dragstart') { if (!row || row.getAttribute('draggable') !== 'true') return; upgDrag = row.dataset.upg; ev.dataTransfer.effectAllowed = 'move'; try { ev.dataTransfer.setData('text/plain', upgDrag); } catch {} row.classList.add('drag'); return; }
    if (ev.type === 'dragend') { upgDrag = null; panel.querySelectorAll('#rb-upg .drag,#rb-upg .over').forEach((e) => e.classList.remove('drag', 'over')); return; }
    if (!upgDrag || !row) return;
    const U = lines(cfg.skillUpg), to = U.indexOf(row.dataset.upg);
    if (ev.type === 'dragover') { if (to >= 0) { ev.preventDefault(); panel.querySelectorAll('#rb-upg .over').forEach((e) => e.classList.remove('over')); row.classList.add('over'); } return; }
    if (ev.type === 'drop' && to >= 0) { ev.preventDefault(); const a = U.filter((x) => x !== upgDrag); a.splice(to, 0, upgDrag); upgDrag = null; setUpg(a); }
  }
  function onFBoss(ev) {
    const id = ev.target?.dataset?.fb; if (id == null) return;
    const a = fbDisplay(loadSB()[cfg.stage]).filter((x) => x !== id);
    if (ev.target.checked) a.push(id);
    cfg.finalBoss = { ...cfg.finalBoss, [cfg.stage]: a };
    save(); renderFBoss(); render();
  }
  function render(full) {
    if (!panel) return;
    renderLists(); renderFBoss(); renderUpg();
    const g = (id) => panel.querySelector('#' + id);
    const act = document.activeElement;
    g('rb-ver').textContent = 'v' + BOT.version;
    const sel = g('rb-prof'), names = profileNames();
    if (full || sel.options.length !== names.length || [...sel.options].some((o, i) => o.value !== names[i])) {
      sel.innerHTML = names.map((n) => `<option>${n.replace(/</g, '&lt;')}</option>`).join('');
    }
    if (sel !== act) sel.value = STORE.activeProfile;
    if (cfg.tab === 'deity') cfg.tab = 'chest'; // v0.7.2 神祇分頁併入寶箱
    if (cfg.tab === 'perk') { cfg.tab = 'skill'; save(); } // v0.8.0 重抽分頁拆進技能／寶箱
    panel.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === cfg.tab));
    panel.querySelectorAll('.pg').forEach((p) => p.classList.toggle('on', p.dataset.pg === cfg.tab));
    if (cfg.tab === 'log' && (full || !BOT.logShown)) { renderLog(true); BOT.logShown = true; }
    if (cfg.tab !== 'log') BOT.logShown = false;

    panel.querySelectorAll('[data-k]').forEach((el) => {
      if (el === act) return;
      const v = getP(el.dataset.k);
      if (el.type === 'checkbox') el.checked = !!v; else if (el.type === 'radio') el.checked = el.value === v; else if (v !== undefined) el.value = v;
    });
    if (full) panel.querySelectorAll('[data-list]').forEach((el) => { if (el !== act) el.value = listVal(getP(el.dataset.list)); });
    panel.querySelectorAll('[data-show]').forEach((el) => { el.style.display = showOk(el.dataset.show) ? '' : 'none'; });
    if (g('rb-flow') !== act) g('rb-flow').value = cfg.gate.on ? 'gate' : cfg.mode;
    DIFF.forEach((_, i) => { g('rb-dv' + i).textContent = Math.round(cfg.diff[i] * 100) + '%'; });
    { const l = gateSkills(); g('rb-gskl').textContent = l.length ? `＝${l.join('、')}` : '技能分頁還沒有優先序'; }

    const r = inRun(), P = r?.player, pk = r?.perksLeft;
    const perkTxt = pk ? `這場遊戲還剩：單張 ${pk.reroll_card ?? 0}、全部 ${pk.reroll ?? 0}、放逐 ${pk.banish ?? 0}、專注 ${pk.focus ?? 0}` : '進關後顯示這場剩餘次數';
    panel.querySelectorAll('.perkleft').forEach((el) => { el.textContent = perkTxt; });
    const ph = phase();
    panel.classList.toggle('manual', !!cfg.manual);
    g('rb-manual').textContent = cfg.manual ? '✋ 手動' : '▶ 自動中';
    g('rb-st').textContent = (cfg.manual ? '✋ 手動模式：bot 不操作（按 F8 或標題列「✋ 手動」恢復）\n' : '') + (BOT.loginErr ? `⚠ ${BOT.loginErr}\n` : '') + (BOT.loginWarn ? `⚠ 自動登入找不到角色「${BOT.loginWarn}」，請手動選\n` : '') +
      `${r ? '關卡中 · ' + r.state + (r.script?.rare ? (r.rareId ? ' 🐍隱藏王' : ' 無隱藏王') : '') + (BOT.rs?.fbLeaveAt != null && !BOT.rs.fbPlay ? `（最終王不符，${Math.max(0, Math.ceil(BOT.rs.fbLeaveAt - (r.time || 0)))} 秒後離開，連續 ${fbSkips()} 次）` : BOT.rs?.fbPlay ? `（${BOT.rs.fbPlay}）` : '') : visible($('#lobby-ui')) ? '城鎮' + (cfg.loop && H.nextEnterAt > Date.now() ? ` · ${Math.ceil((H.nextEnterAt - Date.now()) / 1000)} 秒後進關` : '') : '—'}` +
      (r ? `  怪 ${BOT.dbg?.enemies ?? '-'}  威脅 ${BOT.dbg?.threat ?? '-'}\n` +
           `HP ${r.hp != null ? Math.round(r.hp) + '/' + Math.round(r.stats?.maxHp ?? 0) : '-'}  zeny ${r.zeny ?? '-'}  卡住 ${BOT.stuck || 0}\n` +
           (ph !== 'normal' ? `${ph === 'hunt' ? '🔎 巡邏中' : '🧘 掛機中'}` +
             (skillGoal() ? `  技能 ${skillsReached() ? '✓' : BOT.rs?.skillTimeout ? '逾時' : '…'}` : '') +
             (deityGoal() ? `  神祇 ${huntDone() ? '✓' : BOT.rs?.huntFailed ? '放棄' : '…'}（寶箱 ${r.chestsOpened ?? 0}）` : '') : `模式：${effMode() === 'idle' ? '原地掛機' : '遊走'}`) +
           (effMode() === 'idle' && BOT.anchor && P ? `  離原點 ${Math.round(hyp(P.x - BOT.anchor.x, P.y - BOT.anchor.y))}${BOT.sweep ? ' 掃圈' : ''}` : '') + '\n'
         : '\n') +
      `${r?.dropsBy ? `? 裝備 ${mysteryOf(r).myst?.[0] ?? 0}・卡 ${mysteryOf(r).myst?.[1] ?? 0}` : `掉落 ${BOT.drops || 0}`}  進關 ${BOT.runs}${cfg.maxRuns ? '/' + cfg.maxRuns : ''}  hook ${BOT.run ? '✓' : '✗'}${BOT.lobby ? '✓' : '✗'}`;
  }

  const onKey = (e) => {
    if (e.key === 'F8') setManual(!cfg.manual);
  };
  function setManual(v) {
    cfg.manual = !!v; save();
    const r = BOT.run; if (v && r) { setMove(r, 0, 0); BOT.driving = false; }
    log(v ? '✋ 手動模式：bot 停止操作' : '▶ 恢復自動');
    render();
  }
  window.addEventListener('keydown', onKey, true);
  BOT.cleanup.push(() => window.removeEventListener('keydown', onKey, true));

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildPanel, { once: true });
  else buildPanel();
  log('loaded v' + BOT.version);
})();
