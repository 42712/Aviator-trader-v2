from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Optional
from collections import deque
import time

app = FastAPI(title="Sortenabet Aviator Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Armazena últimas 200 velas por painel em memória
velas = {1: deque(maxlen=200), 2: deque(maxlen=200)}


class Vela(BaseModel):
    painel: Optional[int] = 1
    multiplicador: float
    rodada: Optional[str] = None
    timestamp: Optional[str] = None
    soma: Optional[int] = None
    fonte: Optional[str] = None


@app.get("/", response_class=HTMLResponse)
def root():
    total = sum(len(v) for v in velas.values())
    return f"""
    <html><body style="font-family:monospace;background:#06090f;color:#b8d0ec;padding:2rem">
    <h2>&#9775; Sortenabet Aviator Server</h2>
    <p>Status: <span style="color:#22c55e">ONLINE</span></p>
    <p>Velas em memória: <b>{total}</b></p>
    <p>Painel 1: {len(velas[1])} velas | Painel 2: {len(velas[2])} velas</p>
    <hr style="border-color:#18273d;margin:1rem 0">
    <p style="color:#4a6e94">Endpoints:</p>
    <pre style="color:#f59e0b">POST /api/nova-vela   — extensão envia velas
GET  /api/velas?painel=1  — painel busca velas</pre>
    </body></html>
    """


@app.post("/api/nova-vela")
def nova_vela(vela: Vela):
    painel = vela.painel if vela.painel in (1, 2) else 1
    entrada = {
        "multiplicador": vela.multiplicador,
        "rodada": vela.rodada or str(int(time.time() * 1000)),
        "timestamp": vela.timestamp or time.strftime("%H:%M:%S"),
        "soma": vela.soma,
        "fonte": vela.fonte or "extensao",
        "painel": painel,
        "ts_recebido": int(time.time() * 1000),
    }
    velas[painel].append(entrada)
    return {"ok": True, "painel": painel, "total": len(velas[painel])}


@app.get("/api/velas")
def get_velas(painel: int = 1, limit: int = 100):
    p = painel if painel in (1, 2) else 1
    lista = list(velas[p])[-limit:]
    return {"painel": p, "total": len(lista), "velas": lista}


@app.get("/api/status")
def status():
    return {
        "online": True,
        "painel1": len(velas[1]),
        "painel2": len(velas[2]),
        "ts": int(time.time()),
    }
