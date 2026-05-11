# Avatar Kiosk — Architettura e Istruzioni

## Indice

1. [Panoramica](#panoramica)
2. [Stack tecnologico](#stack-tecnologico)
3. [Architettura](#architettura)
4. [Struttura file](#struttura-file)
5. [Database](#database)
6. [API REST](#api-rest)
7. [WebSocket](#websocket)
8. [Modalità AI](#modalità-ai)
9. [Installazione](#installazione)
10. [Aggiornamento](#aggiornamento)
11. [Variabili d'ambiente](#variabili-dambiente)
12. [Webhook Say](#webhook-say)
13. [Monitoraggio](#monitoraggio)
14. [Sicurezza](#sicurezza)

---

## Panoramica

Avatar Kiosk è un'applicazione web per la creazione e gestione di avatar 3D interattivi con lip sync, voice activity detection (VAD), speech-to-text (STT) e text-to-speech (TTS). Ogni avatar è configurabile indipendentemente e accessibile tramite URL dedicato.

```
Browser (kiosk) ←→ WebSocket ←→ Server Node.js ←→ SQLite
                        ↕
               REST API /api/*
                        ↕
         Anthropic / OpenAI / ElevenLabs / Whisper
```

---

## Stack tecnologico

| Layer | Tecnologia |
|---|---|
| Runtime | Node.js ≥ 18, ES Modules |
| Framework HTTP | Express 4 |
| WebSocket | `ws` 8 |
| Database | SQLite via `better-sqlite3` |
| AI (testo) | Anthropic Claude / OpenAI GPT |
| TTS | ElevenLabs (con timestamp per lip sync) |
| STT | OpenAI Whisper (`verbose_json`) |
| 3D | Three.js + FBX/GLB + morph targets |
| VAD | ONNX Runtime Web (Silero VAD) |
| Rendering avatar | WebGL in-browser |
| Contenitore | Docker + docker-compose |

---

## Architettura

### Flusso conversazione

```
Utente parla
    → VAD rileva voce
    → Blob audio → POST /api/stt → Whisper → testo
    → POST /api/chat → AI (Claude/OpenAI/Webhook/MCP) → risposta
    → POST /api/tts → ElevenLabs → audio + alignment
    → Riproduzione audio + lip sync procedurale
    → Loop
```

### Modalità operative dell'avatar

| Modalità | Descrizione |
|---|---|
| `embedded` | L'AI è Claude o GPT gestita dal server |
| `webhook` | Il server forwarda la domanda a un endpoint esterno e ne legge la risposta |
| `mcp` | Come embedded ma con tool use tramite un MCP server (JSON-RPC o REST) |

### Wake word

Il kiosk supporta due modalità di attivazione:
- **Free-talk**: il VAD ascolta continuamente, nessuna parola chiave richiesta
- **Wake word**: usa la Web Speech API per rilevare una parola chiave configurabile prima di attivare il microfono

### Sessioni

Le sessioni conversazionali sono mantenute in memoria sul server (Map `sessionId → history[]`). Non sono persistite su DB — si resettano al riavvio del server. La cronologia è limitata agli ultimi 10 messaggi per sessione.

---

## Struttura file

```
avatar-kiosk/
├── server.js               # Entry point: Express + WebSocket + route
├── db.js                   # Schema SQLite e migrazioni
├── docker-compose.yml      # Configurazione Docker
├── Dockerfile
├── .env.example            # Template variabili d'ambiente
├── install.sh              # Script installazione interattivo
├── update.sh               # Script aggiornamento (git pull + rebuild Docker)
├── avatars.db              # Database SQLite (generato al primo avvio)
└── public/
    ├── kiosk.html          # Frontend kiosk (avatar 3D + chat + VAD)
    ├── admin/
    │   └── index.html      # Pannello di amministrazione
    ├── models/             # File 3D avatar (.glb, .fbx) — persistiti via volume
    ├── backgrounds/        # Immagini di sfondo — persistiti via volume
    ├── icons/              # Icone personalizzate mic/audio — persistiti via volume
    ├── bg-videos/          # Video di sfondo — persistiti via volume
    ├── idle-videos/        # Video schermata idle — persistiti via volume
    └── idle-bgs/           # Sfondi schermata idle — persistiti via volume
```

---

## Database

File: `avatars.db` (SQLite)

### Tabella `avatars`

Ogni riga è un avatar configurato. Campi principali:

| Campo | Tipo | Descrizione |
|---|---|---|
| `id` | TEXT PK | ID univoco generato (8 char hex) |
| `name` | TEXT | Nome avatar (usato nei prompt e nel saluto) |
| `label` | TEXT | Label mostrata nella lista admin |
| `system_prompt` | TEXT | Prompt di sistema dell'avatar |
| `ai_provider` | TEXT | `anthropic` \| `openai` |
| `anthropic_model` | TEXT | Es. `claude-sonnet-4-6` |
| `openai_model` | TEXT | Es. `gpt-4o` |
| `voice_id` | TEXT | ID voce ElevenLabs |
| `avatar_mode` | TEXT | `embedded` \| `webhook` \| `mcp` |
| `webhook_say_token` | TEXT | Token per webhook say in ingresso |
| `rate_limit_rpm` | INTEGER | Max richieste/min per IP (0 = disabilitato) |
| `published` | INTEGER | 0 = bozza, 1 = live |

Il DB si auto-migra: le colonne mancanti vengono aggiunte tramite `ALTER TABLE` all'avvio.

### Tabella `request_logs`

Log delle richieste per monitoraggio e rate limiting.

| Campo | Tipo | Descrizione |
|---|---|---|
| `avatar_id` | TEXT | Avatar coinvolto |
| `type` | TEXT | `chat` \| `tts` \| `stt` |
| `ip` | TEXT | IP del client |
| `blocked` | INTEGER | 1 se bloccata dal rate limit |
| `tokens_in` | INTEGER | Token input AI / caratteri TTS / secondi STT |
| `tokens_out` | INTEGER | Token output AI |
| `created_at` | TEXT | Timestamp UTC |

---

## API REST

### Pubbliche (kiosk)

| Metodo | Path | Descrizione |
|---|---|---|
| `GET` | `/kiosk/:id` | Apre il kiosk per l'avatar specificato |
| `POST` | `/api/chat` | Invia messaggio all'AI, riceve risposta |
| `POST` | `/api/stt` | Trascrizione audio (Whisper) |
| `POST` | `/api/tts` | Sintesi vocale (ElevenLabs) |
| `DELETE` | `/api/session/:id` | Resetta la sessione conversazionale |
| `POST` | `/api/avatar/:id/say` | **Webhook say** — inietta frase da pronunciare |

### Admin (autenticazione session cookie)

| Metodo | Path | Descrizione |
|---|---|---|
| `GET` | `/api/admin/avatars` | Lista avatar |
| `POST` | `/api/admin/avatars` | Crea avatar |
| `PUT` | `/api/admin/avatars/:id` | Aggiorna avatar |
| `DELETE` | `/api/admin/avatars/:id` | Elimina avatar |
| `POST` | `/api/admin/avatars/:id/duplicate` | Duplica avatar |
| `POST` | `/api/admin/avatars/:id/publish` | Toggle pubblicazione |
| `GET` | `/api/admin/stats` | Statistiche monitoraggio |
| `POST` | `/api/admin/mcp-test` | Test connessione MCP server |
| `POST` | `/api/admin/tts-preview` | Anteprima voce TTS |

---

## WebSocket

Il server espone un WebSocket sulla stessa porta HTTP.

### Messaggi server → client

| `type` | Payload | Descrizione |
|---|---|---|
| `connected` | `{ clientId }` | Conferma connessione |
| `config_update` | `{ avatarId, data }` | Aggiornamento config live dall'admin |
| `say` | `{ avatarId, text }` | Frase da pronunciare (da webhook say) |

Il kiosk filtra i messaggi `config_update` e `say` per `avatarId` corrispondente all'avatar corrente.

---

## Modalità AI

### Embedded (Anthropic / OpenAI)

Il server gestisce la conversazione direttamente. La cronologia è mantenuta in sessione. Supporta tool use tramite MCP.

### Webhook

Il server forwarda la domanda a un endpoint HTTP esterno configurabile con template JSON personalizzabile. Supporta autenticazione via header custom.

```
POST {webhook_url}
Body: { "query": "domanda utente", ... }  ← template configurabile

Response: { "response": "testo risposta" }  ← campo configurabile
```

### MCP (Model Context Protocol)

Il server recupera i tool dal MCP server, li passa al modello AI e gestisce il loop agente (max 5 round). Supporta:
- **JSON-RPC** (standard MCP): `POST {mcp_url}` con `{"jsonrpc":"2.0","method":"tools/list",...}`
- **REST fallback**: `GET {mcp_url}/tools` + `POST {mcp_url}/call`

Header custom configurabili per autenticazione (es. `Authorization: Bearer ...`).

---

## Installazione

### Prerequisiti

- Linux / macOS
- Docker (consigliato) oppure Node.js ≥ 18

### Con Docker (consigliato)

```bash
git clone https://github.com/ncode-studio/avatar-kiosk.git
cd avatar-kiosk
bash install.sh
```

Lo script guida l'installazione interattiva: sceglie la porta, configura `.env`, crea le directory dati e avvia il container.

### Con Node.js diretto

```bash
git clone https://github.com/ncode-studio/avatar-kiosk.git
cd avatar-kiosk
cp .env.example .env
# Edita .env con le tue API key
npm install
npm start
```

### Volumi Docker persistiti

I seguenti path sono montati come volumi e sopravvivono ai rebuild:

```
./public/models      → /app/public/models
./public/backgrounds → /app/public/backgrounds
./public/icons       → /app/public/icons
./public/bg-videos   → /app/public/bg-videos
./public/idle-videos → /app/public/idle-videos
./public/idle-bgs    → /app/public/idle-bgs
./avatars.db         → /app/avatars.db
./.env               → /app/.env
```

---

## Aggiornamento

```bash
bash update.sh
```

Lo script esegue `git pull`, rebuild Docker senza cache (per aggiornare le dipendenze npm) e riavvia il container.

---

## Variabili d'ambiente

| Variabile | Descrizione | Default |
|---|---|---|
| `PORT` | Porta del server | `3000` |
| `ADMIN_USER` | Username pannello admin | `admin` |
| `ADMIN_PASSWORD` | Password pannello admin | `changeme` |
| `ANTHROPIC_API_KEY` | API key Anthropic | — |
| `CLAUDE_MODEL` | Modello Claude di default | `claude-sonnet-4-6` |
| `OPENAI_API_KEY` | API key OpenAI (GPT + Whisper) | — |
| `ELEVENLABS_API_KEY` | API key ElevenLabs | — |
| `ELEVENLABS_VOICE_ID` | ID voce ElevenLabs di default | — |

Le API key possono essere sovrascritte per singolo avatar dall'admin.

---

## Webhook Say

Permette a sistemi esterni di far pronunciare una frase all'avatar in tempo reale.

### Configurazione

1. Admin → seleziona avatar → **Generale** → **Webhook Say**
2. Clicca **Genera** per creare un token sicuro
3. Salva l'avatar

### Utilizzo

```bash
curl -X POST https://tuodominio.com/api/avatar/{AVATAR_ID}/say \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Attenzione, il cliente è arrivato.",
    "token": "il-tuo-token"
  }'
```

**Risposta OK:**
```json
{ "ok": true }
```

**Errori possibili:**

| HTTP | Descrizione |
|---|---|
| `400` | Campo `text` mancante |
| `401` | Campo `token` mancante |
| `403` | Token non valido o webhook non configurato |
| `404` | Avatar non trovato |

### Funzionamento interno

```
Sistema esterno → POST /api/avatar/:id/say
    → Verifica token
    → WebSocket broadcast { type: "say", avatarId, text }
    → Kiosk riceve evento, chiama /api/tts
    → Avatar pronuncia il testo
```

Il messaggio viene consegnato a tutti i browser che stanno visualizzando quel kiosk in quel momento.

---

## Monitoraggio

Accessibile da admin → **Monitoraggio**.

### Metriche giornaliere

| Metrica | Fonte |
|---|---|
| Richieste totali | Conteggio `request_logs` del giorno |
| Richieste bloccate | Rate limit superato |
| Token AI input/output | Dalla risposta dell'API AI |
| Caratteri TTS | Lunghezza testo inviato a ElevenLabs |
| Secondi STT | Campo `duration` da Whisper `verbose_json` |

### Stima costi

Calcolata lato client dal modello configurato per ogni avatar:

| Servizio | Tariffa |
|---|---|
| Claude Sonnet 4.6 | $3.00 / $15.00 per MTok in/out |
| Claude Haiku 4.5 | $0.80 / $4.00 per MTok in/out |
| Claude Opus 4.7 | $15.00 / $75.00 per MTok in/out |
| GPT-4o | $2.50 / $10.00 per MTok in/out |
| GPT-4o mini | $0.15 / $0.60 per MTok in/out |
| ElevenLabs TTS | $0.30 / 1.000 caratteri |
| Whisper STT | $0.006 / minuto |

---

## Sicurezza

### Rate limiting

Configurabile per avatar in admin → **AI** → **Rate limit (richieste/min per IP)**.

- Sliding window di 60 secondi per IP
- Applicato su `/api/chat` e `/api/stt`
- IP bloccati visibili nel pannello monitoraggio

### Admin

- Autenticazione session-based (Express session)
- Tutte le route `/api/admin/*` richiedono login
- Credenziali configurabili via `.env`

### Webhook Say

- Ogni avatar ha un token indipendente (48 char hex)
- Token vuoto = webhook disabilitato
- Nessun accesso a dati dell'avatar, solo invio testo

### Note di deployment

- In produzione esporre sempre tramite HTTPS (nginx reverse proxy)
- Il WebSocket richiede upgrade `ws://` → `wss://` — assicurarsi che nginx passi l'header `Upgrade`
- Non esporre il DB SQLite direttamente
