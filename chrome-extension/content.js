const API_URL = "https://aviator-trader-1.onrender.com/api/nova-vela";
const WS_SIGNAL_URL = "wss://apiglobal.appbackend.tech/ws/signals/v2/aviator";

let painelCache = 1;
let rodadaCache = null;
const enviadas = new Set();
let wsConnection = null;
let ultimoEnvioWS = 0;
let capturaAtiva = false;
let sentCount = 0;
let lastMultiplier = null;
let lastTime = null;

function detectarPainel() {
  const href = window.location.href;
  if (href.includes('aviator2')) return 2;
  if (href.includes('aviator/2')) return 2;
  return 1;
}

function calcularSoma(mult) {
  const str = mult.toFixed(2).replace('.', '');
  let soma = 0;
  for (let i = 0; i < str.length && i < 3; i++) soma += parseInt(str[i]) || 0;
  return soma;
}

function log(msg) {
  console.log('[AviatorTrader]', msg);
  try { chrome.runtime.sendMessage({ type: 'log', text: msg }); } catch(e) {}
}

function updateStats(data) {
  try { chrome.runtime.sendMessage({ type: 'updateStats', ...data }); } catch(e) {}
  try { chrome.storage.local.set(data); } catch(e) {}
}

function enviarVela(mult, rodada, timestamp, origem) {
  const multNum = parseFloat(mult);
  if (isNaN(multNum) || multNum <= 0 || multNum > 10000) return;

  const painel = detectarPainel();
  const chave = painel + '_' + rodada;
  if (enviadas.has(chave)) return;
  enviadas.add(chave);

  if (enviadas.size > 10000) enviadas.clear();

  const horario = timestamp || new Date().toLocaleTimeString('pt-BR');

  const payload = {
    painel,
    multiplicador: multNum,
    rodada: String(rodada),
    timestamp: horario,
    soma: calcularSoma(multNum),
    fonte: origem || 'sortenabet'
  };

  lastMultiplier = multNum;
  lastTime = horario;
  sentCount++;

  updateStats({
    lastMultiplier: multNum.toFixed(2),
    lastTime: horario,
    roundNumber: rodada,
    roundTime: horario,
    sentCount
  });

  fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(r => r.json())
  .then(d => {
    if (d.ok) log(`✅ SINAL: ${multNum.toFixed(2)}x | Rodada #${rodada} | Painel ${painel}`);
  })
  .catch(err => {
    log(`❌ Erro servidor: ${err.message}`);
  });
}

// ===== EXTRAIR RODADA DO DOM =====
function extrairRodada() {
  const modalSpan = document.querySelector('app-fairness span.text-uppercase');
  if (modalSpan) {
    const match = modalSpan.textContent.match(/Rodada\s+(\d+)/);
    if (match) return match[1];
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;
  while ((node = walker.nextNode())) {
    const match = node.textContent.match(/Rodada\s+(\d+)/);
    if (match) return match[1];
  }
  for (const iframe of document.querySelectorAll('iframe')) {
    try {
      if (!iframe.contentDocument) continue;
      const w = iframe.contentDocument.createTreeWalker(iframe.contentDocument.body, NodeFilter.SHOW_TEXT, null, false);
      let n;
      while ((n = w.nextNode())) {
        const m = n.textContent.match(/Rodada\s+(\d+)/);
        if (m) return m[1];
      }
    } catch(e) {}
  }
  const roundEl = document.querySelector('[class*="round" i], [data-round], game-round-id');
  if (roundEl) return roundEl.getAttribute('data-round') || roundEl.textContent.trim();
  return null;
}

function atualizarCacheRodada() {
  const r = extrairRodada();
  if (r) rodadaCache = r;
}
setInterval(atualizarCacheRodada, 300);
atualizarCacheRodada();

function formatarTimestamp(isoStr) {
  if (!isoStr) return null;
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
  } catch (e) { return null; }
}

// ===== WEBSOCKET (fonte principal de sinais) =====
function conectarWS() {
  if (!capturaAtiva) return;
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) return;

  try {
    wsConnection = new WebSocket(WS_SIGNAL_URL);
    wsConnection.onopen = () => log('🔌 WS conectado ao servidor de sinais');
    
    wsConnection.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.casa !== 'sortenabet') return;
        const mult = parseFloat(msg.data?.valor);
        if (isNaN(mult) || mult <= 0) return;
        const rodada = rodadaCache || extrairRodada() || `ws-${Date.now()}`;
        const timestamp = formatarTimestamp(msg.data?.createdAt);
        enviarVela(mult, rodada, timestamp, 'ws-sortenabet');
        ultimoEnvioWS = Date.now();
      } catch (ex) {}
    };

    wsConnection.onclose = () => {
      wsConnection = null;
      if (capturaAtiva) setTimeout(conectarWS, 5000);
    };
    
    wsConnection.onerror = () => {
      if (wsConnection) wsConnection.close();
    };
  } catch (e) {
    if (capturaAtiva) setTimeout(conectarWS, 5000);
  }
}

// ===== DOM SCANNER (fallback) =====
let ultPayout = 0;
let maxPayoutRodada = 0;

function iniciarDOMScanner() {
  setInterval(() => {
    if (!capturaAtiva) return;
    if (Date.now() - ultimoEnvioWS <= 10000) return;

    const el = document.querySelector('.payout');
    if (!el) return;
    const m = el.textContent.match(/(\d+\.?\d*)x/);
    if (!m) return;
    const mult = parseFloat(m[1]);
    if (isNaN(mult)) return;

    if (ultPayout >= 1.01 && mult <= 1.01 && maxPayoutRodada >= 1.01) {
      const rodada = rodadaCache || extrairRodada() || `dom-${Date.now()}`;
      enviarVela(maxPayoutRodada, rodada, null, 'dom');
      maxPayoutRodada = 0;
    }
    if (mult > maxPayoutRodada) maxPayoutRodada = mult;
    ultPayout = mult;
  }, 1000);
}

// ===== OUVIR DADOS DO MAIN WORLD =====
window.addEventListener('aviator-ws-data', (e) => {
  if (!capturaAtiva) return;
  try {
    let data = e.detail;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch(ex) { return; }
    }
    if (!data || typeof data !== 'object') return;
    
    const mult = parseFloat(data.valor || data.multiplier || data.mult || data.coefficient || data.crash_point);
    if (isNaN(mult) || mult <= 0) return;
    
    const rodada = data.rodada || data.round || rodadaCache || extrairRodada() || `ev-${Date.now()}`;
    enviarVela(mult, rodada, null, 'main-world');
  } catch(ex) {}
});

// ===== OUVIR DADOS DO INJECT.JS (TipMiner) =====
window.addEventListener('message', function(event) {
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || msg.source !== 'aviator-trader-inject') return;

  if (msg.type === 'game_data' && capturaAtiva) {
    const p = msg.payload;
    enviarVela(p.multiplier, p.round, p.timestamp, 'tipminer-inject');
  }
  if (msg.type === 'inject_loaded') {
    log('✅ Injected script ativo no TipMiner');
  }
});

// ===== TIPMINER - captura de histórico =====
function isTipMiner() {
  return window.location.hostname.includes('tipminer.com');
}

function injectPageScript() {
  if (!isTipMiner()) return;
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject.js');
  script.onload = function() { script.remove(); };
  (document.head || document.documentElement).appendChild(script);
}

function iniciarTipMinerCapture() {
  if (!isTipMiner()) return;
  log('📊 Modo TipMiner ativo - monitorando histórico');
  injectPageScript();
}

let tipMinerScannerInterval = null;

function scanTipMinerRows() {
  if (!capturaAtiva) return;

  const rows = document.querySelectorAll('tr, .row-result, .history-item, [class*="bet"]');
  for (const row of rows) {
    const text = row.textContent || row.innerText || '';
    
    const multMatch = text.match(/(\d+[.,]\d+)x/i);
    if (!multMatch) continue;
    const mult = parseFloat(multMatch[1].replace(',', '.'));
    if (isNaN(mult) || mult <= 0) continue;
    
    const roundMatch = text.match(/(?:Rodada|Round|#)\s*(\d+)/i) || text.match(/\d{7,}/);
    const rodada = roundMatch ? roundMatch[1] || roundMatch[0] : null;
    if (!rodada) continue;
    
    const timeMatch = text.match(/(\d{2}:\d{2}(?::\d{2})?)/);
    const timestamp = timeMatch ? timeMatch[1] : null;
    
    enviarVela(mult, rodada, timestamp, 'tipminer');
  }
}

// ===== CONTROLE DA EXTENSÃO =====
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'startCapture') {
    capturaAtiva = true;
    log('🚀 Captura iniciada');
    conectarWS();
    if (isTipMiner()) {
      iniciarTipMinerCapture();
      tipMinerScannerInterval = setInterval(scanTipMinerRows, 3000);
      scanTipMinerRows();
    }
    chrome.storage.local.set({ captureActive: true });
    sendResponse({ status: 'started' });
  } else if (msg.action === 'stopCapture') {
    capturaAtiva = false;
    if (wsConnection) { wsConnection.close(); wsConnection = null; }
    if (tipMinerScannerInterval) { clearInterval(tipMinerScannerInterval); tipMinerScannerInterval = null; }
    log('⏹ Captura parada');
    chrome.storage.local.set({ captureActive: false });
    sendResponse({ status: 'stopped' });
  } else if (msg.action === 'getStatus') {
    sendResponse({
      captureActive: capturaAtiva,
      lastMultiplier, lastTime,
      roundNumber: rodadaCache,
      sentCount
    });
  }
  return true;
});

// ===== INICIALIZAÇÃO =====
chrome.storage.local.get(['captureActive'], (data) => {
  if (data.captureActive) {
    capturaAtiva = true;
    log('🔄 Restaurando captura...');
    conectarWS();
    if (isTipMiner()) {
      iniciarTipMinerCapture();
      tipMinerScannerInterval = setInterval(scanTipMinerRows, 3000);
      scanTipMinerRows();
    }
  }
});

painelCache = detectarPainel();
iniciarDOMScanner();

log(`📦 Content script carregado | Modo: ${isTipMiner() ? 'TipMiner' : 'Game Page'} | Painel: ${painelCache}`);
