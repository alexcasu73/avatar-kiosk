#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
info() { echo -e "${YELLOW}[INFO]${NC}  $*"; }
warn() { echo -e "${RED}[WARN]${NC}  $*"; }

echo ""
echo "============================================"
echo "  AVATAR KIOSK — Setup iniziale"
echo "============================================"
echo ""

# Crea .env se non esiste
if [ ! -f .env ]; then
  info "Creazione .env da .env.example..."
  cp .env.example .env
  warn "Modifica .env con le tue chiavi API prima di avviare!"
else
  ok ".env già presente"
fi

# Crea directory dati persistenti (montate come volumi Docker)
info "Creazione directory dati..."
mkdir -p public/models public/backgrounds public/icons \
         public/bg-videos public/idle-videos public/idle-bgs
ok "Directory create"

# Build e avvio container
info "Build e avvio container Docker..."
docker compose up -d --build
ok "Container avviato"

echo ""
echo "============================================"
echo -e "${GREEN}  Setup completato!${NC}"
echo "============================================"
echo ""
echo "  → Admin:  http://localhost:${PORT:-3000}/admin"
echo "  → Health: http://localhost:${PORT:-3000}/api/health"
echo ""
