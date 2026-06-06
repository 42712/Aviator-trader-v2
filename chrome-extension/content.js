(function() {
  'use strict';

  const SERVER_URL = 'https://aviator-trader-1.render.com';
  const STORAGE_KEY = 'aviator_trader_data';

  let captureActive = false;
  let sentCount = 0;
  let lastMultiplier = null;
  let lastTime = null;
  let roundNumber = 0;
  let currentRoundData = [];
  let wsIntercepted = false;
  let authToken = null;
  let gameObserver = null;

  function log(msg) {
    console.log('[AviatorTrader]', msg);
    chrome.runtime.sendMessage({ type: 'log', text: msg }).catch(() => {});
  }

  function updateStats(data) {
    chrome.runtime.sendMessage({ type: 'updateStats', ...data }).catch(() => {});
    chrome.storage.local.set(data);
  }

  function sendToServer(payload) {
    return fetch(SERVER_URL + '/api/sinal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': window.location.origin
      },
      body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(data => {
      sentCount++;
      updateStats({ sentCount });
      log('✅ Dados enviados ao servidor: #' + payload.round);
      return data;
    })
    .catch(err => {
      log('❌ Erro ao enviar ao servidor: ' + err.message);
    });
  }

  function interceptWebSocket() {
    if (wsIntercepted) return;
    wsIntercepted = true;

    const OriginalWebSocket = window.WebSocket;

    function ProxiedWebSocket(url, protocols) {
      const ws = new OriginalWebSocket(url, protocols);
      log('🔌 WebSocket conectado: ' + url);

      const originalAddEventListener = ws.addEventListener.bind(ws);
      ws.addEventListener = function(type, listener, options) {
        if (type === 'message') {
          const wrappedListener = function(event) {
            try {
              processWebSocketMessage(event.data, url);
            } catch (e) {
              console.error('[AviatorTrader] Erro ao processar mensagem WS:', e);
            }
            listener.call(this, event);
          };
          return originalAddEventListener(type, wrappedListener, options);
        }
        return originalAddEventListener(type, listener, options);
      };

      return ws;
    }

    ProxiedWebSocket.prototype = OriginalWebSocket.prototype;
    ProxiedWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    ProxiedWebSocket.OPEN = OriginalWebSocket.OPEN;
    ProxiedWebSocket.CLOSING = OriginalWebSocket.CLOSING;
    ProxiedWebSocket.CLOSED = OriginalWebSocket.CLOSED;

    window.WebSocket = ProxiedWebSocket;
    log('📡 Interceptador WebSocket ativado');
  }

  function processWebSocketMessage(data, url) {
    if (!captureActive) return;

    let parsed;
    try {
      parsed = typeof data === 'string' ? JSON.parse(data) : data;
    } catch (e) {
      return;
    }

    if (!parsed || typeof parsed !== 'object') return;

    const payload = extractGameData(parsed, url);
    if (payload) {
      handleGameData(payload);
    }
  }

  function extractGameData(data, url) {
    if (data.type === 'aviator' || data.type === 'game' || data.type === 'multiplier') {
      return {
        multiplier: data.multiplier || data.mult || data.crash_point || data.result || data.coefficient,
        round: data.round || data.game_id || data.id || data.round_id,
        timestamp: data.timestamp || data.ts || Date.now(),
        raw: data
      };
    }

    if (data.multiplier !== undefined) {
      return {
        multiplier: data.multiplier,
        round: data.round || data.game_id || data.id || data.round_id || (roundNumber + 1),
        timestamp: data.timestamp || data.ts || Date.now(),
        raw: data
      };
    }

    if (data.coefficient !== undefined || data.crash_point !== undefined) {
      return {
        multiplier: data.coefficient || data.crash_point,
        round: data.round || data.game_id || data.id || data.round_id || (roundNumber + 1),
        timestamp: data.timestamp || Date.now(),
        raw: data
      };
    }

    if (data.result !== undefined && typeof data.result === 'number' && data.result > 0) {
      return {
        multiplier: data.result,
        round: data.round || data.game_id || data.id || data.round_id || (roundNumber + 1),
        timestamp: data.timestamp || Date.now(),
        raw: data
      };
    }

    return null;
  }

  function handleGameData(payload) {
    const mult = parseFloat(payload.multiplier);
    const now = new Date().toLocaleTimeString('pt-BR');

    if (!mult || mult <= 0) return;

    if (payload.round && payload.round !== roundNumber) {
      roundNumber = payload.round;
      currentRoundData = [];
    }

    currentRoundData.push({
      multiplier: mult,
      timestamp: payload.timestamp || Date.now(),
      time: now
    });

    lastMultiplier = mult;
    lastTime = now;

    updateStats({
      lastMultiplier: mult.toFixed(2),
      lastTime: now,
      roundNumber: roundNumber,
      roundTime: now
    });

    log(`📊 Mult: <span class="mult">${mult.toFixed(2)}x</span> | Rodada #${roundNumber}`);

    sendToServer({
      multiplier: mult,
      round: roundNumber,
      timestamp: Date.now(),
      candles: currentRoundData.slice(-10),
      source: 'tipminer',
      site: window.location.hostname
    });
  }

  function observeDOM() {
    if (gameObserver) gameObserver.disconnect();

    gameObserver = new MutationObserver((mutations) => {
      if (!captureActive) return;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          scanElementForGameData(node);
        }
        if (mutation.type === 'characterData' || mutation.type === 'attributes') {
          scanElementForGameData(mutation.target);
        }
      }
    });

    gameObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'data-result', 'data-multiplier', 'data-round']
    });

    log('👁 Observer DOM ativado');
  }

  function scanElementForGameData(el) {
    const selectors = [
      '[data-multiplier]',
      '[data-result]',
      '[data-coefficient]',
      '[data-crash]',
      '.multiplier-value',
      '.crash-point',
      '.game-result',
      '.round-result',
      '.coefficient',
      '[class*="multiplier"]',
      '[class*="coefficient"]',
      '[class*="crash"]'
    ];

    for (const selector of selectors) {
      const target = el.matches ? (el.matches(selector) ? el : el.querySelector(selector)) : null;
      if (!target) continue;

      const multAttr = target.getAttribute('data-multiplier') ||
                       target.getAttribute('data-result') ||
                       target.getAttribute('data-coefficient') ||
                       target.getAttribute('data-crash');

      let multiplier = multAttr ? parseFloat(multAttr) : null;

      if (!multiplier) {
        const text = target.textContent || target.innerText || '';
        const match = text.match(/(\d+[.,]\d+)x?/);
        if (match) {
          multiplier = parseFloat(match[1].replace(',', '.'));
        }
      }

      const roundAttr = target.getAttribute('data-round') || target.getAttribute('data-game-id');
      const round = roundAttr ? parseInt(roundAttr) : null;

      if (multiplier && multiplier > 0) {
        if (round && round !== roundNumber) {
          roundNumber = round;
          currentRoundData = [];
        }
        handleGameData({
          multiplier,
          round: round || (roundNumber + 1),
          timestamp: Date.now()
        });
        break;
      }
    }
  }

  function doLogin(email, password) {
    log('🔑 Tentando login automático...');

    const emailInput = document.querySelector('input[type="email"], input[name="email"], input[placeholder*="email"], input[placeholder*="Email"]');
    const passInput = document.querySelector('input[type="password"], input[name="password"], input[name="senha"]');

    if (emailInput && passInput) {
      emailInput.value = email;
      passInput.value = password;

      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      emailInput.dispatchEvent(new Event('change', { bubbles: true }));
      passInput.dispatchEvent(new Event('input', { bubbles: true }));
      passInput.dispatchEvent(new Event('change', { bubbles: true }));

      const loginBtn = document.querySelector('button[type="submit"], button:has-text("Entrar"), button:has-text("Login"), button:has-text("Acessar"), input[type="submit"]');
      if (loginBtn) {
        setTimeout(() => {
          loginBtn.click();
          log('✅ Login automático executado');
        }, 500);
      } else {
        log('⚠ Campos preenchidos, clique em Entrar manualmente');
      }
    } else {
      log('ℹ Campos de login não encontrados - talvez já esteja logado');
    }
  }

  function injectPageScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = function() { script.remove(); };
    (document.head || document.documentElement).appendChild(script);
    log('📦 Script de injeção carregado na página');
  }

  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== 'aviator-trader-inject') return;

    if (msg.type === 'game_data' && captureActive) {
      handleGameData(msg.payload);
    }
    if (msg.type === 'inject_loaded') {
      log('✅ Script injetado ativo');
      window.postMessage({ source: 'aviator-trader-content', action: 'start_inject' }, '*');
    }
    if (msg.type === 'inject_ready') {
      log('✅ Interceptadores ativos na página');
    }
    if (msg.type === 'ws_connect') {
      log('🔌 WS: ' + msg.url.substring(0, 80));
    }
  });

  function startCapture(serverUrl, credentials) {
    captureActive = true;
    if (serverUrl) window._aviatorServerUrl = serverUrl;
    log('🚀 Captura iniciada');

    injectPageScript();
    interceptWebSocket();
    observeDOM();

    if (credentials && credentials.email && credentials.password) {
      setTimeout(() => doLogin(credentials.email, credentials.password), 2000);
    }

    chrome.storage.local.set({ captureActive: true });
  }

  function stopCapture() {
    captureActive = false;
    if (gameObserver) gameObserver.disconnect();
    gameObserver = null;
    log('⏹ Captura parada');
    chrome.storage.local.set({ captureActive: false });
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'startCapture') {
      startCapture(msg.serverUrl, msg.credentials);
      sendResponse({ status: 'started' });
    } else if (msg.action === 'stopCapture') {
      stopCapture();
      sendResponse({ status: 'stopped' });
    } else if (msg.action === 'getStatus') {
      sendResponse({
        captureActive,
        lastMultiplier,
        lastTime,
        roundNumber,
        sentCount
      });
    }
    return true;
  });

  chrome.storage.local.get(['captureActive'], (data) => {
    if (data.captureActive) {
      startCapture(SERVER_URL, null);
    }
  });

  log('📦 Content script carregado - aguardando comandos');
})();
