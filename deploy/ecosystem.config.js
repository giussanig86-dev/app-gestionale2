/**
 * PM2 ECOSYSTEM CONFIG
 * Avvia e gestisce il processo Node.js in produzione.
 *
 * Uso:
 *   pm2 start deploy/ecosystem.config.js --env production
 *   pm2 save
 *   pm2 startup   (per avvio automatico al reboot)
 */

module.exports = {
  apps: [
    {
      name: 'gestionale',
      script: './server/src/server.js',
      cwd: '/var/www/gestionale',

      // ── Cluster mode: usa tutti i core disponibili ────────
      // Per un server da 4 vCPU → 4 worker
      instances: 'max',
      exec_mode: 'cluster',

      // ── Variabili d'ambiente di produzione ───────────────
      // NON mettere secrets qui — usare il file .env sul server
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      },

      // ── Restart automatico ────────────────────────────────
      watch: false,                 // mai in produzione
      max_memory_restart: '500M',   // restart se supera 500MB RAM
      restart_delay: 3000,          // attendi 3s prima di riavviare
      max_restarts: 10,             // dopo 10 restart consecutivi → stop

      // ── Logging ──────────────────────────────────────────
      log_file: '/var/log/gestionale/combined.log',
      out_file: '/var/log/gestionale/out.log',
      error_file: '/var/log/gestionale/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,

      // ── Graceful shutdown ─────────────────────────────────
      kill_timeout: 5000,           // attendi 5s prima di SIGKILL
      listen_timeout: 8000,
      shutdown_with_message: true
    }
  ]
};
