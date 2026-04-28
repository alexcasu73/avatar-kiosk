#!/usr/bin/env bash
# ============================================================
#  AVATAR KIOSK — Installazione (Linux / macOS)
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
info() { echo -e "${YELLOW}[INFO]${NC}  $*"; }
err()  { echo -e "${RED}[ERRORE]${NC} $*"; exit 1; }

echo ""
echo "============================================"
echo "  AVATAR KIOSK — Installazione"
echo "============================================"
echo ""

# ── Node.js ≥18 ───────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  err "Node.js non trovato. Installalo da https://nodejs.org (versione 18 o superiore)"
fi
NODE_VER=$(node -e "process.exit(parseInt(process.version.slice(1)) < 18 ? 1 : 0)" 2>&1 || true)
node -e "if(parseInt(process.version.slice(1)) < 18) process.exit(1)" \
  || err "Node.js $(node --version) troppo vecchio. Richiesta versione 18+."
ok "Node.js $(node --version)"

# ── npm install ───────────────────────────────────────────────────────────
info "Installazione dipendenze npm..."
npm install --omit=dev
ok "Dipendenze installate"

# ── .env ──────────────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  cp .env.example .env
  info "File .env creato da .env.example"
  echo ""
  echo -e "${YELLOW}  ⚠️  CONFIGURA LE API KEY nel file .env prima di avviare:${NC}"
  echo "     - ANTHROPIC_API_KEY"
  echo "     - ELEVENLABS_API_KEY"
  echo "     - OPENAI_API_KEY"
  echo ""
else
  ok ".env già presente"
fi

# ── Directory dati ────────────────────────────────────────────────────────
mkdir -p public/models public/backgrounds
ok "Directory dati pronte"

# ── Permessi script ───────────────────────────────────────────────────────
chmod +x start-kiosk.sh
ok "Permessi start-kiosk.sh impostati"

# ── Autostart (Linux systemd) ─────────────────────────────────────────────
if [[ "$OSTYPE" == "linux-gnu"* ]] && command -v systemctl &>/dev/null; then
  echo ""
  read -r -p "Vuoi configurare l'avvio automatico al boot (systemd)? [s/N] " AUTOSTART
  if [[ "$AUTOSTART" =~ ^[Ss]$ ]]; then
    APP_DIR="$(pwd)"
    USER_NAME="$(whoami)"
    SERVICE_FILE="/etc/systemd/system/avatar-kiosk.service"
    sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Avatar Kiosk
After=network.target

[Service]
Type=simple
User=${USER_NAME}
WorkingDirectory=${APP_DIR}
ExecStart=/bin/bash ${APP_DIR}/start-kiosk.sh
Restart=always
RestartSec=5
Environment=DISPLAY=:0

[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl daemon-reload
    sudo systemctl enable avatar-kiosk.service
    ok "Servizio systemd configurato: avatar-kiosk.service"
    info "Avvia manualmente con: sudo systemctl start avatar-kiosk"
  fi
fi

# ── Fine ──────────────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo -e "${GREEN}  Installazione completata!${NC}"
echo "============================================"
echo ""
echo "  Avvia il kiosk con:"
echo "    ./start-kiosk.sh"
echo ""
