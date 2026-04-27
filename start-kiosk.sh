#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "============================================"
echo " AVATAR KIOSK - Avvio sistema"
echo "============================================"

# ── Verifica Node.js ──────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "[ERRORE] Node.js non trovato. Installalo da https://nodejs.org"
  exit 1
fi

# ── Verifica .env ─────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  echo "[ERRORE] File .env non trovato. Copia .env.example in .env e configura le API key."
  exit 1
fi

# ── Dipendenze ────────────────────────────────────────────────────────────
if [ ! -d "node_modules" ]; then
  echo "[INFO] Prima installazione dipendenze..."
  npm install
fi

# ── Trova browser ─────────────────────────────────────────────────────────
BROWSER=""
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  for b in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
  do
    if [ -f "$b" ]; then BROWSER="$b"; break; fi
  done
else
  # Linux
  for b in google-chrome chromium-browser chromium brave-browser; do
    if command -v "$b" &>/dev/null; then BROWSER="$b"; break; fi
  done
fi

if [ -z "$BROWSER" ]; then
  echo "[ERRORE] Chrome/Chromium non trovati. Installali e riprova."
  exit 1
fi

echo "[INFO] Browser: $BROWSER"

# ── Avvia server con auto-restart ─────────────────────────────────────────
echo "[INFO] Avvio server Node.js..."
(while true; do
  node server.js
  echo "[INFO] Server terminato, riavvio tra 2 secondi..."
  sleep 2
done) &
SERVER_PID=$!

# Ferma il server quando questo script termina
trap "kill $SERVER_PID 2>/dev/null; echo '[INFO] Server fermato.'" EXIT

# ── Attendi che il server risponda ────────────────────────────────────────
echo "[INFO] Attendo avvio server..."
for i in $(seq 1 10); do
  if curl -sf http://localhost:3000/api/health &>/dev/null; then
    echo "[OK] Server attivo."
    break
  fi
  sleep 1
done

# ── Flags browser ─────────────────────────────────────────────────────────
PROFILE_DIR="$(pwd)/chrome-kiosk-profile"
FLAGS=(
  --kiosk
  --no-first-run
  --disable-infobars
  --disable-session-crashed-bubble
  --disable-restore-session-state
  --noerrdialogs
  --disable-pinch
  --overscroll-history-navigation=0
  --disable-features=TranslateUI
  --autoplay-policy=no-user-gesture-required
  --use-fake-ui-for-media-stream
  --user-data-dir="$PROFILE_DIR"
)

# macOS: --kiosk non funziona bene su alcuni setup, usiamo app-mode come alternativa
if [[ "$OSTYPE" == "darwin"* ]]; then
  FLAGS+=(--app=http://localhost:3000)
  # Rimuovi --kiosk su mac (sostituito da --app)
  FLAGS=("${FLAGS[@]/--kiosk/}")
fi

echo "[INFO] Apertura browser kiosk..."
"$BROWSER" "${FLAGS[@]}" http://localhost:3000 &>/dev/null

echo "[INFO] Browser chiuso. Fermo il server."
