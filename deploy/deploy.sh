#!/bin/bash
# ============================================================
# DEPLOY SCRIPT — Aggiornamento applicazione su Aruba
# ============================================================
# Esegui sul server come utente non-root:
#   bash /var/www/gestionale/deploy/deploy.sh
#
# Oppure da CI/CD (GitHub Actions):
#   ssh utente@TUO_SERVER "bash /var/www/gestionale/deploy/deploy.sh"
# ============================================================

set -euo pipefail

APP_DIR="/var/www/gestionale"
LOG_PREFIX="[DEPLOY $(date '+%Y-%m-%d %H:%M:%S')]"

echo "$LOG_PREFIX === Inizio deploy ==="
cd "$APP_DIR"

# ── 1. Pull aggiornamenti da git ──────────────────────────────
echo "$LOG_PREFIX Pull da git..."
git pull origin main

# ── 2. Installa dipendenze backend (solo produzione) ──────────
echo "$LOG_PREFIX Installazione dipendenze server..."
cd "$APP_DIR/server"
npm ci --omit=dev

# ── 3. Build frontend ─────────────────────────────────────────
echo "$LOG_PREFIX Build client React..."
cd "$APP_DIR/client"
npm ci
npm run build

# ── 4. Reload PM2 (zero-downtime in cluster mode) ─────────────
echo "$LOG_PREFIX Reload PM2..."
cd "$APP_DIR"
pm2 reload deploy/ecosystem.config.js --env production --update-env

# ── 5. Verifica che l'app risponda ────────────────────────────
echo "$LOG_PREFIX Verifica health check..."
sleep 3
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/api/v1/health || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
  echo "$LOG_PREFIX ✅ App risponde correttamente (HTTP $HTTP_STATUS)"
else
  echo "$LOG_PREFIX ⚠️  Health check: HTTP $HTTP_STATUS — verifica i log con: pm2 logs gestionale"
fi

echo "$LOG_PREFIX === Deploy completato ==="
pm2 status gestionale
