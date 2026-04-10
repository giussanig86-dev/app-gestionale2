#!/bin/bash
# ============================================================
# SETUP INIZIALE SERVER ARUBA — Ubuntu 22.04 LTS
# ============================================================
# Esegui UNA SOLA VOLTA come root subito dopo aver creato il server:
#   bash setup-server.sh
#
# Cosa fa:
#   1. Aggiorna il sistema
#   2. Installa Node.js 20, MongoDB, Nginx, PM2, s3cmd, Certbot
#   3. Crea utente non-root per l'app
#   4. Configura UFW firewall
#   5. Crea struttura directory
# ============================================================

set -euo pipefail

# ── Configurazione — MODIFICA QUI ────────────────────────────
APP_USER="gestionale"
APP_DIR="/var/www/gestionale"
GIT_REPO="https://github.com/TUO_UTENTE/app-gestionale2.git"  # o URL Gitea
DOMINIO="TUO_DOMINIO.it"

echo "=== [1/8] Aggiornamento sistema ==="
apt update && apt upgrade -y

echo "=== [2/8] Installazione dipendenze base ==="
apt install -y curl wget git ufw fail2ban openssl s3cmd logrotate

echo "=== [3/8] Installazione Node.js 20 (LTS) ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version && npm --version

echo "=== [4/8] Installazione MongoDB 7.0 ==="
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" \
  | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
apt update && apt install -y mongodb-org mongodb-database-tools
systemctl enable mongod
systemctl start mongod
echo "MongoDB status: $(systemctl is-active mongod)"

echo "=== [5/8] Installazione Nginx + Certbot ==="
apt install -y nginx certbot python3-certbot-nginx
systemctl enable nginx

echo "=== [6/8] Installazione PM2 ==="
npm install -g pm2
pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER"

echo "=== [7/8] Configurazione Firewall UFW ==="
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment "SSH"
ufw allow 80/tcp comment "HTTP"
ufw allow 443/tcp comment "HTTPS"
ufw --force enable
echo "UFW status:"
ufw status

echo "=== [7b/8] Configurazione Fail2Ban ==="
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port    = ssh
logpath = /var/log/auth.log

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled = true
EOF
systemctl enable fail2ban
systemctl restart fail2ban

echo "=== [8/8] Creazione utente e struttura directory ==="
# Crea utente dedicato (no shell di login, no sudo)
if ! id "$APP_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$APP_USER"
fi

# Directory app
mkdir -p "$APP_DIR"
mkdir -p /var/log/gestionale
mkdir -p /opt/certs          # certificati PFX AdE (chmod 700)

chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
chown -R "$APP_USER":"$APP_USER" /var/log/gestionale
chmod 700 /opt/certs

# Logrotate per i log PM2
cat > /etc/logrotate.d/gestionale << EOF
/var/log/gestionale/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 $APP_USER $APP_USER
    postrotate
        pm2 reloadLogs
    endscript
}
EOF

echo ""
echo "=============================================="
echo "✅ Setup completato!"
echo ""
echo "Prossimi passi MANUALI:"
echo ""
echo "1. Clona il repo:"
echo "   su - $APP_USER"
echo "   git clone $GIT_REPO $APP_DIR"
echo ""
echo "2. Crea il file .env:"
echo "   cp $APP_DIR/.env.example $APP_DIR/.env"
echo "   nano $APP_DIR/.env   ← inserisci tutti i secrets"
echo ""
echo "3. Configura MongoDB con autenticazione:"
echo "   mongosh → use admin → db.createUser({user:'gestionale', pwd:'PASSWORD', roles:[{role:'readWrite', db:'calcolatore-forfettario'}]})"
echo ""
echo "4. Copia la config Nginx:"
echo "   cp $APP_DIR/deploy/nginx.conf /etc/nginx/sites-available/gestionale"
echo "   nano /etc/nginx/sites-available/gestionale  ← sostituisci TUO_DOMINIO.it"
echo "   ln -s /etc/nginx/sites-available/gestionale /etc/nginx/sites-enabled/"
echo "   nginx -t && systemctl reload nginx"
echo ""
echo "5. Ottieni certificato SSL:"
echo "   certbot --nginx -d $DOMINIO -d www.$DOMINIO"
echo ""
echo "6. Prima build e avvio:"
echo "   bash $APP_DIR/deploy/deploy.sh"
echo ""
echo "7. Configura cron backup:"
echo "   crontab -e"
echo "   0 3 * * * bash $APP_DIR/deploy/backup.sh >> /var/log/gestionale/backup.log 2>&1"
echo "=============================================="
