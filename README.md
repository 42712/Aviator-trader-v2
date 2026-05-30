# Sortenabet Aviator Server

Servidor intermediário entre a extensão Chrome e o painel HTML.

## Deploy no Render

1. Suba esta pasta para um repositório GitHub
2. Acesse [render.com](https://render.com) → New → Web Service
3. Conecte o repositório GitHub
4. Render detecta o `render.yaml` automaticamente
5. Clique **Deploy**
6. Após deploy, copie a URL (ex: `https://sortenabet-server.onrender.com`)

## Atualizar a extensão

No `background.js`, troque o endpoint:
```js
fetch("https://SEU-APP.onrender.com/api/nova-vela", ...)
```

No `content.js`, troque a linha:
```js
const API_URL = "https://SEU-APP.onrender.com/api/nova-vela";
```

## Usar no painel HTML

No modal **Servidor Local**, coloque:
- URL Base: `https://SEU-APP.onrender.com`
- Endpoint velas (GET): `/api/velas`

## Endpoints

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/` | Status do servidor |
| POST | `/api/nova-vela` | Extensão envia vela |
| GET | `/api/velas?painel=1` | Painel busca velas |
| GET | `/api/status` | Health check JSON |

## Observação

O plano gratuito do Render hiberna após 15 min sem uso.
Para evitar, configure um ping periódico ou faça upgrade.
