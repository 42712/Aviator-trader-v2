function enviarVela(mult, rodada, timestamp, origem) {

    const multNum = parseFloat(mult);
    if (isNaN(multNum) || multNum <= 0) return;

    const painel = detectarAviator();

    // NÃO aceita rodada fake
    const rodadaReal = rodada || rodadaCache || extrairRodada();
    if (!rodadaReal) {
        console.log("⏳ Rodada real não encontrada");
        return;
    }

    const chave = painel + '_' + rodadaReal;

    if (enviadas.has(chave)) return;
    enviadas.add(chave);

    const agora = new Date();

    const data = agora.toLocaleDateString('pt-BR');
    const hora = agora.toLocaleTimeString('pt-BR', {
        hour12: false
    });

    const timestampISO = agora.toISOString();

    fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            painel,
            rodada: String(rodadaReal),
            multiplicador: multNum,

            data,
            hora,
            timestamp: timestampISO,

            soma: calcularSoma(multNum),
            fonte: origem || "ws-sortenabet"
        })
    })
    .then(r => r.json())
    .then(d => {
        console.log(
            `✅ [AVIATOR ${painel}] ${multNum}x | Rodada ${rodadaReal} | ${data} ${hora}`
        );
    })
    .catch(err => {
        console.error("❌ Erro envio:", err);
        enviadas.delete(chave);
    });
}
