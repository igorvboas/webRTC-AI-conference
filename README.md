## WebRTC + Socket.IO (Rooms) + OpenAI Realtime

Aplicação WebRTC com sinalização via Socket.IO e suporte a salas (host/participante), com proxy para OpenAI Realtime (WebSocket). Backend roda no Google Cloud Run; frontend roda na Vercel.

- Backend (Cloud Run): `https://webrtc-backend-1022548423771.us-central1.run.app`
- Frontend (Vercel): `https://web-rtc-ai-conference.vercel.app`

### Principais recursos
- **Salas com Host e Participante** (criar/entrar/expirar/finalizar)
- **Sinalização WebRTC**: offers, answers, ICE candidates por Socket.IO
- **Transcrição (OpenAI Realtime)** via WebSocket proxy no backend
- **Frontend vanilla JS** (`room.html`, `create-room.html`)

### Arquitetura resumida
- O browser carrega `socket.io.js` do domínio do backend e se conecta via `io.connect()` para eventos de sinalização e transcrição.
- O backend Express + Socket.IO mantém o estado das salas em memória e proxya a conexão WebSocket com a OpenAI.
- Em produção, o Cloud Run termina em HTTPS 443 (não usar porta 8181 na URL pública).

## Como rodar localmente

### Requisitos
- Node.js 18+
- mkcert (para HTTPS local) — opcional se for usar somente HTTP local
  - Windows: `choco install mkcert` e `choco install nss`
  - macOS: `brew install mkcert` e `brew install nss`

### Instalar dependências
```bash
cd backend && npm install
cd ../frontend && npm install   # se necessário
```

### Variáveis de ambiente (arquivo `.env` no diretório `backend/`)
```ini
# Necessário para o proxy Realtime
OPENAI_API_KEY=coloque_sua_chave

# Opcional
USE_HTTPS=false             # true para usar certs locais
PORT=8181                   # porta interna do backend ao rodar local
FRONTEND_PORT=3000          # porta do frontend local (se servir localmente)
FRONTEND_URL=https://localhost:3000
```

### (Opcional) Gerar certificados locais
```bash
# na raiz do projeto (ou dentro de backend), gere cert.key e cert.crt
mkcert -key-file cert.key -cert-file cert.crt localhost
```

### Iniciar backend local
```bash
cd backend
npm start
```
- Se `USE_HTTPS=true` e os certificados existirem, o backend sobe em HTTPS.
- Caso contrário, sobe em HTTP. Ajuste as URLs no frontend quando testar localmente.

### Servir frontend local (opcional)
- Você pode abrir diretamente os arquivos HTML do diretório `frontend/` com um servidor estático
  (ex.: `npx serve`), ou rodar na Vercel e apontar para o backend local.

## Deploy

### Cloud Run (via Cloud Build)
- Arquivo: `cloudbuild.yaml`
- Builda a imagem do backend e faz deploy no Cloud Run.
- Define `FRONTEND_URL` e `OPENAI_API_KEY` (por Secret Manager).

Trecho relevante do deploy (já no arquivo):
```yaml
--set-env-vars "NODE_ENV=production,FRONTEND_URL=${_FRONTEND_URL}"
--set-secrets "OPENAI_API_KEY=OPENAI_API_KEY:latest"
```
- Atualize `substitutions._FRONTEND_URL` para seu domínio público da Vercel, por exemplo:
  - `https://web-rtc-ai-conference.vercel.app`
- A flag `--port 8080` define a porta interna do container; externamente o Cloud Run publica em 443.

### Vercel (Frontend)
- O frontend é estático. Garanta que as páginas do frontend usem o domínio do backend do Cloud Run sem porta:
  - Em `frontend/config.js`: `BACKEND_URL = 'https://webrtc-backend-XXXXXXXX-uc.a.run.app'`
  - Em `create-room.html` e `room.html`: a tag `<script src="https://<backend>/socket.io/socket.io.js">` deve apontar para o domínio do backend.

## Configuração importante

- **Não usar `:8181` na URL pública** da Cloud Run. A porta 8181 é interna do container local; em produção use somente HTTPS 443 (sem especificar porta).
- **`FRONTEND_URL`**: usado pelo backend apenas para compor o link de sala que é retornado ao criar sala. Defina no Cloud Run (via `cloudbuild.yaml` ou painel) para o domínio da Vercel.
- **CORS**: o backend está com `origin: "*"` no Socket.IO. Em produção, reforce para o(s) domínio(s) do frontend.
- **Secrets**: `OPENAI_API_KEY` é lido do Secret Manager no deploy.

## Fluxo de uso
1. Acesse `create-room.html`, dê um nome ao host e à sala, e crie.
2. O backend retorna a URL da sala (`room.html?roomId=...`). O host abre com `role=host` (link exibido no UI).
3. Compartilhe o link do participante (sem `role=host`).
4. Host clica em "Call", participante vê o botão "Answer". A conexão é estabelecida.
5. O host pode ativar a transcrição (OpenAI) e as transcrições são enviadas ao host.

## Troubleshooting
- **`io is not defined` / falha ao carregar `socket.io.js`**:
  - Verifique se o `<script src>` do `socket.io.js` aponta para o domínio do backend Cloud Run, não `localhost`.
  - Limpe o cache do navegador (Disable cache no DevTools) e recarregue.
- **Tentativa de acessar `https://localhost:8181` em produção**:
  - Alguma referência antiga no HTML/JS. Procure por `localhost:8181` nos arquivos do frontend e remova.
- **Mixed Content (HTTPS frontend x HTTP backend)**:
  - Em produção, use sempre HTTPS nos dois lados. Cloud Run já expõe em 443.
- **Host abrindo `room.html?role=host` sem nome salvo**:
  - A página solicita o nome do host e salva no `localStorage` automaticamente.

## Estrutura (arquivos principais)
- `backend/server.js`: Express + Socket.IO, rooms, proxy OpenAI
- `frontend/create-room.html`: criação de salas e links
- `frontend/room.html`: sala (vídeo, transcrição, controles)
- `frontend/room.js`: lógica da sala (join host/participant, WebRTC, transcrição)
- `frontend/config.js`: configurações (inclui `BACKEND_URL`)
- `cloudbuild.yaml`: build e deploy do backend no Cloud Run

## Licença
MIT
