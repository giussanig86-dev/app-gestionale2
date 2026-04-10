/**
 * ADE SYNC ROUTES
 * Tutte le route richiedono autenticazione e ruolo 'consulente'.
 */

const router = require('express').Router();
const ctrl = require('../controllers/adeSync.controller');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('consulente'));

// Configurazione integrazione AdE
router.patch('/config', ctrl.updateConfig);

// Stato e log sync
router.get('/status', ctrl.getStatus);
router.get('/logs', ctrl.getLogs);
router.get('/logs/:logId', ctrl.getLog);

// Trigger sync manuale
router.post('/sync', ctrl.triggerSyncAll);
router.post('/sync/:clienteId', ctrl.triggerSyncCliente);

// Trasmissione fatture e corrispettivi al SDI/AdE
router.post('/trasmetti/fattura/:fatturaId', ctrl.trasmettiFattura);
router.post('/trasmetti/fatture/:clienteId', ctrl.trasmettiFattureCliente);
router.post('/trasmetti/corrispettivi/:clienteId', ctrl.trasmettiCorrispettivi);

// Gestione delega per cliente
router.patch('/clienti/:clienteId/delega', ctrl.updateDelegaCliente);

module.exports = router;
