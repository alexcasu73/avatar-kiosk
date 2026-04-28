#!/usr/bin/env bash
# ============================================================
#  AVATAR KIOSK — Disinstallazione
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
info() { echo -e "${YELLOW}[INFO]${NC}  $*"; }
warn() { echo -e "${RED}[WARN]${NC}   $*"; }

echo ""
echo "============================================"
echo "  AVATAR KIOSK — Disinstallazione"
echo "============================================"
echo ""
warn "Questa operazione rimuoverà:"
echo "   • Il servizio systemd (se presente)"
echo "   • Le dipendenze npm (node_modules)"
echo "   • I dati caricati (modelli, sfondi, icone)"
echo "   • Il database (avatars.db)"
echo ""
read -r -p "Sei sicuro di voler procedere? [s/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Ss]$ ]]; then
  echo "Operazione annullata."
  exit 0
fi
echo ""

# ── Ferma e rimuovi servizio systemd ─────────────────────────────────────
SERVICE_FILE="/etc/systemd/system/avatar-kiosk.service"
if [ -f "$SERVICE_FILE" ]; then
  info "Rimozione servizio systemd..."
  if systemctl is-active --quiet avatar-kiosk.service 2>/dev/null; then
    sudo systemctl stop avatar-kiosk.service
    ok "Servizio fermato"
  fi
  if systemctl is-enabled --quiet avatar-kiosk.service 2>/dev/null; then
    sudo systemctl disable avatar-kiosk.service
    ok "Avvio automatico disabilitato"
  fi
  sudo rm -f "$SERVICE_FILE"
  sudo systemctl daemon-reload
  ok "File servizio rimosso"
else
  info "Nessun servizio systemd trovato, salto"
fi

# ── Rimuovi autostart Windows (se presente) ───────────────────────────────
if [[ "$OSTYPE" == "msys"* ]] || [[ "$OSTYPE" == "cygwin"* ]]; then
  SHORTCUT="$APPDATA/Microsoft/Windows/Start Menu/Programs/Startup/Avatar Kiosk.bat"
  if [ -f "$SHORTCUT" ]; then
    rm -f "$SHORTCUT"
    ok "Avvio automatico Windows rimosso"
  fi
fi

# ── Rimuovi node_modules ─────────────────────────────────────────────────
if [ -d "node_modules" ]; then
  info "Rimozione node_modules..."
  rm -rf node_modules
  ok "node_modules rimosso"
fi

# ── Dati utente ───────────────────────────────────────────────────────────
echo ""
read -r -p "Vuoi rimuovere anche il database e i file caricati (modelli, sfondi, icone)? [s/N] " REMOVE_DATA
if [[ "$REMOVE_DATA" =~ ^[Ss]$ ]]; then
  [ -f "avatars.db" ]            && rm -f avatars.db            && ok "Database rimosso"
  [ -d "public/models" ]         && rm -rf public/models        && ok "Modelli 3D rimossi"
  [ -d "public/backgrounds" ]    && rm -rf public/backgrounds   && ok "Sfondi rimossi"
  [ -d "public/icons" ]          && rm -rf public/icons         && ok "Icone rimosse"
  [ -d "chrome-kiosk-profile" ]  && rm -rf chrome-kiosk-profile && ok "Profilo Chrome rimosso"
else
  info "Dati utente mantenuti"
fi

# ── Fine ──────────────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo -e "${GREEN}  Disinstallazione completata!${NC}"
echo "============================================"
echo ""
info "Per rimuovere completamente la cartella del progetto:"
echo "    cd .. && rm -rf $(basename "$(pwd)")"
echo ""
