/**
 * A-CUBE SYNC CONTROLLER
 * Endpoint per la configurazione e l'emissione scontrini via A-Cube.
 */

const User = require('../models/User');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const ACubeClient = require('../services/aCubeClient');
const { emettiScontrinoGiornaliero, emettiScontrinoMensile } = require('../services/aCubeScontriniService');
const { APICUBE_CLIENT_ID, APICUBE_CLIENT_SECRET } = require('../config/env');

/**
 * GET /api/v1/acube/status
 * Stato configurazione A-Cube del consulente e test connessione.
 */
exports.getStatus = catchAsync(async (req, res) => {
  const consulente = await User.findById(req.user._id).select('apiCube');

  let connectionTest = null;
  if (consulente.apiCube?.accessToken) {
    const client = new ACubeClient(consulente.apiCube.accessToken);
    connectionTest = await client.verificaCredenziali();
  }

  const clientiAbilitati = await User.countDocuments({
    consulenteId: req.user._id,
    ruolo: 'cliente',
    'apiCube.enabled': true
  });

  res.status(200).json({
    status: 'success',
    data: {
      configurato: !!(consulente.apiCube?.accessToken),
      clientId: APICUBE_CLIENT_ID ? '***configurato***' : null,
      tokenExpiresAt: consulente.apiCube?.tokenExpiresAt,
      lastSyncAt: consulente.apiCube?.lastSyncAt,
      clientiAbilitati,
      connectionTest
    }
  });
});

/**
 * PATCH /api/v1/acube/config
 * Salva le credenziali OAuth2 A-Cube per il consulente o per un cliente.
 * Body: { accessToken, refreshToken, tokenExpiresAt, clienteId? }
 * Se clienteId è fornito → configura per quel cliente specifico.
 */
exports.updateConfig = catchAsync(async (req, res, next) => {
  const { accessToken, refreshToken, tokenExpiresAt, clienteId, enabled } = req.body;

  let targetId = req.user._id;
  if (clienteId) {
    // Verifica che il cliente appartenga al consulente
    const cliente = await User.findOne({ _id: clienteId, consulenteId: req.user._id, ruolo: 'cliente' });
    if (!cliente) return next(new AppError('Cliente non trovato.', 404));
    targetId = clienteId;
  }

  const updates = {};
  if (enabled !== undefined)         updates['apiCube.enabled'] = enabled;
  if (accessToken !== undefined)     updates['apiCube.accessToken'] = accessToken;
  if (refreshToken !== undefined)    updates['apiCube.refreshToken'] = refreshToken;
  if (tokenExpiresAt !== undefined)  updates['apiCube.tokenExpiresAt'] = tokenExpiresAt;
  if (clienteId === undefined) {
    // Registra chi ha configurato e quando (solo a livello cliente)
  } else {
    updates['apiCube.configuredBy'] = req.user._id;
    updates['apiCube.configuredAt'] = new Date();
  }

  const updated = await User.findByIdAndUpdate(targetId, updates, { new: true }).select('apiCube');

  res.status(200).json({
    status: 'success',
    data: { apiCube: updated.apiCube }
  });
});

/**
 * POST /api/v1/acube/token
 * Ottiene un token di sistema A-Cube tramite client credentials.
 * Utile per il setup iniziale.
 */
exports.getSystemToken = catchAsync(async (req, res, next) => {
  if (!APICUBE_CLIENT_ID || !APICUBE_CLIENT_SECRET) {
    return next(new AppError('Credenziali A-Cube non configurate nel server. Imposta APICUBE_CLIENT_ID e APICUBE_CLIENT_SECRET nel .env', 400));
  }

  const client = new ACubeClient();
  try {
    const tokenData = await client.getSystemToken();
    // Salva il token per il consulente
    await User.findByIdAndUpdate(req.user._id, {
      'apiCube.accessToken': tokenData.access_token,
      'apiCube.refreshToken': tokenData.refresh_token || null,
      'apiCube.tokenExpiresAt': new Date(Date.now() + (tokenData.expires_in || 3600) * 1000),
      'apiCube.enabled': true
    });

    res.status(200).json({
      status: 'success',
      messaggio: 'Token A-Cube ottenuto e salvato.',
      data: { expires_in: tokenData.expires_in }
    });
  } catch (err) {
    return next(new AppError(`Errore ottenimento token A-Cube: ${err.response?.data?.message || err.message}`, 400));
  }
});

/**
 * POST /api/v1/acube/scontrino/:clienteId
 * Emette uno scontrino elettronico smart per un cliente.
 * Body: { data?: 'YYYY-MM-DD' } oppure { anno, mese }
 */
exports.emettiScontrino = catchAsync(async (req, res, next) => {
  const { clienteId } = req.params;
  const { data, anno, mese } = req.body;

  try {
    if (data) {
      const result = await emettiScontrinoGiornaliero(clienteId, req.user._id, new Date(data));
      res.status(200).json({
        status: 'success',
        messaggio: `Scontrino emesso: ${result.count} corrispettivi per ${data} (€ ${result.totale.toFixed(2)}).`,
        data: result
      });
    } else if (anno && mese) {
      const result = await emettiScontrinoMensile(clienteId, req.user._id, Number(anno), Number(mese));
      res.status(200).json({
        status: 'success',
        messaggio: `${result.giorniTrasmessi} giorni emessi, ${result.giorniErrori} errori.`,
        data: result
      });
    } else {
      return next(new AppError('Specifica una data (data) o un periodo (anno + mese).', 400));
    }
  } catch (err) {
    return next(new AppError(err.message, 400));
  }
});

/**
 * PATCH /api/v1/acube/clienti/:clienteId/abilita
 * Abilita o disabilita A-Cube per un cliente specifico.
 */
exports.abilitaCliente = catchAsync(async (req, res, next) => {
  const { clienteId } = req.params;
  const { enabled } = req.body;

  const cliente = await User.findOne({ _id: clienteId, consulenteId: req.user._id, ruolo: 'cliente' });
  if (!cliente) return next(new AppError('Cliente non trovato.', 404));

  const updated = await User.findByIdAndUpdate(
    clienteId,
    {
      'apiCube.enabled': enabled,
      'apiCube.configuredBy': req.user._id,
      'apiCube.configuredAt': new Date()
    },
    { new: true }
  ).select('apiCube nome cognome');

  res.status(200).json({
    status: 'success',
    data: { apiCube: updated.apiCube }
  });
});
