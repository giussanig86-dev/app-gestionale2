/**
 * A-CUBE ROUTES
 * Tutte le route richiedono autenticazione e ruolo 'consulente'.
 */

const router = require('express').Router();
const ctrl = require('../controllers/aCubeSync.controller');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('consulente'));

// Stato e configurazione
router.get('/status', ctrl.getStatus);
router.patch('/config', ctrl.updateConfig);

// Autenticazione: ottieni token di sistema
router.post('/token', ctrl.getSystemToken);

// Scontrino Elettronico Smart
router.post('/scontrino/:clienteId', ctrl.emettiScontrino);

// Gestione abilitazione per cliente
router.patch('/clienti/:clienteId/abilita', ctrl.abilitaCliente);

module.exports = router;
