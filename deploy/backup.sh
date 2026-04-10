#!/bin/bash
# ============================================================
# SCRIPT DI BACKUP — MongoDB + File caricati
# ============================================================
# Configura il cron:
#   crontab -e
#   0 3 * * * /var/www/gestionale/deploy/backup.sh >> /var/log/gestionale/backup.log 2>&1
#
# Richiede:
#   - mongodump (incluso in mongodb-database-tools)
#   - s3cmd (apt install s3cmd) configurato con credenziali Aruba Object Storage
#     oppure aws-cli con endpoint Aruba
# ============================================================

set -euo pipefail

# ── Configurazione ────────────────────────────────────────────
APP_DIR="/var/www/gestionale"
BACKUP_DIR="/tmp/gestionale-backup"
DATE=$(date +%Y%m%d-%H%M%S)
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/calcolatore-forfettario}"
S3_BUCKET="s3://gestionale-backup"         # bucket Aruba Object Storage
RETENTION_DAYS=30                           # conserva backup per 30 giorni
LOG_PREFIX="[BACKUP $(date '+%Y-%m-%d %H:%M:%S')]"

echo "$LOG_PREFIX === Inizio backup ==="

# ── Crea directory temporanea ─────────────────────────────────
rm -rf "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

# ── 1. Dump MongoDB ───────────────────────────────────────────
echo "$LOG_PREFIX Dump MongoDB..."
mongodump \
  --uri="$MONGO_URI" \
  --archive="$BACKUP_DIR/mongo-$DATE.archive" \
  --gzip

echo "$LOG_PREFIX MongoDB dump completato: $(du -sh "$BACKUP_DIR/mongo-$DATE.archive" | cut -f1)"

# ── 2. Backup file caricati (se non usi Object Storage esterno) ──
if [ -d "$APP_DIR/uploads" ]; then
  echo "$LOG_PREFIX Compressione uploads..."
  tar -czf "$BACKUP_DIR/uploads-$DATE.tar.gz" -C "$APP_DIR" uploads/
  echo "$LOG_PREFIX Upload compressi: $(du -sh "$BACKUP_DIR/uploads-$DATE.tar.gz" | cut -f1)"
fi

# ── 3. Backup file .env (escluso da git) ──────────────────────
if [ -f "$APP_DIR/.env" ]; then
  # Cifra con openssl prima di caricare
  openssl enc -aes-256-cbc -pbkdf2 -salt \
    -in "$APP_DIR/.env" \
    -out "$BACKUP_DIR/env-$DATE.enc" \
    -k "${BACKUP_ENCRYPTION_KEY:-cambia-questa-password}"
  echo "$LOG_PREFIX .env cifrato e incluso nel backup"
fi

# ── 4. Upload su Aruba Object Storage (s3cmd) ─────────────────
echo "$LOG_PREFIX Upload su Object Storage..."
for file in "$BACKUP_DIR"/*; do
  s3cmd put "$file" "$S3_BUCKET/$(basename "$file")" --no-progress
  echo "$LOG_PREFIX  ✓ $(basename "$file")"
done

# ── 5. Rimozione backup locali temporanei ─────────────────────
rm -rf "$BACKUP_DIR"
echo "$LOG_PREFIX File temporanei rimossi"

# ── 6. Pulizia backup vecchi su S3 (> RETENTION_DAYS giorni) ──
echo "$LOG_PREFIX Pulizia backup con più di $RETENTION_DAYS giorni..."
CUTOFF=$(date -d "-$RETENTION_DAYS days" +%Y%m%d)
s3cmd ls "$S3_BUCKET/" | while read -r line; do
  FILE_DATE=$(echo "$line" | grep -oP '\d{8}' | head -1)
  FILE_PATH=$(echo "$line" | awk '{print $4}')
  if [ -n "$FILE_DATE" ] && [ "$FILE_DATE" -lt "$CUTOFF" ]; then
    s3cmd del "$FILE_PATH" --no-progress
    echo "$LOG_PREFIX  Rimosso: $FILE_PATH"
  fi
done

echo "$LOG_PREFIX === Backup completato ==="
