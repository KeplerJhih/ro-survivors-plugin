# RO Survivors Bot — 開發筆記

給下一次接手（人或 Claude）用：遊戲內部結構、bot 機制、版本紀錄、待辦。
目標網站：https://ro-survivors.com/ （單一 Vite bundle `build/main-*.js`，PixiJS 渲染）

## 檔案
| 檔案 | 世界 / 時機 | 說明 |
|---|---|---|
| `hook.js` | MAIN, document_start | 攔截遊戲物件到 `window.__roHook`，整頁只跑一次，**改它需要刷新頁面** |
| `bridge.js` | ISOLATED | 把擴充功能 id 寫到 `<html data-robot-ext>`，給面板熱更新用 |
| `bot.js` | MAIN | 所有 bot 邏輯＋面板；可熱更新（新版會先 `__roBot.destroy()` 舊版） |
| `tests/` | Playwright 假 DOM 模擬測試，`bash tests/run-all.sh` |
| `CLAUDE.md` | 給 Claude Code 的交接與改版流程 |
| `bg.js` | service worker | 熱更新（`chrome.runtime.reload()` 後重新注入 `bot.js`）；長時間掛機：nodiscard / awake / restore / popout |

## 安裝 / 更新
1. `chrome://extensions` → 開發人員模式 → 載入未封裝項目 → 選 `chrome-plugin/`
2. 之後更新：覆蓋檔案 → 按面板右上角 **⟳**（不用刷新、不用重新排隊）
   - 例外：改了 `hook.js` 或第一次從 v0.3 以前升級，要刷新一次
3. 面板底部 `hook ✓✓` 代表攔截成功（run / lobby）

## 遊戲內部（逆向結果）

### 取得遊戲物件
- bundle 開頭：`var JM=Object.defineProperty; var QM=(a,e,t)=>e in a?JM(a,e,{...}):a[e]=t; var g=...`
  class field 都透過它設定 → 在 **document_start** 換掉 `Object.defineProperty`，並在 `Object.prototype` 放同名 getter/setter，
  就能在建構時抓到 `this`。
- 辨識用欄位：`replayMoves` → 關卡物件（run），`talkTo` → 城鎮物件（lobby）。
- 必須 `world: "MAIN"` + `run_at: document_start`，頁面載入後才注入就抓不到。

### 防作弊 / 重播驗證
- 關卡是**客戶端確定性模擬**：`deterministic`、`seed`、`moves`（每 tick 量化的移動向量）、`checks`。
- 結算時伺服器重播驗證，對不上 →「Partida anulada por el servidor」（作廢），通過才計分／天梯。
- ⇒ **只能動輸入**（`touchMove` / 按鍵 / 點 UI），不能改血量、速度等狀態。

### run 物件常用欄位
| 欄位 | 說明 |
|---|---|
| `state` | `playing` / `levelup`（升級或寶箱選卡）/ `reveal`（掉落展示）/ `over` / `done` / `paused` |
| `player` | `{x, y, dead}`；HP 在 `run.hp`，最大 HP 在 `run.stats.maxHp`，撿取半徑 `run.stats.pickupRadius`（≈130） |
| `enemies[]` | `{x, y, dead, elite, def:{boss}}` |
| `pickups[]` | `{x, y, kind, dead, magnet, vacuum}`；kind：`gem_blue` `gem_yellow`（經驗）`chest` `loot` `card` `egg` `magnet` `meat` `zeny`（`value` 金額 8~數百）|
| `touchMove` | `{x,y}` 類比移動輸入（世界座標方向，長度 ≥0.77 即全速）。**改值，不要換物件**（被輸入元件共用） |
| `keys` | Set，WASD / 方向鍵（window keydown，無 isTrusted 檢查） |
| `walk` | 地圖格網：`walkable(x,y)` `lineClear(x0,y0,x1,y1)` `pathTo(x0,y0,x1,y1)`（已拉直、~0.3ms）`nearestWalkable(x,y)` |
| `bounds` | `{x0,x1,y0,y1}`；格子 32 單位；例：柏伊亞嵐島 280×300 格 |
| 寶箱掉落 | 精英怪死亡必掉 chest＋zeny（(15+exp×3)×倍率）＋肉；一般怪 22% 掉 zeny、極小機率掉 chest；磁鐵也有機率 |
| `zeny`, `chestCost()` | 開寶箱：走到寶箱 34 單位內（判定點在 player.y-20）且 zeny 足夠自動開 |
| `openingChest` | 非 null 時，目前選卡畫面是寶箱（**組隊非房主時不會設定** → 改看 `#pk-title`「寶箱」） |
| `coop` | 組隊時存在；`coop.replica` ＝非房主 |
| `perksLeft` | 這場剩餘 `{reroll_card, reroll, banish, focus, deity}`，技能與寶箱共用 |
| `runItems.slots` / `runItemName(slot,item)` | 身上道具欄（神祇、祝福、料理…）；`runItemName` 回傳中文名（例 deity g_bulwark → 堡壘之神） |
| `skillLevel(id)` / `slots` | 技能等級（id 如 `holy_light`）／技能欄 |
| `chestsOpened`, `time`, `kills` | 已開寶箱數、遊戲秒數、擊殺 |
| `classDef` | `{id:'acolyte', name:'服事', speed:150, ...}` |
| `weapons[]` | `{id, rank}` 已有技能 |
| `level`, `runLoot`, `runCards` | 等級、本場掉落 |

### lobby 物件
- `npcs[]`：`{id, name, action, x, y}`，例：`遠征隊長`
- `moveTo(x,y)`：走過去，目標在 NPC 60 單位內會自動對話（開啟遠征選單）

### DOM / UI
| 元素 | 說明 |
|---|---|
| `#lobby-ui` | 城鎮 UI（關卡中 display:none） |
| `#lobby-prompt` | 「與隊長交談 空格」 |
| `#stages` | 遠征選單；`.stg-card`（`.sel` 已選）、`#stg-go` 出發、`#stg-story` / `#stg-skip` |
| `.diff-row input[type=range]` | 難度 5 項：數量 1–3.5、傷害 1–1.75、血量 1–2.5、速度 1–1.75、事件 1–2.5，step 0.05 |
| `#npc-dialog` | 難度視窗（按鈕「前往野外」）、登入後「選擇大廳」（選標「上次」） |
| `#pk-cards .pk-card` | 升級/寶箱卡片，`.pk-name`。寶箱卡文字：`品質｜(新！)｜名稱｜部位｜數值` |
| `#drop-reveal` | 掉落展示，4–8 秒自動關，點擊/空白鍵可提早關；`.dr-name` `.dr-q` `.dr-stats`；組隊時有 `[data-c=need|greed|pass]` 擲骰 |
| `#loot-rolls .lr-row` | 組隊時右側擲骰列（無品質資訊） |
| `#picker` / `#pk-title` | 選卡畫面；標題「升級！」或「寶箱」；選完後 `.closing` 820ms |
| `#go-title` | 結算標題：你存活下來了！（通關）／你死了／已放棄本局／本局結束 |
| `#pause` / `#btn-resume` | 暫停選單 |
| `#gameover` / `#btn-restart` | 結算畫面「返回角色」→ 回到廣場（隊長旁） |
| `#btn-endrun` | 暫停選單「結束這場」＝放棄（`Zi(!1,!0)`），直接 `.click()` 即可；`#btn-resume` `#btn-quit` |
| 注意 | 遊戲 overlay 是 `position:fixed`，`offsetParent` 永遠 null → 用 `getClientRects().length` 判斷可見 |

已知品質名稱：傳說、史詩、稀有、優良、普通（精良為推測）。神祇中文名：堡壘、記憶、生命、智慧、思想、力量、戰爭、疾風、處刑、貪婪、束縛、詭計、折磨之神、轉移神祇；另有技能神祇（例「治癒術 Deity」）

### 伺服器同步（觀察，非完整）
- 遊戲邏輯全在瀏覽器跑；存檔在 localStorage `ro-survivors.*`，以 `PUT api/save`（含版本號 rev）整份上傳，版本衝突會被拒
- 每場進關 `POST api/run`（關卡、倍率、隨機 key、角色）取得場次代號，結束後隨存檔一起兌換
- 確定性模擬＋輸入紀錄由伺服器重播驗證（對不上即作廢）→ bot 只送輸入，不改數值
- WebSocket：大廳（頻道/聊天/位置）、組隊（房主模擬、其他人 replica）、無盡之塔
- 其他：`status.json`（新版本/維護）、`api/visit`、`api/crash`、`api/ladder`、`api/mail`、`api/enter`
- bot 的 `roBot.*` 不在同步範圍，不會上傳

## 面板（v0.7）
| 分頁 | 內容 | 設定鍵 |
|---|---|---|
| 頂部 | 設定檔下拉＋新增/複製/改名/刪除；⟳ 熱更新 | `STORE.profiles` / `activeProfile` |
| 控制 | 自動戰鬥/選卡/進關/繼續（共用）；玩法＝先巡邏→條件達成原地掛機／一開始原地／一直遊走；巡邏條件；原地/遊走細節（摺疊） | `fight` `pick` `loop` `autoResume`；`gate`、`mode`、`huntLeave*`、`huntPoorSec`、`huntPhase.onFail`、`idle*`、`sweep`、`dangerR`、`zenyMin` |
| 關卡 | 關卡、難度、打幾場停、結算等待 | `stage` `diff` `maxRuns` `reenterDelay` |
| 技能 | 優先序、不要的（放逐＋絕不選）、核心（專注），依職業 | `priority.@cls` `skillBanish.@cls` `skillFocus.@cls` |
| 寶箱 | 優先序、品質低於就重抽、不換身上裝備、不要/想要、組隊擲骰 | `chestPriority` `chestMinQ` `chestAvoidSwap` `chestBanish` `chestFocus` `roll` |
| 神祇 | 14 神祇 —/🎯/✕、其他想要、沒神祇也重抽全部 | `deity` `deityExtra` `deityRerollAll` |
| 重抽 | 一張表：神祇/寶箱/技能 × 單張/全部/放逐/專注；獵神時全給神祇 | `perks.{deity,chest,skill}` `perks.huntAll` |
| 紀錄 | 達成率、場次、掉落、匯出 CSV | localStorage `roBot.log` `roBot.drops` |

- 面板用宣告式綁定：`data-k`（路徑，`@cls`＝目前職業）、`data-list`（一行一個）、`data-show`（顯示條件）
- 共用設定（`GLOBAL_KEYS`）：fight / pick / loop / autoResume / reenterDelay / maxRuns / tab；其餘跟著設定檔
- 其他 localStorage：`roBot.pos`（面板位置）、`roBot.skillMap`（技能名→id）、`roBot.dt.*`（摺疊開合）
- 每場狀態存在 `window.__roHook.rs`（依 runSeq），熱更新不會清掉

## Bot 機制
- **主迴圈**（50ms）：關卡中 → ① 自動戰鬥移動 ② 自動選卡（技能/寶箱/交換確認/掉落展示/組隊擲骰）③ 自動繼續 ④ 獵神失敗判斷 ⑤ 掉落與場次紀錄 ⑥ 結算回城；城鎮 → 自動進關流程
- **階段** `phase()`：`normal`（玩法非巡邏）／`hunt`（巡邏中）／`farm`（條件達成或獵神失敗→掛機）。
  條件 = 技能優先序前 N 個 Lv≥M（`skillsReached`）及/或 拿到🎯神祇（`ownsTarget` 讀裝備欄）。切換時用 `safeAnchor` 找附近安全空曠點當原點
- **移動**：16 方向打分 = 朝目標 − 1.2×走一步後危險度 + 前方空曠度 + 方向一致；牆前重罰；直線被擋用 `walk.pathTo`；0.8 秒沒動就往最空曠方向脫困
- **遊走目標**：掉落物「價值＋群聚−危險−距離」並鎖定；沒東西就探索（記錄走過的 400×400 格，優先去 60 秒沒去過、遠離怪群的地方）
- **獵神中**（`huntingDeity`）：精英怪不加重危險、沒東西撿時去打最近精英怪（必掉寶箱）、zeny 依金額加權、錢夠必開寶箱
- **原地掛機**：只撿勾選種類（寶箱可走更遠）；每 N 秒「掃一圈」去經驗寶石最多、怪最少的格子撿，逾時回原點；途中強制閃怪
- **選卡**（`perkTick`，技能與寶箱共用）：放逐名單 → 專注名單 →（寶箱）神祇獵取：神祇卡不是目標就單張重抽 → 評分 → 不滿意先單張重抽再重抽全部 → 選最高分
  - 技能只比對 `.pk-name`；不要的技能 −100000（放逐次數用完也不選）
  - 寶箱只比對卡片本身（排除 `.pk-swap`「取代 X」、`.pk-mark`）；絕不拿較低優先的東西換掉優先序內的裝備；不要的神祇 −5000
  - 次數上限 `limitFor(kind)`：獵神中且 `perks.huntAll` → 神祇無上限、其他 0；否則照 `perks` 表
- **組隊擲骰**（`rollTick`）：依規則選 need/greed/pass，出現後 0.8~1.6 秒才按
- **循環**：城鎮 → `lobby.moveTo(隊長)` → 選關 → 出發 → 套難度 → 前往野外 → 打 → `#btn-restart` → 等 `reenterDelay` 秒 → 城鎮
- 實測數據：卡牆 17%→4%（v0.2）→0%（v0.4.5）；獵神斐揚洞穴第 1 個寶箱 1:15 拿到（v0.5.2）

## 版本紀錄（新 → 舊）
- **0.7.4** 配合伺服器掉落改版：
  - 掉落紀錄改讀結算畫面 `#go-server-loot`（分配完才讀；`img.title`＝「名稱 (品質)」，`img.cardimg`＝卡片），補寫進這場的場次紀錄（紀錄常比物品早寫，用 `seq` 找回）。
  - 場次紀錄加 `myst:[裝備?, 卡片?]`、`src`（怪物名稱 → 數量，名稱從關卡中 `run.enemies[].def` 記下）；紀錄分頁加「掉落」欄、平均每場、品質分布、稀有以上清單、卡片種類；CSV 加三欄。
  - 遊走不追紫色 ?（`mystery`）。暫離／維護踢人提示（按鈕「接受」）也會自動關掉。測試 `tests/server-loot.test.js`。
- **0.7.3** 廣場跳「未完成的一局」（`#npc-name`，瀏覽器殘留上一場存檔 `ro-survivors.run.v1.*`）→ 自動按主按鈕「繼續」：遊戲先問伺服器，已結束就把戰利品寄郵差、經驗照算，再跳「這局已經結束」→ 按「OK」。
  標題畫面「你已 5 分鐘沒有動作」→ 按「我知道了」再自動登入。以前會卡在對話框，5 分鐘後被登出。測試 `tests/unfinished-run.test.js`。
- **0.7.2** 控制分頁巡邏條件簡化：拿掉條件之間與技能之間的「任一／全部」，勾的條件**全部**達成才切換掛機（「任一」會在學到技能時提早停止獵神，見實戰觀察）；
  神祇放第一個，獵不到時改成圓鈕「離開這場重來／放棄神祇，照常掛機」；「開不起寶箱」改稱「錢不夠開寶箱」。舊設定的 `gate.need` / `gate.skillNeed` 不再讀取。測試 `tests/gate-all.test.js`。
  「神祇」分頁併入「寶箱」分頁（可收合：🎯 神祇／其他寶箱卡／👥 組隊擲骰），舊設定停在神祇分頁會自動跳寶箱。測試 `tests/chest-deity-merge.test.js`。
- **0.7.1** 長時間掛機（控制分頁「長時間掛機」，所有設定檔共用）：
  - 分頁不被釋放：bg `chrome.tabs.update(tabId, {autoDiscardable:false})`（每 30 秒重設）
  - 保持清醒：`chrome.power.requestKeepAwake('display')`（manifest 新增 `power` 權限；自動戰鬥或自動進關開著才要求）
  - 最小化自動還原（選用）：visibilitychange → hidden 1.5 秒後 bg 檢查視窗 `state==='minimized'` 就 `windows.update(normal)`
  - 「把遊戲移到獨立視窗」：bg `windows.create({tabId})`
  - 停住紀錄：分頁 hidden 超過 10 秒記到 localStorage `roBot.stalls`，紀錄分頁顯示次數與總時間
  - 重新整理後自動回到遊戲（需開自動進關）：標題 `#sp-play`「開始遊戲！」→ 角色選擇 `#slots .slot .slot-name` 選上次角色（`#hud-name` 記在 `roBot.lastChar`）→ `#btn-play`
    → 大廳選擇（既有）；廣場時遇到「新版本」提示自動按重新整理；維護畫面每分鐘按 `.sp-maint-retry`
  - 擋不住：視窗被完全蓋住（需 Chrome 啟動參數 `--disable-backgrounding-occluded-windows`）、手動鎖定、登入過期 alert
- **0.7.0** 面板整理（功能不變，操作簡化）：
  - 分頁：控制／關卡／技能／寶箱／神祇／重抽／紀錄；面板改用宣告式綁定（`data-k` 路徑、`data-list` 清單、`data-show` 顯示條件）
  - 控制：四個開關＋「玩法」單一選單（先巡邏達成條件後原地掛機／一開始就原地掛機／一直遊走），巡邏條件（技能優先序前 N 個 Lv≥M、拿到🎯神祇＋獵不到的處理）都在這裡；
    原地/遊走細節收進可摺疊區塊（記住開合）
  - 重抽：三處的「每場最多用幾次」合併成一張表 `cfg.perks.{deity,chest,skill}`＋「獵神時全部先給神祇」（`perks.huntAll`）；
    移除：寶箱/技能的「使用重抽」開關（0＝不用）、技能滿意條件、寶箱選擇方式（固定依優先序＋品質）、神祇總開關、剩餘次數給誰
  - 舊設定自動轉換（deityUse/chestUse/skillUse → perks；chestPerks/skillPerks=false → 該列 0）
- **0.6.7** 開局巡邏的技能條件改用「技能」分頁優先序前 N 個（依職業），不用另外輸入：☑ 學到技能分頁優先序的 前 N 個（任一/全部）、等級 ≥ M；
  面板會顯示目前對應到哪些技能。v0.6.5 的自訂清單停用
- **0.6.6** 修正技能放逐名單的技能還是被選到：放逐次數用完後（獵神把放逐用光），三張都沒命中優先序時取第一張 → 剛好是緩速術。
  放逐名單內的技能評分 −100000，除非三張都在名單內否則絕不選
- **0.6.5** 「開局巡邏 → 掛機」（控制分頁，cfg.gate）取代原本只看神祇的「開局獵神」：條件＝拿到🎯神祇 及/或 學到技能（一行一個，可加等級
  「神聖之光 3」，任一/全部），條件之間任一/全部；達成後切換（預設原地掛機）。巡邏期間有神祇目標才「獵神」（全力開寶箱、重抽給神祇、
  失敗條件仍在神祇分頁）。技能等級：卡片名稱→id（括號英文直接轉 snake_case：神聖之光 (Holy Light)→holy_light；
  其他由選卡前後 `run.skillLevel(id)` 差異學習，存 `roBot.skillMap`）。舊設定 huntPhase.on 自動轉成 gate（神祇條件）
- **0.6.4** 修正組隊時寶箱卡被當成技能卡：組隊非房主（`run.coop.replica`）時 `openingChest` 不會設定 → 改用選卡標題 `#pk-title`「寶箱」判斷
  （實測：組隊開了 20 個寶箱，全走技能優先序，「神聖之光」命中「神聖之光 Deity」，獵神重抽一次都沒用）。
  獵神失敗：新增條件「開不起寶箱 N 秒」（預設 60，zeny < 開箱費持續計時），失敗時可選「直接切換掛機」（預設）或「離開這場」；
  紀錄多記 huntFail 原因
- **0.6.3** 分頁「選卡」改名「技能」；組隊掉落擲骰移到「寶箱」分頁最下面
- **0.6.2** 組隊掉落擲骰（v0.6.3 起在寶箱分頁，跟著設定檔）：組隊時裝備/卡片/蛋掉落改成 Need / Greed / 放棄（`coop.lootRoll`），
  按鈕在 `#drop-reveal .dr-roll-btns [data-c=need|greed|pass]` 與右側 `#loot-rolls .lr-row`，約 20 秒逾時。
  方式：自己按 / 全部放棄 / 全部 Greed / 全部 Need / 依規則（一定 Need 名單 → 一定放棄名單 → 卡片規則 → 品質 ≥ X 就 Need → 其他）；
  出現後 0.8~1.6 秒才按；需開「自動選卡」。右側列沒有品質資訊，只能用名稱/種類判斷
- **0.6.1** 設定檔（手動切換）：面板上方「設定檔」下拉＋ ＋新增 ⧉複製 ✎改名 🗑刪除。
  儲存格式 `roBot.cfg = { 共用…, profiles: {名稱: {…}}, activeProfile }`；共用＝fight / pick / loop / autoResume / reenterDelay / maxRuns / tab，
  其餘（模式、關卡難度、選卡、寶箱、神祇、掃圈…）跟著設定檔。舊版單一設定自動轉成「預設」設定檔。
  場次紀錄多記 設定檔、職業；達成率依「設定檔．關卡」分開統計
- **0.6.0** 達成率：結果改讀結算標題 `#go-title`（你存活下來了！＝通關、你死了＝死亡、已放棄本局＝放棄、本局結束＝其他），
  等標題出現再寫紀錄（最多 2 秒）；v0.5.8~0.5.9 把「沒死就算通關」，舊紀錄的通關可能偏高。
  紀錄分頁顯示 達成率（總）、本次掛機達成率、各關卡達成率；CSV 多一欄結算標題
- **0.5.9** 掉落紀錄：每次掉落展示 `#drop-reveal` 出現就讀 `.dr-name`（名稱）`.dr-q`（品質）`.dr-stats > *`（數值），
  種類由 `run.runLoot / runCards / runEggs` 哪個變長判斷（裝備/卡片/蛋）；存 localStorage `roBot.drops`（最多 1000 筆），
  不受自動選卡開關影響。紀錄分頁頂部顯示「本次掛機掉落」（從這次開啟頁面起，`__roHook.sessionAt`）：種類/品質統計＋最近 40 件，
  滑鼠移上去看數值；可「匯出掉落」CSV；場次紀錄也多一欄該場掉落清單
- **0.5.8** 場次紀錄（「紀錄」分頁）：每場 state 變 over/done 時寫一筆到 localStorage `roBot.log`（最多 300 筆）：
  時間、關卡、時長、等級、擊殺、開寶箱數、神祇（含 +N）、是否拿到目標、獵到時間、結果（通關/死亡/放棄＋原因）、模式；
  分頁顯示統計（通關/死亡/放棄、平均時長/等級、獵神成功率、平均獵到時間）與最近 60 場，可匯出 CSV（含 BOM，Excel 可直接開）
- **0.5.7** 修正按 ⟳ 熱更新後重新進關：每場狀態（寶箱/技能/神祇已用次數、huntDone、原點）原本放在 `__roBot`，熱更新後清空 →
  「已拿到神祇」被忘記、已開寶箱數 ≥ 放棄條件 → 誤判失敗按「結束這場」。改放 `__roHook.rs`（依 runSeq），
  且「是否拿到目標」直接讀遊戲裝備欄：`run.runItems.slots` + `run.runItemName(slot, item)` → 中文名（例 deity: g_bulwark → 堡壘之神）
- **0.5.6** 自動繼續：關卡中 `run.state === 'paused'` 持續 1~2 秒就按 `#btn-resume`（控制分頁開關，預設開；放棄這場時不觸發）
- **0.5.5** 原地模式修正：掃圈逾時改在 idleTarget 開頭判斷（原本途中追寶箱/裝備時不檢查 → 實測掃圈卡 96 秒、閃怪一直開著、離原點 1700）；
  寶箱另有「寶箱範圍」（預設 2500，原本跟撿取範圍 1200 一樣 → 身上 6355 zeny 但 1200~1600 外的 3 個寶箱都不去）；
  去開寶箱/撿東西途中強制閃怪，追寶箱時被怪擋也不輕易放棄（attract 0.8~1.2）
- **0.5.4** 獵神期間不再原地繞圈：
  寶箱來源（原始碼）＝精英怪必掉寶箱＋zeny＋肉，一般怪小機率掉寶箱 → 獵神時精英怪不再加重危險度，沒東西可撿時鎖定最近精英怪、站在約 170 外讓技能打；
  zeny 依金額加權（1 + 金額/8）；遊走改「探索式」：記錄走過的 400×400 格子，新目標優先選 60 秒內沒去過、離怪群遠的地方。
  實測 25 秒：探索 10 格、開 1 寶箱、zeny +416，目標幾乎都是寶箱/寶石/zeny
- **0.5.3** 原地模式「定時掃一圈」：每 N 秒把原點 `radius` 內的經驗寶石（gem_blue 1 / green 2 / yellow 3 / red 8）與 zeny（金額/20）
  依 200×200 格加總，選「資源 − 6×危險 − 距離/150」最高的一格；資源 ≥ minValue 才出發，途中強制閃怪；
  該格剩不到 15% 或超過 maxSec 就回原點。預設每 25 秒、資源 ≥ 15、最多 8 秒、範圍 900。模擬測試：撿走 27/30 顆後回到原點
- **0.5.2** 實戰觀察修正：獵到神祇切掛機時，原點改找附近危險度低、較空曠的點（`safeAnchor`，原本直接用當下位置＝常在怪群中）；
  選卡後 `#picker.closing` 820ms 動畫期間不再重複點擊。實測：斐揚洞穴第 1 個寶箱（1:15）就獵到堡壘之神，第 2 個寶箱拿到 +1
- **0.5.1** 開局獵神 → 掛機（神祇分頁）：phase() = hunt（未拿到🎯）/ farm（已拿到）/ normal。
  hunt：強制遊走、zeny 門檻 0、錢夠必開寶箱、`limitFor()` 讓所有重抽/放逐/專注只給神祇（寶箱、技能不花），沒神祇卡時重抽全部；
  farm：切換成「拿到後」模式（預設原地，原點＝切換當下），剩餘次數預設全給技能；啟用時放棄條件預設 8 寶箱 / 5 分鐘
- **0.5.0** 神祇獨立成「神祇」分頁：14 個神祇各自設 —／🎯目標／✕不要（+ 清單外自訂目標）；獨立的每場次數上限
  （單張重抽 4、全部 0、放逐 2、專注 1）；🎯目標＝最高優先＋專注＋神祇卡單張重抽直到出現，✕＝出現就放逐、不選；
  沒拿到目標就離開（N 寶箱 / N 分鐘）移到此分頁。v0.4.9 的「獵取目標」設定自動轉移。
  神祇中文名來自語系檔 `Deity de la …`：堡壘、記憶、生命、智慧、思想、力量、戰爭、疾風、處刑、貪婪、束縛、詭計、折磨之神、轉移神祇
- **0.4.9** 寶箱「獵取目標」：目標（例：堡壘之神）自動列為最高優先＋自動專注；沒拿到前，目標部位（卡片小字，預設「神祇」）的卡
  用單張重抽一直換（單張重抽＝同部位重抽）；可選沒出現該部位時也重抽全部；拿到或卡片顯示「取代 目標」即停止。
  失敗離開：開了 N 個寶箱（`run.chestsOpened`）或 N 分鐘仍沒拿到 → 按 `#btn-endrun`（暫停選單「結束這場」）放棄這場，
  搭配自動進關會等待後再進下一場
- **0.4.8** 修正技能選錯：技能卡比對改成只看 `.pk-name`（說明文字會提到其他技能，例：緩速術說明含「神聖之光」→ 被當成命中第一優先）；
  選卡後等待 1.3–1.7 秒（選卡畫面動畫期間不重複點擊）
- **0.4.7** 自動進關：結算回城後等待 `reenterDelay` 秒（預設 10，隨機 ±20%）再進下一場；狀態列顯示倒數
- **0.4.6** 修正寶箱選錯：卡片上的「⇄ 取代 X」文字也被拿去比對優先序 → 會取代「堡壘之神」的卡反而被當成命中「堡壘之神」，
  把想要的裝備換掉。改成只比對卡片本身（排除 `.pk-swap` `.pk-mark`），且絕不拿較低優先的東西取代優先序內的裝備
- **0.4.5** 遊走 AI 重寫：目標選擇改「價值＋群聚−危險−距離」並鎖定目標（不再在寶石間來回抖）；
  移動改「往各方向走一步後的危險度」打分，會繞過怪群而不是退到牆邊被夾；寶箱價值提高、靠近時衝過去開；
  zeny 掉落設門檻（單筆 ≥ zenyMin 才特地去撿，預設 50）；狀態列 HP 改讀 `run.hp`。
  實測 22 秒對比（舊→新）：貼牆時間 19%→0%、平均危險度 2.85→1.53、開寶箱 0→2、HP 564→651
- **0.4.4** 寶箱也有「使用 重抽/放逐/專注」開關（關閉時只依優先序＋品質選，不花次數）；寶箱分頁依選擇方式/開關收合
- **0.4.3** 開關拆成三個：自動戰鬥（移動）／自動選卡（技能・寶箱・掉落）／自動進關；F8 三個一起關
- **0.4.2** 修正：關閉自動戰鬥後角色持續朝最後方向移動（`touchMove` 沒歸零）
- **0.4.1** 升級選技能也使用 重抽／重抽全部／放逐／專注（每場上限、滿意條件、依職業的放逐/專注清單）；寶箱與技能共用 perkTick
- **0.4.0** 寶箱策略（放逐/專注名單、最低品質、重抽次數上限、避免取代）；熱更新（面板 ⟳，拆成 hook/bridge/bot/bg）；
  面板改分頁（控制/關卡/選卡/寶箱）、高度不超出視窗、內容可捲動、記住位置；交換確認改用 `[data-yes]`
- **0.3.0** 原地掛機模式（撿取種類、範圍、是否閃怪、設原點）；寶箱判定點偏移修正
- **0.2.1** 掉落展示提早關閉、掉落計數；結算用 `#btn-restart`
- **0.2.0** 改用 16 方向打分＋射線避牆＋尋路快取＋卡住脫困；寶箱優先序；修正 fixed 元素可見判斷（v0.1 循環完全不會動）；自動選大廳
- **0.1.0** 初版：hook、遊走閃怪、技能/寶箱選卡、自動進關、面板、F8 停止

## 實戰觀察（2026-11-14 巡檢）
- 服事．斐揚洞穴：通關約 15 分、Lv 70；獵到堡壘之神通常 0:20~1:20，最終精煉 +30~+45
- **死亡根因**：控制分頁巡邏條件「任一達成」＋「學到技能優先序前 1 個 Lv≥1」→ 學到神聖之光就切掛機、停止獵神，
  若堡壘之神還沒開到，10 寶箱放棄條件也不會觸發（已不在獵神階段），沒有坦神祇＋原地不閃怪 → 5~6 分鐘被打死（2 次皆如此）
  - 建議：條件改「全部達成」，或勾「站著時也閃怪」，或只用神祇條件
- 分頁在背景（切走/最小化/被蓋住）時遊戲完全停住；曾整整 30 分鐘只走了 5 分鐘遊戲時間
- 關掉「自動進關」時 bot 會停在結算畫面（正常行為）

- **2026-11-15 遊戲改版：掉落改由伺服器決定**（`run.serverDrops/serverLoot`）：怪物掉的裝備/卡片在地上變成紫色「?」（pickup kind `mystery`），
  不用撿、一段時間後自己消失算拿到，不再跳 `#drop-reveal`。每場有上限 `run.dropCap`（mob / card / boss 各自），計數在 `run.dropsBy`（怪物 id → [裝備, 卡片]）。
  實際物品在結算畫面 `#go-server-loot` 列出（`img[title]`＝名稱（品質）），分配中顯示「正在分配戰利品…」且 `#btn-restart` 會 disabled。
  影響：bot 的掉落紀錄（讀 `#drop-reveal`）永遠 0；遊走時 `mystery` 會被當價值 1 去追（白走）。裝備等級/Tier 只看關卡（`run.itemLevel()/itemTier()`）。

## 待辦 / 未驗證
- [ ] v0.7 新面板實戰確認（設定轉換：deityUse/chestUse/skillUse → perks）
- [ ] 組隊擲骰實戰（目前只用假 DOM 驗證）
- [ ] 技能條件：沒有英文括號的技能（例「攻擊：法杖」）要選過一次才學得到 id
- [ ] 「普隆德拉城」選關後沒有出發鈕（可能需先看劇情）
- [ ] 低 HP 撤退策略（加大閃避、優先撿肉）
- [ ] 達成率是否要排除「放棄」的場次
- [x] ~~巡邏條件「任一」時提早停止獵神~~ → 0.7.2 拿掉「任一」，固定全部達成
- [ ] 背景執行（分頁看不到時遊戲 rAF 停止）：目前只做偵測與紀錄、最小化還原；實驗性背景模式未做
- [ ] 自動登入實戰（標題 → 角色 → 大廳，只用假 DOM 驗證）
- 注意：天梯/排行榜、交易、組隊擲骰都涉及其他玩家，建議只刷個人進度、用分身測試
