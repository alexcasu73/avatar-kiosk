#!/usr/bin/env bash
# ============================================================
#  AVATAR KIOSK — Setup SSL con Let's Encrypt + nginx
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
info() { echo -e "${YELLOW}[INFO]${NC}  $*"; }
err()  { echo -e "${RED}[ERRORE]${NC} $*"; exit 1; }

echo ""
echo "============================================"
echo "  AVATAR KIOSK — Setup SSL"
echo "============================================"
echo ""

read -r -p "Inserisci il tuo dominio (es. kiosk.esempio.com): " DOMAIN
[ -z "$DOMAIN" ] && err "Dominio obbligatorio."

read -r -p "Email per Let's Encrypt: " EMAIL
[ -z "$EMAIL" ] && err "Email obbligatoria."

# Sostituisci DOMAIN_PLACEHOLDER nella config nginx
sed -i "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" nginx/conf.d/app.conf
ok "Config nginx aggiornata per ${DOMAIN}"

# Crea directory certbot
mkdir -p nginx/certbot/conf nginx/certbot/www

# Avvia solo nginx in modalità HTTP per la challenge
info "Avvio nginx (HTTP only) per la challenge ACME..."
docker compose up -d nginx
sleep 3

# Ottieni il certificato
info "Richiedo certificato Let's Encrypt per ${DOMAIN}..."
docker compose run --rm certbot certonly \
  --webroot \
  -w /var/www/certbot \
  -d "${DOMAIN}" \
  --email "${EMAIL}" \
  --agree-tos \
  --no-eff-email

ok "Certificato ottenuto!"

# Riavvia tutto
info "Riavvio tutti i container..."
docker compose up -d --build
ok "Container avviati con HTTPS"

echo ""
echo "============================================"
echo -e "${GREEN}  SSL attivo!${NC}"
echo "============================================"
echo ""
echo "  Il kiosk è raggiungibile su:"
echo "    https://${DOMAIN}/k/{id}"
echo "    https://${DOMAIN}/admin"
echo ""
echo "  Il certificato si rinnova automaticamente."
echo ""
