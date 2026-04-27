# 🤖 Avatar Kiosk

Sistema di avatar 3D interattivo per kiosk/totem fisici. L'utente parla (o scrive) → l'AI risponde → l'avatar 3D sincronizza le labbra con la voce.

## Architettura

```
[Microfono] → STT (Whisper) → [Claude AI] → TTS (ElevenLabs) → [Avatar 3D + Lip Sync]
```

## Requisiti

- Node.js >= 18
- API keys: Anthropic, ElevenLabs, OpenAI (per Whisper STT)

## Setup

### 1. Installa le dipendenze

```bash
cd avatar-kiosk
npm install
```

### 2. Configura le variabili d'ambiente

```bash
cp .env.example .env
# Modifica .env con le tue API keys
```

### 3. Avvia il server

```bash
npm start
# oppure in sviluppo:
npm run dev
```

### 4. Apri il browser

Vai su `http://localhost:3000`

---

## Integrazione Avatar 3D Realistico

Il progetto include un **avatar placeholder** generato con Three.js.
Per un avatar realistico, hai 3 opzioni:

### Opzione A — Ready Player Me (consigliata per partire)
1. Vai su [readyplayer.me](https://readyplayer.me) e crea il tuo avatar
2. Scarica il file `.glb`
3. Posizionalo in `public/avatar.glb`
4. In `public/index.html`, decommenta il caricamento del modello GLTF

### Opzione B — Avatar personalizzato (Blender)
1. Crea o acquista un modello 3D in formato `.glb`
2. Aggiungi i morph targets (shape keys) per le espressioni facciali
3. Usa TalkingHead.js per il lip sync avanzato via visemi

### Opzione C — Unreal Engine MetaHuman (qualità massima)
Richiede una GPU dedicata. Non adatto a Mini PC senza GPU.

---

## Struttura file

```
avatar-kiosk/
├── server.js          # Backend Node.js (Express + WebSocket)
├── package.json
├── .env.example       # Template configurazione
├── .env               # Configurazione locale (non committare!)
└── public/
    └── index.html     # Frontend kiosk (Three.js + UI)
```

## API Endpoints

| Endpoint | Metodo | Descrizione |
|----------|--------|-------------|
| `GET /api/health` | GET | Status del sistema |
| `POST /api/stt` | POST | Trascrivi audio (multipart/form-data, campo `audio`) |
| `POST /api/chat` | POST | Invia messaggio a Claude |
| `POST /api/tts` | POST | Genera voce ElevenLabs |
| `POST /api/pipeline` | POST | Pipeline completa STT→AI→TTS |
| `DELETE /api/session/:id` | DELETE | Reset conversazione |

## Personalizzazione avatar

Nel file `.env`, modifica:
```
AVATAR_NAME=Sofia
AVATAR_SYSTEM_PROMPT="Sei Sofia, assistente del punto vendita XYZ..."
ELEVENLABS_VOICE_ID=<id_voce_da_elevenlabs>
```

## Kiosk mode (avvio automatico)

Per avviare automaticamente su Windows/Linux al boot:

**Windows** — crea un task pianificato che esegue:
```
node C:\path\to\avatar-kiosk\server.js
```
E apri Chromium in kiosk mode:
```
chromium --kiosk --app=http://localhost:3000
```

**Linux** — usa un service systemd + autostart desktop
