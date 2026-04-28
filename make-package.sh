#!/usr/bin/env bash
# ============================================================
#  AVATAR KIOSK — Crea pacchetto distribuibile
#  Genera: avatar-kiosk-vX.Y.Z.tar.gz
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(node -p "require('./package.json').version")
PACKAGE_NAME="avatar-kiosk-v${VERSION}"
OUT_FILE="${PACKAGE_NAME}.tar.gz"

echo "Creazione pacchetto ${OUT_FILE}..."

# File/directory da escludere
EXCLUDES=(
  --exclude=".git"
  --exclude="node_modules"
  --exclude=".env"
  --exclude="avatars.db"
  --exclude="avatars.db-journal"
  --exclude="chrome-kiosk-profile"
  --exclude="public/models"
  --exclude="public/backgrounds"
  --exclude="*.tar.gz"
  --exclude=".DS_Store"
  --exclude="*.log"
  --exclude=".claude"
)

tar -czf "$OUT_FILE" "${EXCLUDES[@]}" .

SIZE=$(du -sh "$OUT_FILE" | cut -f1)
echo ""
echo "✅ Pacchetto creato: ${OUT_FILE} (${SIZE})"
echo ""
echo "Contenuto:"
tar -tzf "$OUT_FILE" | head -40
echo ""
echo "Per installare su una nuova macchina:"
echo "  1. Copia ${OUT_FILE} sulla macchina di destinazione"
echo "  2. tar -xzf ${OUT_FILE}"
echo "  3. cd ${PACKAGE_NAME} && ./install.sh   (Linux/macOS)"
echo "       oppure install.bat                  (Windows)"
