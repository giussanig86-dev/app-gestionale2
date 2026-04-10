/**
 * SYNC FATTURE JOB
 * Cron job per il download automatico giornaliero delle fatture AdE.
 *
 * Viene eseguito ogni giorno alle ore 06:00 (configurabile per consulente).
 * Per ogni consulente con integrazione AdE abilitata, avvia il sync
 * di tutti i clienti in delega.
 */

const cron = require('node-cron');
const User = require('../models/User');
const { syncAllClientiPerConsulente } = require('../services/syncFattureAde');

/**
 * Avvia il cron job di sincronizzazione fatture AdE.
 * Chiamare questa funzione una volta sola all'avvio del server,
 * dopo la connessione al database.
 */
function startSyncJob() {
  // Default: ogni giorno alle 06:00
  cron.schedule('0 6 * * *', async () => {
    console.log('[ADE Sync] Avvio sincronizzazione automatica fatture...');

    let consulenti;
    try {
      consulenti = await User.find({
        ruolo: 'consulente',
        'ade.enabled': true
      }).select('_id nome cognome ade');
    } catch (err) {
      console.error('[ADE Sync] Errore nel recupero dei consulenti:', err.message);
      return;
    }

    if (consulenti.length === 0) {
      console.log('[ADE Sync] Nessun consulente con integrazione AdE abilitata.');
      return;
    }

    console.log(`[ADE Sync] ${consulenti.length} consulente/i da sincronizzare (jitter 0-60 min).`);

    for (const consulente of consulenti) {
      const jitterMs = Math.floor(Math.random() * 60 * 60 * 1000);
      const jitterMin = Math.round(jitterMs / 60000);
      console.log(`[ADE Sync] Consulente ${consulente._id} (${consulente.nome} ${consulente.cognome}): partenza tra ${jitterMin} min`);
      setTimeout(async () => {
        try {
          const risultato = await syncAllClientiPerConsulente(consulente._id);
          console.log(
            `[ADE Sync] Consulente ${consulente._id}: ` +
            `importate=${risultato.fattureImportate}, ` +
            `duplicate=${risultato.fattureDuplicate}, ` +
            `errori=${risultato.fattureErrori}`
          );
        } catch (err) {
          console.error(`[ADE Sync] Errore sync consulente ${consulente._id}:`, err.message);
        }
      }, jitterMs);
    }

    console.log('[ADE Sync] Sync schedulati con jitter — completamento entro le 07:00.');
  }, {
    timezone: 'Europe/Rome'
  });

  console.log('[ADE Sync] Cron job attivato (ogni giorno alle 06:00 ora italiana).');
}

module.exports = { startSyncJob };
