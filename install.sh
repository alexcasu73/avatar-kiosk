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

# ── Modalità installazione ────────────────────────────────────────────────
echo "Modalità di installazione:"
echo "  [1] Node.js diretto  (classica)"
echo "  [2] Docker           (consigliata per server)"
echo ""
read -r -p "Scelta [1/2, default 1]: " INSTALL_MODE
INSTALL_MODE="${INSTALL_MODE:-1}"

if [[ "$INSTALL_MODE" == "2" ]]; then
  # ── Installazione Docker ─────────────────────────────────────────────────
  if ! command -v docker &>/dev/null; then
    info "Docker non trovato. Installo..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$(whoami)"
    ok "Docker installato"
  else
    ok "Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"
  fi

  if ! command -v docker &>/dev/null || ! docker compose version &>/dev/null 2>&1; then
    info "Installo Docker Compose plugin..."
    sudo apt-get install -y docker-compose-plugin 2>/dev/null || true
  fi

  # .env
  if [ ! -f ".env" ]; then
    cp .env.example .env
    info "File .env creato da .env.example"
  else
    ok ".env già presente"
  fi

  # Credenziali admin
  echo ""
  echo "── Credenziali pannello Admin ──────────────────────────────"
  CURRENT_USER=$(grep -E '^ADMIN_USER=' .env | cut -d= -f2 || echo "admin")
  CURRENT_PASS=$(grep -E '^ADMIN_PASSWORD=' .env | cut -d= -f2 || echo "changeme")
  read -r -p "  Username admin [attuale: ${CURRENT_USER}]: " INPUT_USER
  INPUT_USER="${INPUT_USER:-$CURRENT_USER}"
  read -r -s -p "  Password admin (lascia vuoto per mantenere): " INPUT_PASS
  echo ""
  INPUT_PASS="${INPUT_PASS:-$CURRENT_PASS}"
  if grep -q '^ADMIN_USER=' .env; then
    sed -i "s|^ADMIN_USER=.*|ADMIN_USER=${INPUT_USER}|" .env
  else
    echo "ADMIN_USER=${INPUT_USER}" >> .env
  fi
  if grep -q '^ADMIN_PASSWORD=' .env; then
    sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${INPUT_PASS}|" .env
  else
    echo "ADMIN_PASSWORD=${INPUT_PASS}" >> .env
  fi
  ok "Credenziali admin: utente=${INPUT_USER}"

  mkdir -p public/models public/backgrounds public/icons
  touch avatars.db

  info "Build e avvio container..."
  docker compose up -d --build
  ok "Container avviato"

  echo ""
  read -r -p "Vuoi avviare automaticamente il container al boot? [s/N] " AUTOSTART
  if [[ "$AUTOSTART" =~ ^[Ss]$ ]]; then
    docker compose up -d --build
    ok "Il container si riavvia automaticamente (restart: unless-stopped)"
    info "Per fermarlo definitivamente: docker compose down"
  fi

  echo ""
  echo "============================================"
  echo -e "${GREEN}  Installazione Docker completata!${NC}"
  echo "============================================"
  echo ""
  PORT_VAL=$(grep -E '^PORT=' .env | cut -d= -f2 || echo "3000")
  echo "  Pannello admin: http://$(hostname -I | awk '{print $1}'):${PORT_VAL:-3000}/admin"
  echo ""
  echo "  Comandi utili:"
  echo "    docker compose logs -f        # log in tempo reale"
  echo "    docker compose restart        # riavvia"
  echo "    docker compose down           # ferma"
  echo ""
  exit 0
fi

# ── Funzione installazione pacchetti di sistema ───────────────────────────
install_pkg() {
  local pkg="$1"
  info "Installo $pkg automaticamente..."
  if command -v apt-get &>/dev/null; then
    sudo apt-get install -y "$pkg"
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y "$pkg"
  elif command -v yum &>/dev/null; then
    sudo yum install -y "$pkg"
  elif command -v pacman &>/dev/null; then
    sudo pacman -S --noconfirm "$pkg"
  elif command -v brew &>/dev/null; then
    brew install "$pkg"
  else
    err "Impossibile installare $pkg automaticamente. Installalo manualmente e riavvia lo script."
  fi
}

# ── Node.js ≥18 ───────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  info "Node.js non trovato. Provo a installarlo..."
  if command -v apt-get &>/dev/null; then
    # NodeSource per distribuzioni Debian/Ubuntu
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo dnf install -y nodejs
  elif command -v yum &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo yum install -y nodejs
  elif command -v brew &>/dev/null; then
    brew install node@20
  else
    err "Impossibile installare Node.js automaticamente. Scaricalo da https://nodejs.org (versione 18+)"
  fi
  command -v node &>/dev/null || err "Installazione Node.js fallita. Installalo manualmente."
fi
node -e "if(parseInt(process.version.slice(1)) < 18) process.exit(1)" \
  || err "Node.js $(node --version) troppo vecchio. Richiesta versione 18+."
ok "Node.js $(node --version)"

# ── curl (necessario per NodeSource se usato sopra) ───────────────────────
if ! command -v curl &>/dev/null; then
  install_pkg curl
  ok "curl installato"
fi

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

# ── Credenziali admin ─────────────────────────────────────────────────────
echo ""
echo "── Credenziali pannello Admin ──────────────────────────────"
CURRENT_USER=$(grep -E '^ADMIN_USER=' .env | cut -d= -f2 || echo "admin")
CURRENT_PASS=$(grep -E '^ADMIN_PASSWORD=' .env | cut -d= -f2 || echo "changeme")
read -r -p "  Username admin [attuale: ${CURRENT_USER}]: " INPUT_USER
INPUT_USER="${INPUT_USER:-$CURRENT_USER}"
read -r -s -p "  Password admin (lascia vuoto per mantenere): " INPUT_PASS
echo ""
INPUT_PASS="${INPUT_PASS:-$CURRENT_PASS}"

# Aggiorna o aggiungi i campi nel .env
if grep -q '^ADMIN_USER=' .env; then
  sed -i "s|^ADMIN_USER=.*|ADMIN_USER=${INPUT_USER}|" .env
else
  echo "ADMIN_USER=${INPUT_USER}" >> .env
fi
if grep -q '^ADMIN_PASSWORD=' .env; then
  sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${INPUT_PASS}|" .env
else
  echo "ADMIN_PASSWORD=${INPUT_PASS}" >> .env
fi
ok "Credenziali admin: utente=${INPUT_USER}"

# ── Directory dati ────────────────────────────────────────────────────────
mkdir -p public/models public/backgrounds public/icons
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
    NODE_BIN="$(command -v node)"
    SERVICE_FILE="/etc/systemd/system/avatar-kiosk.service"

    sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Avatar Kiosk
After=network.target

[Service]
Type=simple
User=${USER_NAME}
WorkingDirectory=${APP_DIR}
ExecStart=/bin/bash ${APP_DIR}/start-kiosk.sh --server
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable avatar-kiosk.service
    sudo systemctl start  avatar-kiosk.service
    sleep 2

    if systemctl is-active --quiet avatar-kiosk.service; then
      ok "Servizio avviato e abilitato al boot"
    else
      echo -e "${RED}[WARN]${NC}  Servizio abilitato ma non ancora attivo. Controlla con:"
      echo "         sudo systemctl status avatar-kiosk"
    fi

    echo ""
    echo "  Comandi utili:"
    echo "    sudo systemctl status  avatar-kiosk   # stato"
    echo "    sudo systemctl stop    avatar-kiosk   # ferma"
    echo "    sudo systemctl restart avatar-kiosk   # riavvia"
    echo "    sudo journalctl -u avatar-kiosk -f    # log in tempo reale"
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
