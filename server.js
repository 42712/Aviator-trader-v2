const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const WebSocket = require('ws');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const DATA_FILE = path.join(__dirname, 'velas.json');
const WS_URL = 'wss://apiglobal.appbackend.tech/ws/signals/v2/aviator';

let velas = [];
let startTime = Date.now();
const enviadas = new Set();

try {
  if (fs.existsSync(DATA_FILE)) {
    velas = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    console.log(`📂 ${velas.length} velas carregadas do disco`);
  }
} catch(e) { console.log('⚠️ Erro ao carregar velas.json'); }

function salvarVelas() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(velas.slice(-5000)), 'utf8'); } catch(e) {}
}

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

function registrarVela(painel, multiplicador, rodada, timestamp, fonte) {
  if (!multiplicador || isNaN(multiplicador)) return null;
  const multNum = parseFloat(multiplicador);
  if (multNum <= 0 || multNum > 10000) return null;

  const chave = painel + '_' + rodada;
  if (enviadas.has(chave)) return null;
  enviadas.add(chave);
  if (enviadas.size > 10000) enviadas.clear();

  const novaVela = {
    id: Date.now(),
    painel: painel || 1,
    multiplicador: multNum,
    rodada: String(rodada),
    timestamp: timestamp || new Date().toLocaleTimeString('pt-BR'),
    data_completa: new Date().toISOString(),
    soma: calcularSoma(multNum),
    fonte: fonte || 'ws'
  };

  velas.push(novaVela);
  if (velas.length > 5000) velas.shift();
  salvarVelas();

  log(`📊 ${multNum.toFixed(2)}x | Rodada #${rodada} | Fonte: ${fonte} | Painel ${painel}`);
  return novaVela;
}

// ============ WEBSOCKET CAPTURADOR ============
function conectarWS() {
  log('🔌 Conectando ao servidor de sinais...');

  try {
    const ws = new WebSocket(WS_URL);

    ws.on('open', () => {
      log('✅ WebSocket conectado - capturando sinais automaticamente');
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'connected') {
          log('📡 ' + msg.message);
          return;
        }
        if (msg.casa && msg.casa !== 'sortenabet') return;
        if (!msg.casa && !msg.data?.valor) return;

        const mult = parseFloat(msg.data?.valor);
        if (isNaN(mult) || mult <= 0) return;

        const rodada = msg.data?.rodada || msg.data?.round || `ws-${Date.now()}`;
        const timestamp = msg.data?.createdAt
          ? new Date(msg.data.createdAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false })
          : null;

        registrarVela(1, mult, rodada, timestamp, 'ws-sortenabet');
      } catch (ex) {}
    });

    ws.on('close', () => {
      log('🔌 WebSocket desconectado - reconectando em 5s...');
      setTimeout(conectarWS, 5000);
    });

    ws.on('error', (err) => {
      log(`⚠️ Erro WebSocket: ${err.message}`);
    });
  } catch(err) {
    log(`⚠️ Falha ao criar WebSocket: ${err.message}`);
    setTimeout(conectarWS, 10000);
  }
}

// ============ TIPMINER SCRAPER ============
function tentarScraperTipMiner() {
  const url = 'https://www.tipminer.com/br/historico/sortenabet/aviator?limit=50';

  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, (res) => {
    let html = '';
    res.on('data', chunk => html += chunk);
    res.on('end', () => {
      const regex = /(\d+[.,]\d{2})x[^<]*?(?:Rodada|#)\s*(\d+)/gi;
      let match;
      let encontrados = 0;

      while ((match = regex.exec(html)) !== null) {
        const mult = parseFloat(match[1].replace(',', '.'));
        const rodada = match[2];
        if (mult > 0 && rodada) {
          if (registrarVela(1, mult, rodada, null, 'tipminer-scraper')) encontrados++;
        }
      }

      if (encontrados > 0) {
        log(`📊 TipMiner: ${encontrados} velas encontradas`);
      }
    });
  }).on('error', (err) => {
    log(`⚠️ Erro TipMiner: ${err.message}`);
  });
}

// ============================================
// ENDPOINTS DA API
// ============================================

app.post('/api/nova-vela', (req, res) => {
    const { painel, multiplicador, rodada, timestamp, soma, fonte } = req.body;

    if (!multiplicador || isNaN(multiplicador)) {
        return res.status(400).json({ error: 'Multiplicador inválido' });
    }

    const resultado = registrarVela(
      painel || 1,
      multiplicador,
      rodada || String(Date.now()),
      timestamp,
      fonte || 'api-externa'
    );

    res.json({
        ok: true,
        id: resultado ? resultado.id : null,
        total: velas.length,
        mensagem: 'Vela capturada com sucesso!'
    });
});

app.get('/api/velas', (req, res) => {
    const { painel, limit = 100, offset = 0 } = req.query;
    let resultado = [...velas];

    if (painel) {
        resultado = resultado.filter(v => v.painel == painel);
    }

    resultado = resultado.reverse();

    const total = resultado.length;
    const paginado = resultado.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        velas: paginado
    });
});

app.get('/api/ultimas', (req, res) => {
    const { n = 10, painel } = req.query;
    let resultado = [...velas];

    if (painel) {
        resultado = resultado.filter(v => v.painel == painel);
    }

    resultado = resultado.slice(-parseInt(n)).reverse();
    res.json(resultado);
});

app.get('/api/status', (req, res) => {
    const ultimaVela = velas.length > 0 ? velas[velas.length - 1] : null;
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const horas = Math.floor(uptime / 3600);
    const minutos = Math.floor((uptime % 3600) / 60);
    const segundos = uptime % 60;

    res.json({
        status: 'online',
        versao: '2.0.0',
        uptime: `${horas}h ${minutos}m ${segundos}s`,
        total_velas: velas.length,
        ultima_vela: ultimaVela,
        endpoints: {
            status: 'GET /api/status',
            velas: 'GET /api/velas?painel=1&limit=100',
            ultimas: 'GET /api/ultimas?n=10',
            stats: 'GET /api/stats',
            nova_vela: 'POST /api/nova-vela'
        }
    });
});

app.get('/api/stats', (req, res) => {
    if (velas.length === 0) {
        return res.json({
            total_velas: 0,
            mensagem: 'Aguardando primeira vela...'
        });
    }

    const ultimas100 = velas.slice(-100);
    const ultimas500 = velas.slice(-500);

    const media100 = ultimas100.reduce((s, v) => s + v.multiplicador, 0) / ultimas100.length;
    const media500 = ultimas500.reduce((s, v) => s + v.multiplicador, 0) / ultimas500.length;

    const faixas = {
        'abaixo_2x': 0,
        '2x_a_5x': 0,
        '5x_a_10x': 0,
        '10x_a_20x': 0,
        '20x_a_50x': 0,
        'acima_50x': 0
    };

    ultimas500.forEach(v => {
        if (v.multiplicador < 2) faixas['abaixo_2x']++;
        else if (v.multiplicador < 5) faixas['2x_a_5x']++;
        else if (v.multiplicador < 10) faixas['5x_a_10x']++;
        else if (v.multiplicador < 20) faixas['10x_a_20x']++;
        else if (v.multiplicador < 50) faixas['20x_a_50x']++;
        else faixas['acima_50x']++;
    });

    const maiores = [...velas].sort((a, b) => b.multiplicador - a.multiplicador).slice(0, 10);

    res.json({
        total_velas: velas.length,
        media_100_ultimas: media100.toFixed(2) + 'x',
        media_500_ultimas: media500.toFixed(2) + 'x',
        distribuicao: faixas,
        maiores_velas: maiores.map(v => ({
            multiplicador: v.multiplicador + 'x',
            rodada: v.rodada,
            timestamp: v.timestamp
        })),
        frequencia_10x: ((faixas['10x_a_20x'] + faixas['20x_a_50x'] + faixas['acima_50x']) / Math.max(1, ultimas500.length) * 100).toFixed(1) + '%'
    });
});

app.get('/api/vela/:rodada', (req, res) => {
    const { rodada } = req.params;
    const vela = velas.find(v => v.rodada === rodada);

    if (!vela) {
        return res.status(404).json({ error: 'Rodada não encontrada' });
    }

    res.json(vela);
});

app.delete('/api/limpar', (req, res) => {
    const { senha } = req.query;

    if (senha !== 'admin123') {
        return res.status(401).json({ error: 'Senha inválida' });
    }

    const removidas = velas.length;
    velas = [];
    salvarVelas();
    res.json({
        ok: true,
        mensagem: `${removidas} velas removidas do histórico`,
        total_restante: velas.length
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'painel_vr5_v16.html'));
});

app.get('/painel1', (req, res) => {
    res.redirect('/?painel=1');
});

app.get('/painel2', (req, res) => {
    res.redirect('/?painel=2');
});

app.get('/api', (req, res) => {
    res.json({
        nome: 'API Aviator Trader - 100% Online',
        versao: '2.0.0',
        status: 'online',
        capturador: 'WebSocket + TipMiner integrados',
        endpoints: {
            'GET /': 'Painel/Gráfico',
            'GET /api': 'Esta documentação',
            'GET /api/status': 'Status do servidor',
            'GET /api/velas?painel=1&limit=100': 'Lista velas',
            'GET /api/ultimas?n=10': 'Últimas N velas',
            'GET /api/stats': 'Estatísticas',
            'GET /api/vela/:rodada': 'Busca por rodada',
            'POST /api/nova-vela': 'Envia nova vela',
            'DELETE /api/limpar?senha=admin123': 'Limpa histórico'
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('\n🚀 =====================================');
    console.log('   AVIATOR TRADER API 2.0 - 100% ONLINE');
    console.log('   =====================================');
    console.log(`   📡 Porta: ${PORT}`);
    console.log(`   🔗 Local: http://localhost:${PORT}`);
    console.log('   ✅ Status: Online');
    console.log('   📡 WebSocket: Conectando...');
    console.log('   🌐 TipMiner: Scraper ativo');
    console.log('   =====================================\n');

    // Inicia capturador WebSocket
    conectarWS();

    // TipMiner scraper a cada 30s como fallback
    setInterval(tentarScraperTipMiner, 30000);
    tentarScraperTipMiner();
});
