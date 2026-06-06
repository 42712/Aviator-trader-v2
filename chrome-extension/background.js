const API_URL = 'https://aviator-trader-1.onrender.com';

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
  console.log('[BG] Aviator Trader iniciado');
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    console.log('[BG] Alive');
  }
});

setInterval(() => {
  fetch(API_URL + '/api/status').then(r => r.json()).then(d => {
    console.log('[BG] Servidor OK - Velas:', d.total_velas);
  }).catch(() => {});
}, 4 * 60 * 1000);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'log') {
    console.log('[BG]', msg.text);
  }
  if (msg.type === 'updateStats') {
    chrome.storage.local.set(msg);
  }
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && 
     (tab.url.includes('sortenabet') || tab.url.includes('betou') || tab.url.includes('tipminer'))) {
    chrome.storage.local.get(['captureActive'], (data) => {
      if (data.captureActive) {
        chrome.tabs.sendMessage(tabId, { action: 'startCapture' }).catch(() => {});
      }
    });
  }
});
