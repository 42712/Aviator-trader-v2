const SERVER_URL = 'https://aviator-trader-1.render.com';

let captureActive = false;
let sentCount = 0;
let reconnectTimer = null;

chrome.runtime.onInstalled.addListener(() => {
  console.log('[AviatorTrader BG] Extensão instalada');
  chrome.storage.local.set({
    captureActive: false,
    sentCount: 0,
    lastMultiplier: null,
    lastTime: null,
    roundNumber: null,
    roundTime: null
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'log') {
    console.log('[AviatorTrader BG]', msg.text);
  }

  if (msg.type === 'updateStats') {
    chrome.storage.local.set(msg);
  }

  if (msg.type === 'game_data') {
    handleGameData(msg.payload);
  }

  if (msg.type === 'startCapture') {
    captureActive = true;
    chrome.storage.local.set({ captureActive: true });
    sendToServer({ type: 'status', action: 'capture_started', timestamp: Date.now() }).catch(() => {});
  }

  if (msg.type === 'stopCapture') {
    captureActive = false;
    chrome.storage.local.set({ captureActive: false });
    sendToServer({ type: 'status', action: 'capture_stopped', timestamp: Date.now() }).catch(() => {});
  }

  return true;
});

function handleGameData(payload) {
  if (!captureActive) return;

  sendToServer({
    type: 'sinal',
    multiplier: payload.multiplier,
    round: payload.round || payload.roundId,
    timestamp: payload.timestamp || Date.now(),
    candles: payload.candles || [],
    source: payload.source || 'tipminer'
  }).catch(err => {
    console.error('[AviatorTrader BG] Erro ao enviar:', err);
  });
}

async function sendToServer(data) {
  try {
    const response = await fetch(SERVER_URL + '/api/sinal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      sentCount++;
      chrome.storage.local.set({ sentCount });
      const result = await response.json().catch(() => ({}));
      console.log('[AviatorTrader BG] ✅ Enviado #' + sentCount, result);
      return result;
    } else {
      console.warn('[AviatorTrader BG] ⚠ Servidor respondeu', response.status);
    }
  } catch (err) {
    console.error('[AviatorTrader BG] ❌ Falha ao enviar:', err.message);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    sendToServer({ type: 'ping', timestamp: Date.now() }).catch(() => {});
  }, 30000);
}

function checkServerHealth() {
  fetch(SERVER_URL + '/api/health', { method: 'GET' })
    .then(r => r.json())
    .then(data => {
      console.log('[AviatorTrader BG] 🏥 Servidor OK:', data);
    })
    .catch(err => {
      console.warn('[AviatorTrader BG] 🏥 Servidor offline:', err.message);
    });
}

setInterval(checkServerHealth, 60000);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('tipminer.com')) {
    chrome.storage.local.get(['captureActive'], (data) => {
      if (data.captureActive) {
        chrome.tabs.sendMessage(tabId, {
          action: 'startCapture',
          serverUrl: SERVER_URL
        }).catch(() => {});
      }
    });
  }
});

console.log('[AviatorTrader BG] ✅ Service Worker iniciado');
