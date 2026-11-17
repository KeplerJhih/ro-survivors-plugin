# RO Survivors Bot — Claude Code 交接

Chrome 擴充功能（MV3），自動遊玩 https://ro-survivors.com/ 。使用者：Kepler（繁體中文溝通，回覆請用繁中）。

## 先讀
- `NOTES.md`：遊戲逆向結果、面板與設定鍵、bot 機制、完整版本紀錄（0.1.0 → 0.7.1）、實戰觀察、待辦。**每次改版都要更新它。**

## 檔案
- `hook.js`（MAIN, document_start）攔截遊戲物件 → `window.__roHook`。改它使用者要刷新頁面。
- `bot.js`（MAIN）全部邏輯＋面板，可熱更新。
- `bridge.js`（ISOLATED）、`bg.js`（service worker：熱更新、防釋放、保持清醒、最小化還原、獨立視窗）。
- `tests/`：Playwright 假 DOM 模擬測試，`bash tests/run-all.sh`（需 `npm i playwright && npx playwright install chromium`）。

## 改版流程
1. 改 `bot.js`（或其他檔）。
2. 版本號三處同步：`manifest.json` 的 `version`、`bot.js` 的 `version: 'x.y.z'`、`NOTES.md` 版本紀錄加一條（新的放最上面）。
3. `node --check bot.js` → `bash tests/run-all.sh`，新功能就加一個 `tests/*.test.js`。
4. 使用者更新方式：覆蓋資料夾 → 面板 ⟳。改了 `manifest.json` 權限或 `hook.js` 時，要提醒先到 chrome://extensions 按 ↻ 或刷新頁面。
5. commit。

## 原則（不可違反）
- 遊戲是客戶端確定性模擬＋伺服器重播驗證：**只能動輸入**（`run.touchMove`、按鍵、點 UI），不改遊戲數值、不偽造或竄改對伺服器的請求、不研究繞過驗證。
- 設定變更由使用者決定；巡檢/除錯時只回報與建議，不擅自改使用者設定。
- 面板用宣告式綁定（`data-k` / `data-list` / `data-show`），新增設定優先沿用；設定分「共用」（`GLOBAL_KEYS`）與「設定檔」。
- 舊設定要做轉換（`buildCfg` / `normalize`），不能讓使用者重設。

## 目前狀態（2026-11-14）
- v0.9.10，服事．斐揚洞穴：通關約 15 分、Lv70。巡邏條件已固定「全部達成」（v0.7.1 的「任一」造成兩次死亡，見 NOTES「實戰觀察」）。
