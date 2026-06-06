const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Banco de dados em memória
let velas = [];
let startTime = Date.now();

// ============================================
// ENDPOINTS DA API
// ============================================

// POST - recebe nova vela da extensão
app.post('/api/nova-vela', (req, res) => {
    const { painel, multiplicador, rodada, timestamp, soma, fonte } = req.body;
    
    // Validação básica
    if (!multiplicador || isNaN(multiplicador)) {
        return res.status(400).json({ error: 'Multiplicador inválido' });
    }
    
    const novaVela = {
        id: Date.now(),
        painel: painel || 1,
        multiplicador: parseFloat(multiplicador),
        rodada: rodada || String(Date.now()),
        timestamp: timestamp || new Date().toLocaleTimeString('pt-BR'),
        data_completa: new Date().toISOString(),
        soma: soma || 0,
        fonte: fonte || 'extensao'
    };
    
    velas.push(novaVela);
    
    // Mantém só as últimas 5000 velas
    if (velas.length > 5000) velas.shift();
    
    console.log(`[${new Date().toLocaleTimeString()}] 📊 Vela: ${novaVela.multiplicador}x | Painel ${novaVela.painel} | Rodada ${novaVela.rodada}`);
    res.json({ 
        ok: true, 
        id: novaVela.id, 
        total: velas.length,
        mensagem: 'Vela capturada com sucesso!'
    });
});

// GET - consulta velas
app.get('/api/velas', (req, res) => {
    const { painel, limit = 100, offset = 0 } = req.query;
    let resultado = [...velas];
    
    if (painel) {
        resultado = resultado.filter(v => v.painel == painel);
    }
    
    // Ordena do mais novo para o mais antigo
    resultado = resultado.reverse();
    
    const total = resultado.length;
    const paginado = resultado.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    
    res.json({
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        dados: paginado
    });
});

// GET - últimas N velas (mais simples)
app.get('/api/ultimas', (req, res) => {
    const { n = 10, painel } = req.query;
    let resultado = [...velas];
    
    if (painel) {
        resultado = resultado.filter(v => v.painel == painel);
    }
    
    resultado = resultado.slice(-parseInt(n)).reverse();
    res.json(resultado);
});

// GET - status do servidor
app.get('/api/status', (req, res) => {
    const ultimaVela = velas.length > 0 ? velas[velas.length - 1] : null;
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const horas = Math.floor(uptime / 3600);
    const minutos = Math.floor((uptime % 3600) / 60);
    const segundos = uptime % 60;
    
    res.json({ 
        status: 'online',
        versao: '1.0.0',
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

// GET - estatísticas avançadas
app.get('/api/stats', (req, res) => {
    if (velas.length === 0) {
        return res.json({
            total_velas: 0,
            mensagem: 'Aguardando primeira vela...'
        });
    }
    
    const ultimas100 = velas.slice(-100);
    const ultimas500 = velas.slice(-500);
    
    // Médias
    const media100 = ultimas100.reduce((s, v) => s + v.multiplicador, 0) / ultimas100.length;
    const media500 = ultimas500.reduce((s, v) => s + v.multiplicador, 0) / ultimas500.length;
    
    // Distribuição por faixa
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
    
    // Maiores velas
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

// GET - velas por rodada
app.get('/api/vela/:rodada', (req, res) => {
    const { rodada } = req.params;
    const vela = velas.find(v => v.rodada === rodada);
    
    if (!vela) {
        return res.status(404).json({ error: 'Rodada não encontrada' });
    }
    
    res.json(vela);
});

// DELETE - limpar histórico (admin)
app.delete('/api/limpar', (req, res) => {
    const { senha } = req.query;
    
    // Proteção básica (mude a senha!)
    if (senha !== 'admin123') {
        return res.status(401).json({ error: 'Senha inválida' });
    }
    
    const removidas = velas.length;
    velas = [];
    res.json({ 
        ok: true, 
        mensagem: `${removidas} velas removidas do histórico`,
        total_restante: velas.length
    });
});

// Rota raiz
app.get('/', (req, res) => {
    res.json({
        nome: 'API Aviator Trader',
        versao: '1.0.0',
        status: 'online',
        documentacao: 'https://github.com/SEU_USUARIO/aviator-backend',
        endpoints: {
            'GET /': 'Esta documentação',
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

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('\n🚀 =====================================');
    console.log(`   AVIATOR TRADER API - RODANDO`);
    console.log('   =====================================');
    console.log(`   📡 Porta: ${PORT}`);
    console.log(`   🔗 Local: http://localhost:${PORT}`);
    console.log(`   ✅ Status: Online`);
    console.log('   =====================================\n');
});
