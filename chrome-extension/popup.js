const SERVER_URL = 'https://aviator-trader-1.render.com';
const CREDENTIALS = {
  email: 'diegofsmaia01@gmail.com',
  password: 'Alexia270115'
};

const el = (id) => document.getElementById(id);

let captureActive = false;

function updateStatus(status, text) {
  const dot = el('statusDot');
  dot.className = 'dot';
  if (status === 'online') dot.classList.add('green');
  else if (status === 'offline') dot.classList.add('red');
  else dot.classList.add('yellow');
  el('statusText').textContent = text;
}

function addLog(msg) {
  const container = el('logsContainer');
  const now = new Date().toLocaleTimeString('pt-BR');
  const entry = document.createElement('div');
  entry.className = 'entry';
  entry.innerHTML = `<span class="ts">[${now}]</span> ${msg}`;
  container.prepend(entry);
  if (container.children.length > 100) container.removeChild(container.lastChild);
}

function loadState() {
  chrome.storage.local.get(['captureActive', 'lastMultiplier', 'lastTime', 'roundNumber', 'roundTime', 'sentCount'], (data) => {
    captureActive = data.captureActive || false;
    if (captureActive) {
      el('btnStart').style.display = 'none';
      el('btnStop').style.display = 'block';
      updateStatus('online', 'Capturando...');
    } else {
      el('btnStart').style.display = 'block';
      el('btnStop').style.display = 'none';
      updateStatus('offline', 'Parado');
    }
    if (data.lastMultiplier) el('lastMultiplier').textContent = data.lastMultiplier + 'x';
    if (data.lastTime) el('lastTime').textContent = data.lastTime;
    if (data.roundNumber) el('roundNumber').textContent = '#' + data.roundNumber;
    if (data.roundTime) el('roundTime').textContent = data.roundTime;
    if (data.sentCount) el('sentCount').textContent = data.sentCount;
  });
}

function sendToContent(action, data = {}) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) return;
    const tab = tabs[0];
    if (!tab.url || !tab.url.includes('tipminer.com')) {
      addLog('<span style="color:#ff5252;">⚠ Abra o site tipminer.com para usar a extensão</span>');
      return;
    }
    chrome.tabs.sendMessage(tab.id, { action, ...data }, (response) => {
      if (chrome.runtime.lastError) {
        addLog('<span style="color:#ff5252;">⚠ Recarregue a página do TipMiner</span>');
      }
    });
  });
}

el('btnStart').addEventListener('click', () => {
  chrome.storage.local.set({ captureActive: true }, () => {
    sendToContent('startCapture', { serverUrl: SERVER_URL, credentials: CREDENTIALS });
    captureActive = true;
    el('btnStart').style.display = 'none';
    el('btnStop').style.display = 'block';
    updateStatus('online', 'Iniciando captura...');
    addLog('🚀 Captura iniciada');
  });
});

el('btnStop').addEventListener('click', () => {
  chrome.storage.local.set({ captureActive: false }, () => {
    sendToContent('stopCapture');
    captureActive = false;
    el('btnStart').style.display = 'block';
    el('btnStop').style.display = 'none';
    updateStatus('offline', 'Parado');
    addLog('⏹ Captura parada');
  });
});

el('btnTestServer').addEventListener('click', () => {
  addLog('🔗 Testando conexão com servidor...');
  updateStatus('yellow', 'Testando...');
  fetch(SERVER_URL + '/api/health', { method: 'GET', mode: 'cors' })
    .then(r => r.json())
    .then(data => {
      addLog('✅ Servidor respondeu: ' + JSON.stringify(data));
      updateStatus('online', 'Servidor OK');
      setTimeout(() => updateStatus(captureActive ? 'online' : 'offline', captureActive ? 'Capturando...' : 'Parado'), 3000);
    })
    .catch(err => {
      addLog('<span style="color:#ff5252;">❌ Erro servidor: ' + err.message + '</span>');
      updateStatus('offline', 'Servidor offline');
      setTimeout(() => updateStatus(captureActive ? 'online' : 'offline', captureActive ? 'Capturando...' : 'Parado'), 3000);
    });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'log') addLog(msg.text);
  if (msg.type === 'updateStats') {
    if (msg.lastMultiplier) { el('lastMultiplier').textContent = msg.lastMultiplier + 'x'; el('lastTime').textContent = msg.lastTime; }
    if (msg.roundNumber) { el('roundNumber').textContent = '#' + msg.roundNumber; el('roundTime').textContent = msg.roundTime; }
    if (msg.sentCount !== undefined) el('sentCount').textContent = msg.sentCount;
  }
});

loadState();
