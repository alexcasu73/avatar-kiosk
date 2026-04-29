#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
info() { echo -e "${YELLOW}[INFO]${NC}  $*"; }

echo ""
echo "============================================"
echo "  AVATAR KIOSK — Aggiornamento"
echo "============================================"
echo ""

info "Pull aggiornamenti..."
git pull
ok "Codice aggiornato"

info "Creazione directory dati mancanti..."
mkdir -p public/models public/backgrounds public/icons \
         public/bg-videos public/idle-videos public/idle-bgs
ok "Directory verificate"

info "Build e riavvio container..."
docker compose up -d --build
ok "Container aggiornato e riavviato"

echo ""
echo "============================================"
echo -e "${GREEN}  Aggiornamento completato!${NC}"
echo "============================================"
echo ""
