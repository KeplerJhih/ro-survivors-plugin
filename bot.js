// RO Survivors Bot — runs in the page (MAIN world) at document_start.
(() => {
  'use strict';
  // Hot reload: a newer copy of this file can be injected into the page without refreshing.
  // The old instance is torn down; captured game objects live in window.__roHook (hook.js).
  if (window.__roBot?.destroy) { try { window.__roBot.destroy(); } catch {} }
  const H = window.__roHook || (window.__roHook = { run: null, lobby: null, runs: 0, runSeq: 0, drops: 0, stuck: 0 });
  const BOT = (window.__roBot = {
    version: '0.7.4',
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
  const STAGES = ['普隆德拉原野', '普隆德拉地下水道', '失事輪', '柏伊亞嵐島', '斐揚森林', '斐揚洞穴', '普隆德拉城'];
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
    priority: {},          // { [classId]: ['技能名', ...] }
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
    deityUse: { reroll_card: 4, reroll: 0, banish: 2, focus: 1 }, // 每場最多用在神祇
    deityRerollAll: false, // 三張都沒有神祇時也重抽全部
    perks: { deity: { reroll_card: 4, reroll: 0, banish: 2, focus: 1 }, chest: { reroll_card: 2, reroll: 1, banish: 2, focus: 0 }, skill: { reroll_card: 0, reroll: 0, banish: 1, focus: 1 }, huntAll: true },
    gate: { on: false, deity: true, skillOn: false, skillTop: 1, skillLv: 1, after: 'idle' }, // 開局巡邏 → 掛機（勾的條件全部達成才切換）
    huntPhase: { on: false, allPerks: true, after: 'idle', leftover: 'skill', onFail: 'farm' }, // 開局獵神 → 掛機；onFail: farm 直接掛機 / leave 離開這場
    huntPoorSec: 60,       // 獵神時開不起寶箱超過 N 秒 → 視為失敗（0=不判斷）
    huntLeaveChests: 0,    // 開了 N 個寶箱還沒拿到目標 → 放棄這場（0=不離開）
    huntLeaveMin: 0,       // 或打了 N 分鐘還沒拿到 → 放棄這場（0=不離開）
    // 升級選技能也用 重抽 / 重抽全部 / 放逐 / 專注
    skillPerks: true,
    skillUse: { reroll_card: 3, reroll: 1, banish: 2, focus: 0 },
    skillOkTop: 0,         // 命中優先序前 N 名才算滿意（0 = 命中任何一個）
    skillBanish: {},       // { [classId]: [...] }
    skillFocus: {},        // { [classId]: [...] }
    // 組隊掉落擲骰：off 自己按 / pass 全部放棄 / greed 全部 Greed / need 全部 Need / rule 依規則
    roll: { mode: 'off', needList: [], passList: [], needQ: '傳說', card: 'rule', other: 'greed' },
    tab: 'main',
  };
  // ── 設定檔 ──
  // 儲存格式：roBot.cfg = { ...共用設定, profiles: { 名稱: {...設定檔內容} }, activeProfile }
  // 共用：三個自動開關、自動繼續、結算等待、次數上限、目前分頁；其他（模式、關卡難度、選卡、寶箱、神祇…）都跟著設定檔走
  const GLOBAL_KEYS = ['fight', 'pick', 'loop', 'autoResume', 'reenterDelay', 'maxRuns', 'tab', 'v', 'keepAwake', 'noDiscard', 'autoRestore', 'autoLogin'];
  function normalize(c) {
    c.idleKinds = { ...DEFAULT_CFG.idleKinds, ...(c.idleKinds || {}) };
    c.sweep = { ...DEFAULT_CFG.sweep, ...(c.sweep || {}) };
    c.chestUse = { ...DEFAULT_CFG.chestUse, ...(c.chestUse || {}) };
    c.skillUse = { ...DEFAULT_CFG.skillUse, ...(c.skillUse || {}) };
    c.skillBanish ||= {}; c.skillFocus ||= {}; c.priority ||= {};
    c.huntPhase = { ...DEFAULT_CFG.huntPhase, ...(c.huntPhase || {}) };
    c.deity ||= {}; c.deityUse = { ...DEFAULT_CFG.deityUse, ...(c.deityUse || {}) };
    c.diff = Array.isArray(c.diff) ? c.diff : [...DEFAULT_CFG.diff];
    c.roll = { ...DEFAULT_CFG.roll, ...(c.roll || {}) };
    if (c.gate?.skills?.length && c.gate.skillOn === undefined) c.gate.skillOn = true; // v0.6.5 自訂技能清單 → 改用技能分頁
    c.gate = { ...DEFAULT_CFG.gate, ...(c.gate || {}) };
    c.perks = { ...clone(DEFAULT_CFG.perks), ...(c.perks || {}) };
    for (const k of ['deity', 'chest', 'skill']) c.perks[k] = { ...DEFAULT_CFG.perks[k], ...(c.perks[k] || {}) };
    c.deityOn = true; c.chestPick = 'smart'; // v0.7 起不再提供這兩個開關
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
      if (!pf.gate && pf.huntPhase) pf.gate = { on: !!pf.huntPhase.on, deity: true, after: pf.huntPhase.after || 'idle' };
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
  const gateSkills = () => (cfg.priority[classId(BOT.run)] || []).filter(Boolean).slice(0, Math.max(1, G().skillTop || 1));
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
  function gateDone() {
    const goals = [];
    if (deityGoal()) goals.push(deityReached());
    if (skillGoal()) goals.push(skillsReached());
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
  function newWanderTarget(run, P) {
    const b = run.bounds || { x0: P.x - 1600, x1: P.x + 1600, y0: P.y - 1600, y1: P.y + 1600 };
    let cx = 0, cy = 0, n = 0;
    for (const e of run.enemies || []) if (!e.dead && hyp(e.x - P.x, e.y - P.y) < 600) { cx += e.x; cy += e.y; n++; }
    const now = Date.now();
    let best = null, bs = -Infinity;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, r = rnd(600, 1600);
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
      const sc = fresh * 2 + away + Math.random() * 0.2;
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
      if (v <= 3) { // 小東西看群聚：附近越多越值得
        let n = 0;
        for (const q of cand) if (q !== o && Math.abs(q.x - o.x) < 140 && Math.abs(q.y - o.y) < 140 && ++n >= 12) break;
        v += 0.4 * n;
      }
      const ty = o.y + (o.kind === 'chest' ? 20 : 0);
      // 寶箱只能「走到上面」才會開（判定點在角色腳下往上 20），所以危險度扣分較少，盡量去開
      const sc = v - (o.kind === 'chest' ? 1.5 : 4) * dangerAt(o.x, ty) - hyp(o.x - P.x, ty - P.y) / 150 + (cur?.obj === o ? 2 : 0);
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
  function classId(run) {
    const c = run?.classDef;
    const id = c && (c.id || c.name || c.job);
    if (id) H.lastClass = id; // 在城鎮時沿用上一個職業（顯示/設定用）
    return id || H.lastClass || 'default';
  }

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
  function chestScore(t, sw) {
    const p = hit(chestPri(), t), q = QUALITY.findIndex((x) => t.includes(x));
    let sc = (p >= 0 ? (100 - p) * 100 : 0) + (q >= 0 ? (10 - q) * 10 : 0);
    if (/\+\d/.test(t) && !t.includes('新！')) sc += 15;          // 精煉已有裝備
    if (sw) {
      const ps = hit(chestPri(), sw);                               // 會被換掉的那件
      if (ps >= 0 && (p < 0 || ps <= p)) sc -= 100000;             // 絕不拿優先序較低的東西換掉想要的裝備
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
    const scored = texts.map((t, i) => ({ i, t, ...o.score(t, swaps[i]) }));
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
  const deityWant = () => [...DEITIES.filter((d) => cfg.deity[d] === 'want'), ...lines(cfg.deityExtra)];
  const deityBan = () => DEITIES.filter((d) => cfg.deity[d] === 'ban');
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
    return perkTick(run, cards, {
      tag: 'chest', used, limit: limitFor('chest'), banish: cfg.chestBanish, focus: cfg.chestFocus,
      pre: ({ cards, texts, swaps, short }) => {
        if (!cfg.deityOn) return null;
        if (want.length && swaps.some((sw) => hit(want, sw) >= 0)) used.huntDone = true; // 卡片顯示「取代 目標」＝已裝備目標
        for (let i = 0; i < cards.length; i++) {
          if (!isDeityCard(cards[i])) continue;
          // 不要的神祇 → 放逐
          if (hit(ban, texts[i]) >= 0 && canD('banish')) { const b = actBtn(i, '放逐'); if (b) return useD('banish', b, `放逐 ${short(texts[i])}`); }
          // 目標神祇 → 專注（之後更常出現）
          if (hit(want, texts[i]) >= 0 && !cards[i].querySelector('.pk-mark') && !dUsed.focused?.has(texts[i]) && canD('focus')) {
            const b = actBtn(i, '專注');
            if (b) { (dUsed.focused ||= new Set()).add(texts[i]); return useD('focus', b, `專注 ${short(texts[i])}`); }
          }
        }
        if (!want.length || huntDone()) return null;
        if (texts.some((t) => hit(want, t) >= 0)) return null; // 目標出現 → 交給評分（目標＝最高優先）
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
      onPick: (best) => { if (want.length && hit(want, best.t) >= 0) { used.huntDone = true; log('deity', '拿到目標', best.t); } },
      score: (t, sw) => {
        const r = chestScore(t, sw);
        // 不要的神祇：沒放逐掉也不要選（除非三張都更糟）
        const bad = cfg.deityOn && hit(ban, t) >= 0 ? 5000 : 0;
        return { sc: r.sc - bad, ok: r.sc - bad > 0 && (r.p >= 0 || (r.q >= 0 && r.q <= minQ)) };
      },
    });
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
    const cls = classId(run);
    const pri = cfg.priority[cls] || [];
    return perkTick(run, cards, {
      tag: 'skill', used: BOT.skillUsed, limit: limitFor('skill'),
      // 技能只比對「技能名稱」：說明文字常提到別的技能（例如緩速術的說明寫著「神聖之光…傷害 +30%」），
      // 用整張卡比對會誤判成命中神聖之光（v0.4.8 修正）
      textOf: (c) => [c.querySelector('.pk-name')?.textContent, c.querySelector('.pk-ribbon')?.textContent].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || cardText(c),
      banish: cfg.skillBanish[cls], focus: cfg.skillFocus[cls],
      onPick: (best) => { BOT.pendingSkill = { name: cards[best.i]?.querySelector('.pk-name')?.textContent.trim() || best.t, snap: skillSnap(run), at: Date.now() }; },
      score: (t) => {
        const name = t; // card text contains the skill name
        const p = hit(pri, name);
        // 滿意 = 命中優先序前 N 名（N=0 表示命中任何一個都算）
        const ok = p >= 0 && (!cfg.skillOkTop || p < cfg.skillOkTop);
        // 放逐名單裡的技能：放逐次數用完（或沒開重抽/放逐）時也絕不選，除非三張都是（v0.6.6 修正）
        const banned = hit(cfg.skillBanish[cls], name) >= 0;
        const sc = (p >= 0 ? (100 - p) * 100 : (t.includes('新！') ? 0 : 1)) - (banned ? 100000 : 0);
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
  function lobbyTick() {
    if (!ready()) return;
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
      if (/選擇大廳/.test(dlg.innerText)) {
        const last = $$('button,[role=button],li,div', dlg).filter((e) => visible(e) && /上次/.test(e.innerText) && e.innerText.length < 40).pop();
        if (last) return void clickBtn(last, rnd(1500, 2500));
      }
      clickBtn(btnByText(/取消|關閉|離開/, dlg)); return;
    }

    // talk to 遠征隊長
    const prompt = $('#lobby-prompt');
    if (visible(prompt) && /隊長/.test(prompt.innerText)) return void clickBtn(prompt, rnd(800, 1200));
    const L = BOT.lobby;
    const cap = L?.npcs?.find((n) => /遠征隊長/.test(n.name || '') || n.id === 'captain');
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
      stage: cfg.loop ? cfg.stage : (run.stageId || ''),
      profile: STORE.activeProfile, job: run.classDef?.name || run.classDef?.id || '',
      time: Math.round(run.time || 0),
      level: run.level || 0,
      kills: run.kills || 0,
      chests: run.chestsOpened || 0,
      deity,
      target: huntActive() ? (huntDone() ? 'yes' : 'no') : '', huntFail: rs.huntFailed || '',
      huntAt: rs.huntAt != null ? Math.round(rs.huntAt) : null,
      result, why: rs.leaveWhy || '', title,
      seq: H.runSeq,
      drops: (rs.drops || []).map((d) => `${d.q ? d.q + ' ' : ''}${d.name}`),
      ...mysteryOf(run),
      mode: phase() === 'normal' ? cfg.mode : 'hunt',
    };
    const a = loadLog(); a.push(e); saveLog(a);
    log('紀錄', e);
    if (cfg.tab === 'log') renderLog(true);
  }
  // ── 掉落紀錄：讀掉落展示 #drop-reveal 的 .dr-name / .dr-q / .dr-stats ──
  const DROP_KEY = 'roBot.drops';
  const loadDrops = () => { try { return JSON.parse(localStorage.getItem(DROP_KEY) || '[]'); } catch { return []; } };
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
  function captureServerLoot(run) {
    if (BOT.rs.lootDone) return;
    const box = $('#go-server-loot');
    if (!visible(box)) return;
    const imgs = $$('img', box), note = box.innerText.trim();
    if (!imgs.length && (!note || /分配|等待|Repartiendo|Esperando|Distribut|Waiting/i.test(note))) return; // 還在分配
    BOT.rs.lootDone = true;
    const stage = cfg.loop ? cfg.stage : run.stageId || '';
    const got = imgs.map((i) => {
      const t = (i.title || '').trim(), m = t.match(/^(.*) \(([^()]+)\)$/);
      if (i.classList.contains('cardimg')) return { name: t, q: '', kind: '卡片' };
      return m ? { name: m[1], q: m[2], kind: '裝備' } : { name: t, q: '', kind: '蛋' };
    }).filter((d) => d.name).map((d) => ({ at: Date.now(), seq: H.runSeq, stage, stats: '', ...d }));
    if (!got.length) { log('結算掉落：', note || '(無)'); return; }
    (BOT.rs.drops ||= []).push(...got);
    const a = loadDrops(); a.push(...got); saveDrops(a);
    log('結算掉落', got.length, got.map((d) => `${d.q} ${d.name}`).join('、'));
    // 紀錄可能已經先寫了（結算標題比物品早出現）→ 補上這場的掉落
    const L = loadLog(), e = L.findLast?.((x) => x.seq === H.runSeq && Date.now() - x.at < 300000);
    if (e) { e.drops = BOT.rs.drops.map((d) => `${d.q ? d.q + ' ' : ''}${d.name}`); saveLog(L); }
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
    const e = { at: Date.now(), seq: H.runSeq, stage: cfg.loop ? cfg.stage : run.stageId || '', name, q, kind, stats };
    (BOT.rs.drops ||= []).push(e);
    const a = loadDrops(); a.push(e); saveDrops(a);
    log('掉落', kind, q, name, stats);
    if (cfg.tab === 'log') renderLog(true);
  }
  function exportDrops() {
    const a = loadDrops();
    const head = ['時間', '關卡', '種類', '品質', '名稱', '數值'];
    const rows = a.map((e) => [new Date(e.at).toLocaleString(), e.stage, e.kind, e.q, e.name, e.stats]);
    const csv = '\ufeff' + [head, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = `ro-bot-drops-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const QCOL = { 傳說: '#d35400', 史詩: '#8e44ad', 稀有: '#2471a3', 精良: '#2471a3', 優良: '#1e8449', 普通: '#666' };

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
    const good = loadDrops().filter((d) => ['傳說', '史詩', '稀有'].includes(d.q)).slice(-30).reverse(); // 稀有以上（全部紀錄）
    const cards = [...new Set(loadDrops().filter((d) => d.kind === '卡片').map((d) => d.name))];
    const line = (d) => { const t = new Date(d.at); const hm = `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
      return `<div style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span class="hint">${hm}</span> <span style="color:${QCOL[d.q] || '#333'}">${d.q || ''}</span> ${d.name} <span class="hint">${d.kind}</span></div>`; };
    const dropHtml = `<div class="sub" style="gap:3px">
      <div><b>本次掛機掉落</b> ${ds.length} 件　<span class="hint">這一場 ${curRun} 件</span></div>
      <div class="hint">${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join('　') || '還沒有掉落（結算時讀取）'}${sessRuns.length ? `　平均每場 裝備 ${avgN(0)}・卡 ${avgN(1)}` : ''}</div>
      <div>${QUALITY.filter((q) => byQ[q]).map((q) => `<span style="color:${QCOL[q] || '#333'}">${q} ${byQ[q]}</span>`).join('　')}</div>
      ${good.length ? `<div class="hint">稀有以上</div><div style="max-height:110px;overflow:auto">${good.map(line).join('')}</div>` : ''}
      ${cards.length ? `<div class="hint">卡片 ${cards.length} 種：${cards.join('、')}</div>` : ''}
      <details><summary class="hint">本次掛機全部</summary><div style="max-height:150px;overflow:auto">${ds.slice(-60).reverse().map(line).join('')}</div></details>
    </div>`;
    const stalls = loadStalls().filter((x) => x.at >= H.sessionAt);
    const stallHtml = stalls.length ? `<div class="sub" style="gap:2px;background:#fff4e5">
      <div><b>⏸ 遊戲停住</b> ${stalls.length} 次，共 ${mmss(stalls.reduce((p, x) => p + x.dur, 0))}</div>
      ${stalls.slice(-4).reverse().map((x) => { const d = new Date(x.at); return `<div class="hint">${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 停了 ${mmss(x.dur)}${x.inRun ? '（關卡中）' : ''}</div>`; }).join('')}
      <div class="hint">分頁被切走、最小化或被蓋住時遊戲會停</div></div>` : '';
    box.innerHTML = stallHtml + dropHtml + sum + `<table class="lg"><thead><tr><th>時間</th><th>關卡</th><th>時長</th><th>Lv</th><th>神祇</th><th title="裝備／卡片（紫色 ?）">掉落</th><th>結果</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="hint">還沒有紀錄（每場結束時寫入）</td></tr>'}</tbody></table>`;
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
  function rememberChar() {
    const nm = $('#hud-name')?.textContent.trim();
    if (nm && nm !== H.lastChar) { H.lastChar = nm; try { localStorage.setItem('roBot.lastChar', nm); } catch {} }
  }
  function loginTick() {
    if (!ready()) return;
    // 廣場 5 分鐘沒動作被登出：「你已 5 分鐘沒有動作…」→ 按「我知道了」，再照常按開始遊戲
    // （維護前伺服器踢人也是這個提示，標題「暫離」，按鈕「接受」）
    if (/沒有動作|已離開遊戲|sin tocar|inactiv/i.test(document.body.innerText)) {
      const ok = btnByText(/^(接受|我知道了|Aceptar|Accept|Entendido|OK|Got it|Vale)$/i);
      if (ok) { log('閒置被登出 → 關閉提示，重新登入'); return void clickBtn(ok, rnd(1500, 2500)); }
    }
    const play = $('#btn-play');
    if (visible(play)) {
      let want = H.lastChar; try { want ||= localStorage.getItem('roBot.lastChar'); } catch {}
      const slot = want && $$('#slots .slot').find((s) => $('.slot-name', s)?.textContent.trim() === want);
      if (slot && !slot.classList.contains('selected')) return void clickBtn(slot, rnd(600, 1000));
      if (!play.disabled) { log('自動登入：開始遊戲', want || '(目前選取的角色)'); return void clickBtn(play, rnd(3000, 4000)); }
      return;
    }
    const sp = $('#sp-play');
    if (visible(sp) && !sp.disabled && /開始遊戲|Jugar|Play/i.test(sp.textContent)) { log('自動登入：標題畫面'); return void clickBtn(sp, rnd(2500, 3500)); }
    // 維護中：每分鐘按一次「重新檢查」
    const retry = $('.sp-maint-retry');
    if (visible(retry) && !retry.disabled && Date.now() - (BOT.maintAt || 0) > 60000) { BOT.maintAt = Date.now(); clickBtn(retry, 3000); }
  }

  // ───────────────────────── 7. Run end ─────────────────────────
  function endTick(run) {
    if (!ready()) return;
    const b = (visible($('#btn-restart')) && $('#btn-restart')) || btnByText(/返回角色|回城|返回|回到|離開|城鎮/);
    if (b) {
      log('end of run →', b.innerText.trim());
      clickBtn(b, rnd(1500, 2500)); BOT.endHandled = true;
      H.nextEnterAt = Date.now() + cfg.reenterDelay * 1000 * rnd(0.8, 1.2); // 回城後先等一下再進關
    }
    else if (!BOT.endLogged) { BOT.endLogged = true; log('end screen buttons:', $$('button').filter(visible).map((x) => x.innerText.trim())); }
  }

  // ───────────────────────── 8. Main loop ─────────────────────────
  function inRun() {
    const r = BOT.run;
    return r && r.player && !r.replayMoves && visible($('#lobby-ui')) === false ? r : null;
  }

  BOT.timers.push(setInterval(() => {
    try {
      if (BOT.seq !== H.runSeq) { // new run started
        BOT.seq = H.runSeq; VISIT.clear(); BOT.phase = null; BOT.sweep = null; BOT.sweepEnd = Date.now(); BOT.leaving = false; BOT.endHandled = false; BOT.rs;
      }
      const run = inRun();
      if (run) {
        const st = run.state;
        const ph = phase();
        if (BOT.phase !== ph) {
          if (BOT.phase === 'hunt' && ph === 'farm') { log(BOT.rs.huntFailed ? '獵神失敗 → 切換' : '達成掛機條件 → 切換', effMode()); BOT.anchor = null; BOT.safeAnchorNext = true; steer.target = null; steer.path = null; }
          BOT.phase = ph;
        }

        // ① 自動戰鬥：移動 / 閃避 / 撿東西
        if (cfg.fight && st === 'playing') { combatTick(run); BOT.driving = true; }
        else if (BOT.driving) { setMove(run, 0, 0); BOT.driving = false; } // touchMove keeps its last value → zero once

        // ② 自動選卡：升級技能、寶箱、交換確認、掉落展示
        if (cfg.pick) {
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
        if (cfg.autoResume && (st === 'paused' || visible($('#pause'))) && !BOT.leaving) { // 組隊時暫停只開選單，state 不變
          if (!BOT.pausedAt) BOT.pausedAt = Date.now();
          else if (Date.now() - BOT.pausedAt > BOT.resumeDelay) {
            const b = $('#btn-resume');
            if (b) { log('自動繼續'); b.click(); }
            BOT.pausedAt = 0;
          }
        } else { BOT.pausedAt = 0; BOT.resumeDelay = rnd(1000, 2000); }

        // ②.5 獵目標失敗 → 放棄這場
        if (cfg.pick && st === 'playing' && !BOT.leaving) {
          const why = huntGiveUp(run);
          if (why) {
            if (cfg.huntPhase.onFail === 'farm') { BOT.rs.huntFailed = why; log('獵神失敗 → 直接掛機：', why); }
            else leaveRun(why);
          }
        }

        if (st === 'playing') learnSkill(run);

        // ②.52 組隊掉落擲骰（Need / Greed / 放棄）
        if (cfg.pick) rollTick();

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
        if ((st === 'over' || st === 'done') && cfg.loop) endTick(run);
      } else if (cfg.loop && !visible($('#lobby-ui')) && cfg.autoLogin) {
        loginTick();
      } else if (cfg.loop && visible($('#lobby-ui'))) {
        lobbyTick();
      }
    } catch (e) { log('tick error', e); }
  }, 50));
  BOT.timers.push(setInterval(render, 500));
  BOT.timers.push(setInterval(() => { try { careTick(); rememberChar(); } catch {} }, 30000));
  setTimeout(() => { try { careTick(); } catch {} }, 1500);

  // ───────────────────────── 9. Panel UI ─────────────────────────
  // 分頁：控制 / 關卡 / 選卡 / 寶箱；內容區最高 = 視窗高度，超出可捲動；狀態列固定在底部
  let panel, lastCls = null;
  const listVal = (a) => (a || []).join('\n');
  const parseList = (v) => v.split('\n').map((x) => x.trim()).filter(Boolean);

  // ── 宣告式綁定 ──
  // data-k="路徑"：checkbox / number / select / range 直接對應 cfg 的值（路徑可含 @cls＝目前職業）
  // data-list="路徑"：textarea 一行一個
  // data-show="條件"：路徑為真才顯示；"路徑=值" 比對；前面加 ! 反向
  const pathOf = (p) => p.replace('@cls', classId(BOT.run)).split('.');
  function getP(p) { return pathOf(p).reduce((o, k) => (o == null ? undefined : o[k]), cfg); }
  function setP(p, v) {
    const ks = pathOf(p); let o = cfg;
    for (const k of ks.slice(0, -1)) o = o[k] ??= {};
    o[ks[ks.length - 1]] = v;
  }
  function showOk(expr) {
    const neg = expr.startsWith('!'); if (neg) expr = expr.slice(1);
    const [p, v] = expr.split('=');
    const val = getP(p);
    const ok = v === undefined ? !!val : String(val) === v;
    return neg ? !ok : ok;
  }

  const SEC = (title, body, open) => `<details class="dt" data-dt="${title}"${open ? ' open' : ''}><summary>${title}</summary><div class="dtb">${body}</div></details>`;
  const NUM = (k, w = 44, min = 0, step = 1) => `<input type="number" data-k="${k}" min="${min}" step="${step}" style="width:${w}px">`;
  const CHK = (k, label, hint = '') => `<label><input type="checkbox" data-k="${k}">${label}${hint ? ` <span class="hint">${hint}</span>` : ''}</label>`;
  const RADIO = (k, opts) => opts.map(([v, t]) => `<label><input type="radio" name="rb-${k}" data-k="${k}" value="${v}">${t}</label>`).join('');
  const SELECT = (k, opts) => `<select data-k="${k}">${opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`;
  const LIST = (k, ph, h = 46) => `<textarea data-list="${k}" style="height:${h}px" placeholder="${ph}"></textarea>`;
  const PERKS = [['reroll_card', '單張'], ['reroll', '全部'], ['banish', '放逐'], ['focus', '專注']];

  function buildPanel() {
    document.getElementById('robot-panel')?.remove();
    panel = document.createElement('div');
    panel.id = 'robot-panel';
    let pos = {};
    try { pos = JSON.parse(localStorage.getItem('roBot.pos') || '{}'); } catch {}
    panel.style.left = (pos.left ?? 12) + 'px';
    panel.style.top = (pos.top ?? 70) + 'px';
    panel.innerHTML = `
<style>
#robot-panel{position:fixed;z-index:2147483647;width:240px;max-height:calc(100vh - 16px);display:flex;flex-direction:column;font:12px/1.4 system-ui,sans-serif;color:#1d2a44;background:rgba(255,255,255,.97);border:1px solid #9fb3d9;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.25);user-select:none}
#robot-panel *{box-sizing:border-box}
#robot-panel header{cursor:move;padding:5px 8px;background:#5b8def;color:#fff;border-radius:7px 7px 0 0;display:flex;align-items:center;gap:6px;font-weight:600}
#robot-panel header .sp{flex:1}
#robot-panel header button{all:unset;cursor:pointer;padding:0 4px;font-size:13px}
#robot-panel .pf{display:flex;align-items:center;gap:3px;padding:4px 6px;background:#eef2fa;border-bottom:1px solid #d5def0}
#robot-panel .pf select{flex:1;min-width:0;font:inherit;font-weight:600}
#robot-panel .pf button{all:unset;cursor:pointer;padding:0 3px;font-size:12px;border:1px solid #c5d2ea;border-radius:3px;background:#fff;line-height:18px}
#robot-panel nav{display:flex;border-bottom:1px solid #d5def0}
#robot-panel nav button{all:unset;flex:1;text-align:center;padding:5px 0;cursor:pointer;color:#556}
#robot-panel nav button.on{color:#2b5fd9;font-weight:600;box-shadow:inset 0 -2px #5b8def}
#robot-panel .body{overflow-y:auto;min-height:0;flex:1;padding:6px 8px}
#robot-panel .pg{display:none;gap:6px}
#robot-panel .pg.on{display:grid}
#robot-panel label{display:flex;align-items:center;gap:5px;white-space:nowrap}
#robot-panel select{flex:1;min-width:0;font:inherit}
#robot-panel input[type=number]{font:inherit}
#robot-panel textarea{width:100%;resize:vertical;font:inherit}
#robot-panel .r{display:grid;grid-template-columns:56px 1fr 36px;align-items:center;gap:4px}
#robot-panel .r input{width:100%}
#robot-panel .grid2{display:grid;grid-template-columns:1fr 1fr;gap:3px 8px}
#robot-panel .box{padding:6px;background:#f3f6fc;border-radius:5px;display:grid;gap:5px}
#robot-panel .h{font-weight:600;color:#2b3f66}
#robot-panel .hint{font-size:11px;color:#778;white-space:normal}
#robot-panel .st{font-size:11px;color:#445;white-space:pre-line;background:#eef2fa;padding:5px 8px;border-top:1px solid #d5def0;border-radius:0 0 7px 7px}
#robot-panel .btn{all:unset;cursor:pointer;text-align:center;padding:3px 6px;border:1px solid #9fb3d9;border-radius:4px;background:#fff}
#robot-panel.min .pf,#robot-panel.min nav,#robot-panel.min .body{display:none}
#robot-panel details.dt{border:1px solid #d5def0;border-radius:5px}
#robot-panel details.dt summary{cursor:pointer;padding:4px 6px;font-weight:600;color:#2b3f66;background:#f3f6fc;border-radius:5px}
#robot-panel details.dt .dtb{display:grid;gap:5px;padding:6px}
#robot-panel table.pk{width:100%;border-collapse:collapse;font-size:12px}
#robot-panel table.pk th{font-weight:600;color:#556;font-size:11px;padding:2px;text-align:center}
#robot-panel table.pk td{padding:2px;text-align:center}
#robot-panel table.pk td:first-child{text-align:left;font-weight:600}
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
  <button id="rb-reload" title="從硬碟重新載入 bot（不用刷新頁面）">⟳</button><button id="rb-min" title="收合">－</button></header>
<div class="pf"><span>設定檔</span><select id="rb-prof"></select>
  <button id="rb-pnew" title="新增（預設值）">＋</button><button id="rb-pcopy" title="複製目前設定檔">⧉</button><button id="rb-pren" title="改名">✎</button><button id="rb-pdel" title="刪除">🗑</button></div>
<nav>${[['main', '控制'], ['stage', '關卡'], ['skill', '技能'], ['chest', '寶箱'], ['perk', '重抽'], ['log', '紀錄']].map(([k, t]) => `<button data-tab="${k}">${t}</button>`).join('')}</nav>
<div class="body">

  <div class="pg" data-pg="main">
    ${CHK('fight', '自動戰鬥', '移動・閃怪・撿東西')}
    ${CHK('pick', '自動選卡', '技能・寶箱・擲骰')}
    ${CHK('loop', '自動進關', '隊長→關卡→結算回城')}
    ${CHK('autoResume', '自動繼續', '誤按暫停時')}
    <div class="box">
      <label class="h">玩法 <select id="rb-flow">
        <option value="gate">先巡邏，再原地掛機</option>
        <option value="idle">一開始就原地掛機</option>
        <option value="roam">一直遊走</option></select></label>
      <div data-show="gate.on" style="display:grid;gap:5px">
        <div class="hint">巡邏＝遊走打怪撿東西。下列勾的都做到，才切換原地掛機：</div>
        ${CHK('gate.deity', '拿到🎯神祇', '在寶箱分頁選')}
        <div data-show="gate.deity" style="display:grid;gap:4px;padding-left:18px">
          <div class="hint">獵神中：全力開寶箱、找精英怪。</div>
          <label>開了 ${NUM('huntLeaveChests', 40)} 個寶箱</label>
          <label>或打了 ${NUM('huntLeaveMin', 40)} 分鐘</label>
          <label>或錢不夠開寶箱 ${NUM('huntPoorSec', 40, 0, 10)} 秒</label>
          <div>還沒拿到就：</div>
          ${RADIO('huntPhase.onFail', [['leave', '離開這場重來'], ['farm', '放棄神祇，照常掛機']])}
          <div class="hint">數字填 0＝不看這個條件</div>
        </div>
        ${CHK('gate.skillOn', '學到技能優先序')}
        <div data-show="gate.skillOn" style="display:grid;gap:4px;padding-left:18px">
          <label>前 ${NUM('gate.skillTop', 38, 1)} 個都升到 Lv ${NUM('gate.skillLv', 38, 1)} 以上</label>
          <div class="hint" id="rb-gskl"></div>
        </div>
      </div>
    </div>
    ${SEC('長時間掛機', `
      ${CHK('noDiscard', '分頁不被 Chrome 釋放')}
      ${CHK('keepAwake', '掛機時電腦保持清醒', '螢幕不關、不自動鎖定')}
      ${CHK('autoRestore', '被最小化時自動還原視窗')}
      ${CHK('autoLogin', '重新整理後自動回到遊戲', '開始遊戲→上次角色→大廳')}
      <button class="btn" id="rb-popout" type="button">把遊戲移到獨立視窗</button>
      <div class="hint">遊戲分頁被切走、最小化、被完全蓋住時遊戲會停住；請讓它單獨一個視窗並露出來。所有設定檔共用</div>`)}
    ${SEC('原地掛機細節', `
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
      <button class="btn" id="rb-anchor" type="button">把目前位置設為原點</button>`)}
    ${SEC('遊走細節', `
      <label>閃怪距離 ${NUM('dangerR', 50, 50, 10)}</label>
      ${CHK('lootChest', '錢夠就去開寶箱')}
      <label>zeny 單筆 ≥ ${NUM('zenyMin', 46, 0, 10)} 才特地去撿</label>`)}
    <div class="hint">F8：全部停止</div>
  </div>

  <div class="pg" data-pg="stage">
    <label>關卡 <select data-k="stage">${STAGES.map((s) => `<option>${s}</option>`).join('')}</select></label>
    ${DIFF.map((d, i) => `<div class="r"><span>${d.name}</span><input type="range" data-k="diff.${i}" min="${d.min}" max="${d.max}" step="0.05"><span id="rb-dv${i}"></span></div>`).join('')}
    <label>打 ${NUM('maxRuns', 44)} 場後停止 <span class="hint">0＝不停</span></label>
    <label>結算後等 ${NUM('reenterDelay', 44, 0, 5)} 秒再進關</label>
  </div>

  <div class="pg" data-pg="skill">
    <div class="h">技能優先序 <span class="hint" id="rb-cls"></span></div>
    ${LIST('priority.@cls', '一行一個，越上面越優先&#10;例：&#10;神聖之光&#10;治癒術', 96)}
    <div class="h">不要的技能 <span class="hint">出現就放逐、絕不選</span></div>
    ${LIST('skillBanish.@cls', '例：緩速術')}
    <div class="h">核心技能 <span class="hint">出現就專注、之後更常出現</span></div>
    ${LIST('skillFocus.@cls', '例：神聖之光')}
    <div class="hint">沒命中優先序時會用重抽換卡（次數在「重抽」分頁）。清單依職業各存一份</div>
  </div>

  <div class="pg" data-pg="chest">
    <div class="hint">開寶箱時先看神祇，再看其他卡</div>
    ${SEC('🎯 神祇', `
      <div class="hint">🎯＝想要（最優先、出現就專注、沒出現就重抽神祇卡）　✕＝不要（出現就放逐、不選）</div>
      <div style="display:grid;grid-template-columns:1fr auto;gap:2px 6px;align-items:center">
        ${DEITY_NAMES.map((d) => `<span>${d}</span><span class="seg" data-d="${d}"><button data-v="">—</button><button data-v="want">🎯</button><button data-v="ban">✕</button></span>`).join('')}
      </div>
      <div class="h">其他想要的 <span class="hint">清單外，例：技能神祇</span></div>
      ${LIST('deityExtra', '一行一個', 34)}
      ${CHK('deityRerollAll', '三張都沒有神祇時也「重抽全部」')}
    `, true)}
    ${SEC('其他寶箱卡', `
      <div class="h">優先序 <span class="hint">比對卡片文字</span></div>
      ${LIST('chestPriority', '一行一個，越上面越優先&#10;例：&#10;詠唱速度&#10;傳說', 70)}
      <label>品質低於 ${SELECT('chestMinQ', QUALITY.map((q) => [q, q]))} 就重抽</label>
      ${CHK('chestAvoidSwap', '盡量不換掉身上的裝備')}
      <div class="h">不要的 <span class="hint">出現就放逐</span></div>
      ${LIST('chestBanish', '例：藥水')}
      <div class="h">想要的 <span class="hint">出現就專注</span></div>
      ${LIST('chestFocus', '例：詠唱速度')}
    `, true)}
    ${SEC('👥 組隊擲骰', `
      <label>${SELECT('roll.mode', [['off', '自己按'], ['pass', '全部放棄'], ['greed', '全部 Greed'], ['need', '全部 Need'], ['rule', '依規則']])}</label>
      <div data-show="roll.mode=rule" style="display:grid;gap:4px">
        <label>品質 ≥ ${SELECT('roll.needQ', QUALITY.map((q) => [q, q]))} 就 Need</label>
        <label>卡片 ${SELECT('roll.card', [['rule', '照品質'], ['need', 'Need'], ['greed', 'Greed'], ['pass', '放棄']])}</label>
        <label>其他 ${SELECT('roll.other', [['greed', 'Greed'], ['pass', '放棄'], ['need', 'Need']])}</label>
        <div class="hint">一定 Need（名稱）</div>${LIST('roll.needList', '例：Tidal Shoes', 34)}
        <div class="hint">一定放棄（名稱）</div>${LIST('roll.passList', '例：皮帽', 34)}
      </div>
    `)}
  </div>

  <div class="pg" data-pg="perk">
    <div class="hint">每場最多用幾次（0＝不用）。遊戲每場的總次數是共用的</div>
    <table class="pk"><thead><tr><th></th>${PERKS.map(([, t]) => `<th>${t}</th>`).join('')}</tr></thead><tbody>
      ${[['deity', '神祇'], ['chest', '寶箱'], ['skill', '技能']].map(([k, t]) => `<tr><td>${t}</td>${PERKS.map(([p]) => `<td>${NUM(`perks.${k}.${p}`, 38)}</td>`).join('')}</tr>`).join('')}
    </tbody></table>
    ${CHK('perks.huntAll', '獵神時全部先給神祇', '拿到後才照上表')}
    <div class="hint" id="rb-perkleft"></div>
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
    panel.querySelectorAll('.seg[data-d]').forEach((sg) => sg.querySelectorAll('button').forEach((b) => {
      b.onclick = () => { const v = b.dataset.v; if (v) cfg.deity[sg.dataset.d] = v; else delete cfg.deity[sg.dataset.d]; save(); render(); };
    }));
    // 摺疊區塊記住開合（每個瀏覽器）
    panel.querySelectorAll('details.dt').forEach((d) => {
      try { if (localStorage.getItem('roBot.dt.' + d.dataset.dt) === '1') d.open = true; } catch {}
      d.ontoggle = () => { try { localStorage.setItem('roBot.dt.' + d.dataset.dt, d.open ? '1' : '0'); } catch {} };
    });
    panel.querySelectorAll('nav button').forEach((b) => { b.onclick = () => { cfg.tab = b.dataset.tab; save(); render(true); }; });
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
        try { localStorage.setItem('roBot.pos', JSON.stringify({ left: panel.offsetLeft, top: panel.offsetTop })); } catch {}
      }, { once: true });
    };
    const fit = () => {
      panel.style.left = Math.max(0, Math.min(innerWidth - 60, panel.offsetLeft)) + 'px';
      panel.style.top = Math.max(0, Math.min(innerHeight - 30, panel.offsetTop)) + 'px';
      panel.style.maxHeight = innerHeight - panel.offsetTop - 8 + 'px'; // body scrolls instead of overflowing
    };
    window.addEventListener('resize', fit);
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

  function render(full) {
    if (!panel) return;
    const g = (id) => panel.querySelector('#' + id);
    const act = document.activeElement;
    const cls = classId(BOT.run);
    if (cls !== lastCls) { full = true; lastCls = cls; }
    g('rb-ver').textContent = 'v' + BOT.version;
    const sel = g('rb-prof'), names = profileNames();
    if (full || sel.options.length !== names.length || [...sel.options].some((o, i) => o.value !== names[i])) {
      sel.innerHTML = names.map((n) => `<option>${n.replace(/</g, '&lt;')}</option>`).join('');
    }
    if (sel !== act) sel.value = STORE.activeProfile;
    if (cfg.tab === 'deity') cfg.tab = 'chest'; // v0.7.2 神祇分頁併入寶箱
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
    panel.querySelectorAll('.seg[data-d]').forEach((sg) => sg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (cfg.deity[sg.dataset.d] || '') === b.dataset.v)));
    g('rb-cls').textContent = `（${cls}）`;
    { const l = gateSkills(); g('rb-gskl').textContent = l.length ? `＝${l.join('、')}` : '技能分頁還沒有優先序'; }

    const r = inRun(), P = r?.player, pk = r?.perksLeft;
    g('rb-perkleft').textContent = pk ? `這場遊戲還剩：單張 ${pk.reroll_card ?? 0}、全部 ${pk.reroll ?? 0}、放逐 ${pk.banish ?? 0}、專注 ${pk.focus ?? 0}` : '進關後顯示這場剩餘次數';
    const ph = phase();
    g('rb-st').textContent =
      `${r ? '關卡中 · ' + r.state : visible($('#lobby-ui')) ? '城鎮' + (cfg.loop && H.nextEnterAt > Date.now() ? ` · ${Math.ceil((H.nextEnterAt - Date.now()) / 1000)} 秒後進關` : '') : '—'}` +
      (r ? `  怪 ${BOT.dbg?.enemies ?? '-'}  威脅 ${BOT.dbg?.threat ?? '-'}\n` +
           `HP ${r.hp != null ? Math.round(r.hp) + '/' + Math.round(r.stats?.maxHp ?? 0) : '-'}  zeny ${r.zeny ?? '-'}  卡住 ${BOT.stuck || 0}\n` +
           (ph !== 'normal' ? `${ph === 'hunt' ? '🔎 巡邏中' : '🧘 掛機中'}` +
             (skillGoal() ? `  技能 ${skillsReached() ? '✓' : '…'}` : '') +
             (deityGoal() ? `  神祇 ${huntDone() ? '✓' : BOT.rs?.huntFailed ? '放棄' : '…'}（寶箱 ${r.chestsOpened ?? 0}）` : '') : `模式：${effMode() === 'idle' ? '原地掛機' : '遊走'}`) +
           (effMode() === 'idle' && BOT.anchor && P ? `  離原點 ${Math.round(hyp(P.x - BOT.anchor.x, P.y - BOT.anchor.y))}${BOT.sweep ? ' 掃圈' : ''}` : '') + '\n'
         : '\n') +
      `掉落 ${BOT.drops || 0}  進關 ${BOT.runs}${cfg.maxRuns ? '/' + cfg.maxRuns : ''}  hook ${BOT.run ? '✓' : '✗'}${BOT.lobby ? '✓' : '✗'}`;
  }

  const onKey = (e) => {
    if (e.key === 'F8') {
      cfg.fight = false; cfg.pick = false; cfg.loop = false; save(); render();
      const r = BOT.run; if (r) setMove(r, 0, 0);
      log('stopped');
    }
  };
  window.addEventListener('keydown', onKey, true);
  BOT.cleanup.push(() => window.removeEventListener('keydown', onKey, true));

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildPanel, { once: true });
  else buildPanel();
  log('loaded v' + BOT.version);
})();
