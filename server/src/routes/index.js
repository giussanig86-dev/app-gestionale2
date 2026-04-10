/**
 * AGGREGATORE ROUTES
 * Monta tutte le route su /api/v1
 */

const router = require('express').Router();

router.use('/auth', require('./auth.routes'));
router.use('/corrispettivi', require('./corrispettivi.routes'));
router.use('/fatture', require('./fatture.routes'));
router.use('/costi', require('./costi.routes'));
router.use('/versamenti', require('./versamenti.routes'));
router.use('/chilometri', require('./chilometri.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/users', require('./users.routes'));
router.use('/documenti',  require('./documenti.routes'));
router.use('/veicoli',    require('./veicoli.routes'));
router.use('/notifiche',  require('./notifiche.routes'));
router.use('/admin', require('./admin.routes'));
router.use('/ade', require('./adeSync.routes'));
router.use('/acube', require('./aCube.routes'));

module.exports = router;
