/**
 * ADE SYNC CONTROLLER
 * Endpoints per la sincronizzazione manuale delle fatture AdE e
 * per la configurazione dell'integrazione per cliente (flag inDelega).
 */

const User = require('../models/User');
const SdiSyncLog = require('../models/SdiSyncLog');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { syncAllClientiPerConsulente, syncClienteById } = require('../services/syncFattureAde');
const {
  trasmettiFattura,
  trasmettiFattureCliente
} = require('../services/sdiTransmissionService');

/**
 * POST /api/v1/ade/sync
 * Avvia il sync di tutti i clienti in delega del consulente autenticato.
 * Risponde immediatamente con 202 e lancia il sync in background.
 */
exports.triggerSyncAll = catchAsync(async (req, res, next) => {
  const consulente = req.user;

  if (!consulente.ade?.enabled) {
    return next(new AppError('Integrazione AdE non abilitata. Configurala nelle Impostazioni.', 400));
  }

  // Lancia in background senza await, così risponde subito
  syncAllClientiPerConsulente(consulente._id).catch((err) => {
    console.error(`[ADE Sync] Errore sync consulente ${consulente._id}:`, err.message);
  });

  res.status(202).json({
    status: 'success',
    messaggio: 'Sincronizzazione avviata. Controlla i log per i risultati.'
  });
});

/**
 * POST /api/v1/ade/sync/:clienteId
 * Avvia il sync di un singolo cliente in delega.
 */
exports.triggerSyncCliente = catchAsync(async (req, res, next) => {
  const consulente = req.user;

  if (!consulente.ade?.enabled) {
    return next(new AppError('Integrazione AdE non abilitata. Configurala nelle Impostazioni.', 400));
  }

  const { clienteId } = req.params;

  // Verifica che il cliente appartenga al consulente e sia in delega
  const cliente = await User.findOne({
    _id: clienteId,
    consulenteId: consulente._id,
    ruolo: 'cliente'
  });

  if (!cliente) {
    return next(new AppError('Cliente non trovato.', 404));
  }

  if (!cliente.ade?.inDelega) {
    return next(new AppError('Questo cliente non ha la delega AdE attiva.', 400));
  }

  // Lancia in background
  syncClienteById(consulente._id, clienteId).catch((err) => {
    console.error(`[ADE Sync] Errore sync cliente ${clienteId}:`, err.message);
  });

  res.status(202).json({
    status: 'success',
    messaggio: `Sincronizzazione avviata per ${cliente.nome} ${cliente.cognome}.`
  });
});

/**
 * GET /api/v1/ade/sync/logs
 * Restituisce gli ultimi 20 log di sincronizzazione del consulente.
 */
exports.getLogs = catchAsync(async (req, res) => {
  const logs = await SdiSyncLog.find({
    consulenteId: req.user._id,
    source: 'ade'
  })
    .sort({ syncStartedAt: -1 })
    .limit(20)
    .populate('clienteId', 'nome cognome');

  res.status(200).json({
    status: 'success',
    results: logs.length,
    data: { logs }
  });
});

/**
 * GET /api/v1/ade/sync/logs/:logId
 * Restituisce il dettaglio di un log specifico.
 */
exports.getLog = catchAsync(async (req, res, next) => {
  const log = await SdiSyncLog.findOne({
    _id: req.params.logId,
    consulenteId: req.user._id,
    source: 'ade'
  }).populate('clienteId', 'nome cognome');

  if (!log) return next(new AppError('Log non trovato.', 404));

  res.status(200).json({
    status: 'success',
    data: { log }
  });
});

/**
 * GET /api/v1/ade/sync/status
 * Restituisce lo stato dell'ultimo sync e la configurazione AdE del consulente.
 */
exports.getStatus = catchAsync(async (req, res) => {
  const consulente = await User.findById(req.user._id).select('ade');

  const ultimoLog = await SdiSyncLog.findOne({
    consulenteId: req.user._id,
    source: 'ade'
  }).sort({ syncStartedAt: -1 });

  const clientiInDelega = await User.countDocuments({
    consulenteId: req.user._id,
    ruolo: 'cliente',
    accountSospeso: false,
    'ade.inDelega': true
  });

  res.status(200).json({
    status: 'success',
    data: {
      ade: consulente.ade,
      clientiInDelega,
      ultimoSync: ultimoLog
        ? {
            status: ultimoLog.status,
            syncStartedAt: ultimoLog.syncStartedAt,
            syncCompletedAt: ultimoLog.syncCompletedAt,
            fattureImportate: ultimoLog.fattureImportate,
            fattureDuplicate: ultimoLog.fattureDuplicate,
            fattureErrori: ultimoLog.fattureErrori
          }
        : null
    }
  });
});

// ═══════════════════════════════════════════════════════
//  TRASMISSIONE FATTURE E CORRISPETTIVI
// ═══════════════════════════════════════════════════════

/**
 * POST /api/v1/ade/trasmetti/fattura/:fatturaId
 * Trasmette una singola fattura attiva al SDI.
 */
exports.trasmettiFattura = catchAsync(async (req, res, next) => {
  const { fatturaId } = req.params;
  try {
    const result = await trasmettiFattura(fatturaId, req.user._id);
    res.status(200).json({
      status: 'success',
      messaggio: 'Fattura trasmessa al SDI con successo.',
      data: result
    });
  } catch (err) {
    return next(new AppError(err.message, 400));
  }
});

/**
 * POST /api/v1/ade/trasmetti/fatture/:clienteId
 * Trasmette tutte le fatture bozza di un cliente al SDI.
 */
exports.trasmettiFattureCliente = catchAsync(async (req, res, next) => {
  const { clienteId } = req.params;
  try {
    const result = await trasmettiFattureCliente(clienteId, req.user._id);
    res.status(200).json({
      status: 'success',
      messaggio: `Trasmissione completata: ${result.trasmesse} inviate, ${result.errori} errori.`,
      data: result
    });
  } catch (err) {
    return next(new AppError(err.message, 400));
  }
});

// ═══════════════════════════════════════════════════════
//  CONFIGURAZIONE
// ═══════════════════════════════════════════════════════
// Nota: la trasmissione corrispettivi (scontrini) avviene via A-Cube
// → vedere /api/v1/acube/scontrino/:clienteId

/**
 * PATCH /api/v1/ade/config
 * Aggiorna la configurazione AdE del consulente (abilitazione, certPath, password, schedule).
 */
exports.updateConfig = catchAsync(async (req, res) => {
  const { enabled, certPath, certPassword, syncSchedule, importOnlyAfter } = req.body;

  const updates = {};
  if (enabled !== undefined) updates['ade.enabled'] = enabled;
  if (certPath !== undefined) updates['ade.certPath'] = certPath;
  if (certPassword !== undefined) updates['ade.certPassword'] = certPassword;
  if (syncSchedule !== undefined) updates['ade.syncSchedule'] = syncSchedule;
  if (importOnlyAfter !== undefined) updates['ade.importOnlyAfter'] = importOnlyAfter;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    updates,
    { new: true, runValidators: true }
  );

  res.status(200).json({
    status: 'success',
    data: { ade: user.ade }
  });
});

/**
 * PATCH /api/v1/ade/clienti/:clienteId/delega
 * Aggiorna il flag inDelega e la data delega di un cliente.
 */
exports.updateDelegaCliente = catchAsync(async (req, res, next) => {
  const { inDelega, delegaDal } = req.body;
  const { clienteId } = req.params;

  const cliente = await User.findOne({
    _id: clienteId,
    consulenteId: req.user._id,
    ruolo: 'cliente'
  });

  if (!cliente) return next(new AppError('Cliente non trovato.', 404));

  const updates = {};
  if (inDelega !== undefined) updates['ade.inDelega'] = inDelega;
  if (delegaDal !== undefined) updates['ade.delegaDal'] = delegaDal;

  const updated = await User.findByIdAndUpdate(clienteId, updates, { new: true });

  res.status(200).json({
    status: 'success',
    data: { ade: updated.ade }
  });
});
