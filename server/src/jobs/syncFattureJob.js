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

    console.log(`[ADE Sync] ${consulenti.length} consulente/i da sincronizzare.`);

    for (const consulente of consulenti) {
      try {
        console.log(`[ADE Sync] Sync consulente: ${consulente.nome} ${consulente.cognome}`);
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
    }

    console.log('[ADE Sync] Sincronizzazione automatica completata.');
  }, {
    timezone: 'Europe/Rome'
  });

  console.log('[ADE Sync] Cron job attivato (ogni giorno alle 06:00 ora italiana).');
}

module.exports = { startSyncJob };
