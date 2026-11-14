// ISOLATED world: expose the extension id so the in-page panel can ask the background to hot-reload.
document.documentElement.dataset.robotExt = chrome.runtime.id;
