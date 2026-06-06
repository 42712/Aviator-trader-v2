(function() {
  'use strict';

  const NATIVE_FETCH = window.fetch;
  const NATIVE_XHR_OPEN = window.XMLHttpRequest.prototype.open;
  const NATIVE_XHR_SEND = window.XMLHttpRequest.prototype.send;

  function postToContent(msg) {
    window.postMessage({ source: 'aviator-trader-inject', ...msg }, '*');
  }

  function interceptFetch() {
    window.fetch = function(input, init) {
      const url = typeof input === 'string' ? input : (input.url || '');

      return NATIVE_FETCH.apply(this, arguments).then(response => {
        const cloned = response.clone();
        cloned.text().then(body => {
          try {
            const json = JSON.parse(body);
            processResponse(json, url);
          } catch(e) {}
        }).catch(() => {});
        return response;
      });
    };
  }

  function interceptXHR() {
    window.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this._aviatorUrl = url;
      return NATIVE_XHR_OPEN.apply(this, [method, url, ...rest]);
    };

    window.XMLHttpRequest.prototype.send = function(...args) {
      const url = this._aviatorUrl;
      const origOnReady = this.onreadystatechange;

      this.onreadystatechange = function() {
        if (this.readyState === 4 && this.status === 200 && url) {
          try { processResponse(JSON.parse(this.responseText), url); } catch(e) {}
        }
        if (origOnReady) origOnReady.apply(this, arguments);
      };

      return NATIVE_XHR_SEND.apply(this, args);
    };
  }

  function processResponse(data, url) {
    if (!data || typeof data !== 'object') return;

    let items = [];

    if (Array.isArray(data)) {
      items = data;
    } else if (data.data && Array.isArray(data.data)) {
      items = data.data;
    } else if (data.results && Array.isArray(data.results)) {
      items = data.results;
    } else if (data.items && Array.isArray(data.items)) {
      items = data.items;
    }

    for (const item of items) {
      let multiplier = parseFloat(item.multiplier || item.mult || item.coefficient || item.valor || item.crash_point);
      let round = item.round || item.rodada || item.id || item.game_id || item.round_id;
      let timestamp = item.timestamp || item.time || item.createdAt;

      if (!isNaN(multiplier) && multiplier > 0) {
        postToContent({
          type: 'game_data',
          payload: {
            multiplier,
            round: round || '',
            timestamp,
            source: 'tipminer-inject',
            raw: item
          }
        });
      }
    }
  }

  interceptFetch();
  interceptXHR();

  postToContent({ type: 'inject_loaded' });
  console.log('[AviatorTrader Inject] Ativo no TipMiner');
})();
