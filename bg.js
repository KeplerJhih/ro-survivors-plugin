// Background service worker
// 1) 熱更新：面板 → sendMessage(extId, {type:'reload'}) → 從硬碟重新載入擴充功能 → 啟動時把 bot.js 重新注入該分頁
// 2) 長時間掛機：nodiscard（分頁不被自動釋放）、awake（保持電腦清醒）、restore（被最小化時還原視窗）、popout（移到獨立視窗）
chrome.runtime.onMessageExternal.addListener((msg, sender, reply) => {
  const tab = sender.tab;
  if (!tab) return;
  const done = (p) => { Promise.resolve(p).then((r) => reply({ ok: true, ...(r || {}) })).catch((e) => reply({ ok: false, error: String(e?.message || e) })); return true; };
  switch (msg?.type) {
    case 'reload':
      chrome.storage.local.set({ pendingInject: tab.id }, () => {
        reply({ ok: true });
        setTimeout(() => chrome.runtime.reload(), 150);
      });
      return true;
    case 'nodiscard':
      return done(chrome.tabs.update(tab.id, { autoDiscardable: false }).then(() => ({})));
    case 'awake':
      if (msg.on) chrome.power.requestKeepAwake('display'); else chrome.power.releaseKeepAwake();
      return done({});
    case 'restore':
      return done(chrome.windows.get(tab.windowId).then((w) => (w.state === 'minimized' ? chrome.windows.update(w.id, { state: 'normal', focused: false }).then(() => ({ restored: true })) : { restored: false })));
    case 'popout':
      return done(chrome.tabs.query({ windowId: tab.windowId }).then((tabs) => {
        if (tabs.length <= 1) return { alone: true };
        return chrome.windows.create({ tabId: tab.id, type: 'normal', focused: true, width: 1400, height: 900 }).then(() => ({ moved: true }));
      }));
  }
});

(async () => {
  const { pendingInject } = await chrome.storage.local.get('pendingInject');
  if (pendingInject == null) return;
  await chrome.storage.local.remove('pendingInject');
  try {
    await chrome.scripting.executeScript({ target: { tabId: pendingInject }, files: ['bot.js'], world: 'MAIN' });
    await chrome.scripting.executeScript({ target: { tabId: pendingInject }, files: ['bridge.js'] });
  } catch (e) {
    console.warn('re-inject failed', e);
  }
})();
