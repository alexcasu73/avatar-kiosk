#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
info() { echo -e "${YELLOW}[INFO]${NC}  $*"; }
err()  { echo -e "${RED}[ERRORE]${NC} $*"; exit 1; }

echo ""
echo "============================================"
echo "  AVATAR KIOSK - Avvio sistema"
echo "============================================"
echo ""

# ── Modalità ──────────────────────────────────────────────────────────────
# Supporta flag --server e --kiosk per avvio non interattivo (es. systemd)
MODALITA=""
for arg in "$@"; do
  case "$arg" in
    --server) MODALITA="1" ;;
    --kiosk)  MODALITA="2" ;;
  esac
done

if [ -z "$MODALITA" ]; then
  echo "Modalità di avvio:"
  echo "  [1] Server only    (headless / VPS / accesso da browser esterno)"
  echo "  [2] Kiosk          (avvia anche il browser a schermo intero)"
  echo ""
  read -r -p "Scelta [1/2, default 1]: " MODALITA
  MODALITA="${MODALITA:-1}"
fi

# ── Verifica Node.js ──────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  err "Node.js non trovato. Esegui prima install.sh"
fi
node -e "if(parseInt(process.version.slice(1)) < 18) process.exit(1)" \
  || err "Node.js $(node --version) troppo vecchio. Richiesta versione 18+."
ok "Node.js $(node --version)"

# ── Verifica .env ─────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  err "File .env non trovato. Copia .env.example in .env e configura le API key."
fi
ok ".env presente"

# ── Dipendenze ────────────────────────────────────────────────────────────
if [ ! -d "node_modules" ]; then
  info "Prima installazione dipendenze..."
  npm install --omit=dev
fi
ok "Dipendenze pronte"

# ── Porta ─────────────────────────────────────────────────────────────────
PORT=$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]') || true
PORT="${PORT:-3000}"

# ── Avvia server con auto-restart ─────────────────────────────────────────
info "Avvio server Node.js sulla porta $PORT..."
(while true; do
  node server.js
  EXIT_CODE=$?
  if [ $EXIT_CODE -eq 1 ]; then
    # Uscita con codice 1 = errore fatale (es. porta occupata), non riavviare
    echo ""
    err "Server terminato con errore fatale. Controlla i log sopra."
  fi
  echo ""
  info "Server terminato, riavvio tra 2 secondi..."
  sleep 2
done) &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null; echo ''; info 'Server fermato.'" EXIT

# ── Attendi che il server risponda ────────────────────────────────────────
info "Attendo avvio server..."
for i in $(seq 1 15); do
  if curl -sf "http://localhost:${PORT}/api/health" &>/dev/null; then
    ok "Server attivo su http://localhost:${PORT}"
    break
  fi
  sleep 1
done

# ── Modalità server only ───────────────────────────────────────────────────
if [[ "$MODALITA" != "2" ]]; then
  echo ""
  echo "  Pannello admin : http://localhost:${PORT}/admin"
  echo ""
  info "Server in esecuzione. Premi Ctrl+C per fermare."
  wait $SERVER_PID
  exit 0
fi

# ── Modalità kiosk: cerca avatar pubblicato ───────────────────────────────
info "Cerco avatar pubblicato..."
AVATAR_URL=""
API_RESP=$(curl -sf "http://localhost:${PORT}/api/admin/avatars" 2>/dev/null || echo "[]")
KIOSK_ID=$(echo "$API_RESP" | node -e "
  const d = require('fs').readFileSync('/dev/stdin','utf8');
  try {
    const list = JSON.parse(d);
    const pub = list.find(a => a.published);
    if (pub) process.stdout.write(pub.id);
  } catch(e) {}
" 2>/dev/null || true)

if [ -n "$KIOSK_ID" ]; then
  AVATAR_URL="http://localhost:${PORT}/k/${KIOSK_ID}"
  ok "Avatar pubblicato trovato: $KIOSK_ID"
else
  AVATAR_URL="http://localhost:${PORT}/admin"
  info "Nessun avatar pubblicato. Apro il pannello admin per configurare."
fi

# ── Trova browser ─────────────────────────────────────────────────────────
BROWSER=""
if [[ "$OSTYPE" == "darwin"* ]]; then
  for b in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
  do
    [ -f "$b" ] && BROWSER="$b" && break
  done
else
  for b in google-chrome chromium-browser chromium brave-browser; do
    command -v "$b" &>/dev/null && BROWSER="$b" && break
  done
fi

if [ -z "$BROWSER" ]; then
  err "Chrome/Chromium non trovati. Installali oppure usa la modalità server only."
fi
ok "Browser: $BROWSER"

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

if [[ "$OSTYPE" == "darwin"* ]]; then
  FLAGS+=(--app="$AVATAR_URL")
  FLAGS=("${FLAGS[@]/--kiosk/}")
fi

info "Apertura browser kiosk: $AVATAR_URL"
"$BROWSER" "${FLAGS[@]}" "$AVATAR_URL" &>/dev/null

info "Browser chiuso. Fermo il server."
