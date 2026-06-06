(function() {
  'use strict';

  const NATIVE_WS = window.WebSocket;
  const NATIVE_FETCH = window.fetch;
  const NATIVE_XHR_OPEN = window.XMLHttpRequest.prototype.open;
  const NATIVE_XHR_SEND = window.XMLHttpRequest.prototype.send;

  let isActive = false;
  let capturedData = [];
  let roundCache = new Set();

  function postToContent(msg) {
    window.postMessage({ source: 'aviator-trader-inject', ...msg }, '*');
  }

  function interceptWebSocket() {
    window.WebSocket = function(url, protocols) {
      const ws = new NATIVE_WS(url, protocols);
      postToContent({ type: 'ws_connect', url });

      const origAddEventListener = ws.addEventListener;
      ws.addEventListener = function(type, listener, options) {
        if (type === 'message') {
          const wrapped = function(event) {
            try {
              const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
              processMessage(data, url);
            } catch(e) {}
            listener.call(this, event);
          };
          return origAddEventListener.call(this, type, wrapped, options);
        }
        return origAddEventListener.call(this, type, listener, options);
      };

      ws._originalClose = ws.close;
      ws.close = function() {
        postToContent({ type: 'ws_close', url });
        return ws._originalClose.apply(this, arguments);
      };

      return ws;
    };
    window.WebSocket.prototype = NATIVE_WS.prototype;
    window.WebSocket.CONNECTING = 0;
    window.WebSocket.OPEN = 1;
    window.WebSocket.CLOSING = 2;
    window.WebSocket.CLOSED = 3;
  }

  function interceptFetch() {
    window.fetch = function(input, init) {
      const url = typeof input === 'string' ? input : (input.url || '');
      const method = (init && init.method) || 'GET';

      return NATIVE_FETCH.apply(this, arguments).then(response => {
        if (url.includes('aviator') || url.includes('game') || url.includes('multiplier') || url.includes('crash') || url.includes('spribe')) {
          const cloned = response.clone();
          cloned.text().then(body => {
            try {
              const json = JSON.parse(body);
              processMessage(json, url);
            } catch(e) {}
          }).catch(() => {});
        }
        return response;
      });
    };
  }

  function interceptXHR() {
    window.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this._aviatorUrl = url;
      this._aviatorMethod = method;
      return NATIVE_XHR_OPEN.apply(this, [method, url, ...rest]);
    };

    window.XMLHttpRequest.prototype.send = function(...args) {
      const url = this._aviatorUrl;
      const origOnReady = this.onreadystatechange;

      this.onreadystatechange = function() {
        if (this.readyState === 4 && this.status === 200 && url) {
          if (url.includes('aviator') || url.includes('game') || url.includes('multiplier') || url.includes('crash') || url.includes('spribe')) {
            try {
              const json = JSON.parse(this.responseText);
              processMessage(json, url);
            } catch(e) {}
          }
        }
        if (origOnReady) origOnReady.apply(this, arguments);
      };

      return NATIVE_XHR_SEND.apply(this, args);
    };
  }

  function processMessage(data, source) {
    if (!data || typeof data !== 'object') return;

    let multiplier = null;
    let round = null;
    let timestamp = Date.now();
    let candles = null;

    if (data.type === 'aviator_tick' || data.type === 'tick') {
      multiplier = data.multiplier || data.mult || data.coefficient;
      round = data.round || data.round_id || data.game_id;
      candles = data.candles || data.history;
    }
    else if (data.type === 'aviator_result' || data.type === 'game_result' || data.type === 'crash') {
      multiplier = data.multiplier || data.result || data.crash_point || data.coefficient;
      round = data.round || data.round_id || data.game_id;
      candles = data.candles || data.history;
    }
    else if (data.multiplier !== undefined || data.coefficient !== undefined || data.crash_point !== undefined) {
      multiplier = data.multiplier || data.coefficient || data.crash_point;
      round = data.round || data.round_id || data.game_id || data.id;
      candles = data.candles || data.history;
    }
    else if (Array.isArray(data)) {
      for (const item of data) {
        processMessage(item, source);
      }
      return;
    }

    if (data.result && typeof data.result === 'number' && data.result > 0 && !multiplier) {
      multiplier = data.result;
    }

    if (multiplier !== null && multiplier !== undefined) {
      const mult = parseFloat(multiplier);
      if (isNaN(mult) || mult <= 0 || mult > 10000) return;

      const roundId = round ? String(round) : ('r_' + Date.now());

      const payload = {
        multiplier: mult,
        round: round || null,
        roundId: roundId,
        timestamp: timestamp,
        time: new Date().toLocaleTimeString('pt-BR'),
        candles: candles || (capturedData.length > 0 ? capturedData.slice(-20) : []),
        source: source || 'unknown'
      };

      capturedData.push({ mult, ts: timestamp, round: roundId });

      if (capturedData.length > 200) capturedData = capturedData.slice(-200);

      postToContent({
        type: 'game_data',
        payload: payload
      });
    }
  }

  function startCapture() {
    if (isActive) return;
    isActive = true;
    capturedData = [];
    roundCache = new Set();

    interceptWebSocket();
    interceptFetch();
    interceptXHR();

    postToContent({ type: 'inject_ready' });
    console.log('[AviatorTrader Inject] ✅ Captura iniciada');
  }

  function stopCapture() {
    isActive = false;
    postToContent({ type: 'inject_stopped' });
  }

  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== 'aviator-trader-content') return;

    if (msg.action === 'start_inject') startCapture();
    if (msg.action === 'stop_inject') stopCapture();
  });

  postToContent({ type: 'inject_loaded' });
  console.log('[AviatorTrader Inject] 📦 Script injetado na página');
})();
