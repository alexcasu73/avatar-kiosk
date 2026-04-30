#!/usr/bin/env bash
# ============================================================
#  AVATAR KIOSK — Setup SSL condiviso con nginx NutriAI
# ============================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
info() { echo -e "${YELLOW}[INFO]${NC}  $*"; }
err()  { echo -e "${RED}[ERRORE]${NC} $*"; exit 1; }

NUTRIAI_DIR="/root/NutriAI"
KIOSK_DIR="$(cd "$(dirname "$0")" && pwd)"
DOMAIN="aivatar.it"
EMAIL="team@ncodestudio.it"

[ -d "$NUTRIAI_DIR" ] || err "Directory NutriAI non trovata in $NUTRIAI_DIR"

echo ""
echo "============================================"
echo "  AVATAR KIOSK — Setup SSL (nginx condiviso)"
echo "============================================"
echo ""

# ── 1. Aggiorna avatar-kiosk ─────────────────────────────────────────────
info "Aggiorno avatar-kiosk..."
cd "$KIOSK_DIR"
git pull
docker compose up -d --build
ok "avatar-kiosk avviato"

# ── 2. Directory certbot ─────────────────────────────────────────────────
info "Creo directory certbot in NutriAI..."
mkdir -p "$NUTRIAI_DIR/certbot/conf" "$NUTRIAI_DIR/certbot/www"
ok "Directory certbot pronte"

# ── 3. Aggiorna nginx.prod.conf ──────────────────────────────────────────
info "Aggiorno nginx.prod.conf..."
cat > "$NUTRIAI_DIR/nginx.prod.conf" << 'NGINXEOF'
# NutriAI
server {
    listen 80;
    server_name _;
    client_max_body_size 20M;
    resolver 127.0.0.11 valid=10s;

    location ~* ^/(profile|diary|meals|weight|activities|uploads|health) {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }

    location / {
        proxy_pass http://frontend:80;
        proxy_set_header Host $host;
    }
}

# Avatar Kiosk — ACME challenge + redirect HTTPS
server {
    listen 80;
    server_name aivatar.it;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# Avatar Kiosk — HTTPS (attivato solo dopo il certificato)
server {
    listen 443 ssl;
    server_name aivatar.it;

    ssl_certificate     /etc/letsencrypt/live/aivatar.it/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/aivatar.it/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    client_max_body_size 200M;

    location / {
        proxy_pass http://avatar-kiosk:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
    }
}
NGINXEOF
ok "nginx.prod.conf aggiornato"

# ── 4. Aggiorna docker-compose.yml di NutriAI ────────────────────────────
info "Aggiorno docker-compose.yml di NutriAI..."

# Backup
cp "$NUTRIAI_DIR/docker-compose.yml" "$NUTRIAI_DIR/docker-compose.yml.bak"

# Aggiunge porta 443 al nginx se non c'è già
if ! grep -q '"443:443"' "$NUTRIAI_DIR/docker-compose.yml"; then
  sed -i 's/- "80:80"/- "80:80"\n      - "443:443"/' "$NUTRIAI_DIR/docker-compose.yml"
  ok "Porta 443 aggiunta a nginx"
fi

# Aggiunge volumi certbot al nginx se non ci sono già
if ! grep -q 'certbot/conf' "$NUTRIAI_DIR/docker-compose.yml"; then
  sed -i '/nginx.prod.conf.*default.conf/a\      - ./certbot/conf:/etc/letsencrypt:ro\n      - ./certbot/www:/var/www/certbot:ro' "$NUTRIAI_DIR/docker-compose.yml"
  ok "Volumi certbot aggiunti a nginx"
fi

# Aggiunge servizio certbot se non c'è già
if ! grep -q 'certbot:' "$NUTRIAI_DIR/docker-compose.yml"; then
  cat >> "$NUTRIAI_DIR/docker-compose.yml" << 'COMPOSEEOF'

  certbot:
    image: certbot/certbot
    volumes:
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew --webroot -w /var/www/certbot --quiet; sleep 12h & wait $${!}; done'"
COMPOSEEOF
  ok "Servizio certbot aggiunto"
fi

# ── 5. Riavvia nginx con config temporanea HTTP-only (senza blocco SSL) ──
info "Avvio nginx in modalità HTTP per la challenge ACME..."

# Config temporanea senza blocco SSL (il certificato non esiste ancora)
cat > "$NUTRIAI_DIR/nginx.prod.conf.tmp" << 'TMPEOF'
server {
    listen 80;
    server_name _;
    client_max_body_size 20M;
    resolver 127.0.0.11 valid=10s;

    location ~* ^/(profile|diary|meals|weight|activities|uploads|health) {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }

    location / {
        proxy_pass http://frontend:80;
        proxy_set_header Host $host;
    }
}

server {
    listen 80;
    server_name aivatar.it;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
TMPEOF

cp "$NUTRIAI_DIR/nginx.prod.conf" "$NUTRIAI_DIR/nginx.prod.conf.ssl"
cp "$NUTRIAI_DIR/nginx.prod.conf.tmp" "$NUTRIAI_DIR/nginx.prod.conf"

cd "$NUTRIAI_DIR"
docker compose up -d nginx
sleep 3
ok "nginx avviato in HTTP-only"

# ── 6. Ottieni certificato ───────────────────────────────────────────────
info "Richiedo certificato Let's Encrypt per $DOMAIN..."
docker compose run --rm certbot certonly \
  --webroot \
  -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --non-interactive

ok "Certificato ottenuto!"

# ── 7. Ripristina config SSL completa e riavvia ──────────────────────────
info "Attivo configurazione HTTPS..."
cp "$NUTRIAI_DIR/nginx.prod.conf.ssl" "$NUTRIAI_DIR/nginx.prod.conf"
rm -f "$NUTRIAI_DIR/nginx.prod.conf.tmp" "$NUTRIAI_DIR/nginx.prod.conf.ssl"

docker compose up -d
ok "nginx riavviato con SSL"

echo ""
echo "============================================"
echo -e "${GREEN}  SSL attivo!${NC}"
echo "============================================"
echo ""
echo "  https://${DOMAIN}/k/{id}   — Kiosk"
echo "  https://${DOMAIN}/admin    — Admin"
echo ""
echo "  Il certificato si rinnova automaticamente."
echo ""
