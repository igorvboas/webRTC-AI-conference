## WebRTC + Socket.IO Starter (with OpenAI Realtime proxy)

A minimal signaling server and client example using WebRTC and Socket.IO, served over HTTPS. Includes a simple proxy to OpenAI Realtime via WebSocket.

### Features
- WebRTC signaling over Socket.IO (offers/answers/ICE)
- HTTPS local server (self‑signed via mkcert)
- Optional OpenAI Realtime WebSocket proxy
- Plain vanilla JS frontend (no framework)

### Tech Stack
- Node.js + Express
- Socket.IO
- WebSocket (ws)
- mkcert (local TLS)

---

### Prerequisites
- Node.js 18+
- mkcert installed (for local HTTPS)
  - Windows: `choco install mkcert` and `choco install nss` (if using Firefox)
  - macOS: `brew install mkcert` and `brew install nss`
  - Linux: see mkcert docs

### 1) Install dependencies
```bash
npm install
```

### 2) Generate HTTPS certificates (once)
From the project root:
```bash
mkcert -install
mkcert localhost
```
This will create certificate files like `localhost-key.pem` and `localhost.pem`. If your project expects `cert.key`/`cert.crt`, rename them or generate with:
```bash
mkcert -key-file cert.key -cert-file cert.crt localhost
```
Add these files to .gitignore (already configured).

### 3) Configure environment variables
Create a `.env` file at the project root:
```ini
OPENAI_API_KEY=your_openai_key_here
```
The server reads it via `dotenv` in `server.js`.

### 4) Run
```bash
npm start
```
Server starts on `https://localhost:8181`.

### 5) Try it out
- Open two browser tabs at `https://localhost:8181`.
- Provide a username and the demo password `x` when prompted.
- Start a call: one tab creates an offer, the other answers.
- If using the OpenAI proxy endpoints from the client, ensure your `OPENAI_API_KEY` is valid.

---

### Project structure (key files)
- `server.js` — Express HTTPS server, Socket.IO signaling, OpenAI proxy
- `scripts.js` — Frontend signaling and WebRTC logic
- `audioProcessor.js`, `pcm-worklet.js`, `transcription.js` — audio capture/processing helpers
- `index.html`, `styles.css` — simple UI
- `.env` — environment variables (ignored by git)

### Notes
- Certificates (`cert.key`, `cert.crt`, etc.) and `.env` are ignored by git.
- For production, use real TLS certs, proper auth, and restrict CORS in `server.js`.
- Avoid committing API keys. Keep them in `.env` or your secret manager.

### Scripts
- `npm start` — run the HTTPS server

### License
MIT (or your preferred license). Update as needed.
