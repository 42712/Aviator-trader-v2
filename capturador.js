const WebSocket = require('ws');
const https = require('https');
const http = require('http');

const WS_URL = 'wss://apiglobal.appbackend.tech/ws/signals/v2/aviator';
const API_URL = 'https://aviator-trader-v2.onrender.com/api/nova-vela';

const enviadas = new Set();
let rodadaCache = null;
let ultimoEnvio = 0;

function log(msg) {
  const time = new Date().toLocaleTimeString('pt-BR');
  console.log(`[${time}] ${msg}`);
}

function calcularSoma(mult) {
  const str = mult.toFixed(2).replace('.', '');
  let soma = 0;
  for (let i = 0; i < str.length && i < 3; i++) soma += parseInt(str[i]) || 0;
  return soma;
}

function enviarVela(mult, rodada, timestamp, origem) {
  const multNum = parseFloat(mult);
  if (isNaN(multNum) || multNum <= 0 || multNum > 10000) return;

  const chave = '1_' + rodada;
  if (enviadas.has(chave)) return;
  enviadas.add(chave);
  if (enviadas.size > 10000) enviadas.clear();

  const horario = timestamp || new Date().toLocaleTimeString('pt-BR');

  const payload = JSON.stringify({
    painel: 1,
    multiplicador: multNum,
    rodada: String(rodada),
    timestamp: horario,
    soma: calcularSoma(multNum),
    fonte: origem || 'ws-sortenabet'
  });

  const url = new URL(API_URL);
  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (json.ok) {
          log(`✅ ${multNum.toFixed(2)}x | Rodada #${rodada} | Fonte: ${origem}`);
        }
      } catch (e) {}
    });
  });

  req.on('error', (err) => {
    log(`❌ Erro servidor: ${err.message}`);
  });

  req.write(payload);
  req.end();
}

function conectarWS() {
  log('🔌 Conectando ao servidor de sinais...');

  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    log('✅ WebSocket conectado - aguardando sinais da Sortenabet...');
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'connected') {
        log('📡 ' + msg.message);
        return;
      }

      if (msg.casa !== 'sortenabet') return;

      const mult = parseFloat(msg.data?.valor);
      if (isNaN(mult) || mult <= 0) return;

      const rodada = msg.data?.rodada || msg.data?.round || `ws-${Date.now()}`;
      const timestamp = msg.data?.createdAt 
        ? new Date(msg.data.createdAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false })
        : null;

      enviarVela(mult, rodada, timestamp, 'ws-sortenabet');
      ultimoEnvio = Date.now();
    } catch (ex) {
      // Ignora mensagens que não são JSON ou não tem o formato esperado
    }
  });

  ws.on('close', () => {
    log('🔌 WebSocket desconectado - reconectando em 5s...');
    setTimeout(conectarWS, 5000);
  });

  ws.on('error', (err) => {
    log(`⚠️ Erro WebSocket: ${err.message}`);
    ws.close();
  });
}

// ===== TIPMINER SCRAPER via API =====
function tentarScraperTipMiner() {
  log('🔍 Tentando buscar dados do TipMiner...');

  const url = 'https://www.tipminer.com/br/historico/sortenabet/aviator?limit=50';
  
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, (res) => {
    let html = '';
    res.on('data', chunk => html += chunk);
    res.on('end', () => {
      // Procura por padrões de multiplicador + rodada no HTML
      const regex = /(\d+[.,]\d{2})x[^<]*?(?:Rodada|#)\s*(\d+)/gi;
      let match;
      let encontrados = 0;
      
      while ((match = regex.exec(html)) !== null) {
        const mult = parseFloat(match[1].replace(',', '.'));
        const rodada = match[2];
        if (mult > 0 && rodada) {
          enviarVela(mult, rodada, null, 'tipminer-scraper');
          encontrados++;
        }
      }

      if (encontrados > 0) {
        log(`📊 TipMiner: ${encontrados} velas encontradas no HTML`);
      }

      // Tenta extrair dados de JSON embutido (RSC payload)
      const jsonMatches = html.match(/\{[^}]*"multiplicador"[^}]*\}/gi);
      if (jsonMatches) {
        jsonMatches.forEach(jsonStr => {
          try {
            const data = JSON.parse(jsonStr);
            if (data.multiplicador && data.rodada) {
              enviarVela(data.multiplicador, data.rodada, data.timestamp || data.horario, 'tipminer-json');
            }
          } catch (e) {}
        });
      }
    });
  }).on('error', (err) => {
    log(`⚠️ Erro TipMiner: ${err.message}`);
  });
}

// Inicia
log('🚀 =========================================');
log('   AVIATOR TRADER - CAPTURADOR DEDICADO');
log('   Servidor: ' + API_URL);
log('   WebSocket: ' + WS_URL);
log('   =========================================');

conectarWS();

// Tenta TipMiner a cada 30s como fallback
setInterval(tentarScraperTipMiner, 30000);
tentarScraperTipMiner();

// Status a cada 5 min
setInterval(() => {
  https.get(API_URL.replace('/api/nova-vela', '/api/status'), (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        log(`📊 Status servidor: ${json.total_velas} velas | Uptime: ${json.uptime}`);
      } catch (e) {}
    });
  }).on('error', () => {});
}, 5 * 60 * 1000);

// Keep alive
process.on('uncaughtException', (err) => {
  console.error('Erro:', err.message);
});
