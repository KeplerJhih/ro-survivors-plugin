# RO Survivors Bot

[RO Survivors](https://ro-survivors.com/) 的 Chrome 擴充功能：自動戰鬥、原地掛機、自動選技能和寶箱、獵神祇、循環進關。

## 設定導覽

一步一步示範怎麼安裝和設定（互動動畫，線上直接看）：

https://keplerjhih.github.io/ro-survivors-plugin/setup-guide.html

## 安裝

1. 下載這個 repo（Code → Download ZIP，解壓縮），或 `git clone`。
2. Chrome 開 `chrome://extensions`，打開右上角「開發人員模式」。
3. 按「載入未封裝項目」，選這個資料夾（裡面直接有 `manifest.json` 的那層）。
4. 打開 https://ro-survivors.com/ ，左上出現 RO Bot 面板，底部顯示 `hook ✓✓` 就成功了。

## 更新

用新檔案覆蓋資料夾，按面板右上的 ⟳ 即可，不用重新整理。
如果更新內容有動到 `hook.js` 或權限，要先到 `chrome://extensions` 按 ↻，再重新整理遊戲頁面。

## 注意

- 外掛只模擬按鍵、移動和點畫面，不會改遊戲數值。
- 遊戲分頁被切走、最小化或被完全蓋住時，遊戲會停住；請讓遊戲單獨一個視窗並露出來。
- 按 F8 可以一次停止自動戰鬥、選卡和進關。
