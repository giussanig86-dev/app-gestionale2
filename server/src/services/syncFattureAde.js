/**
 * SYNC FATTURE ADE
 * Orchestratore per il download automatico di fatture e corrispettivi
 * dal portale Fatture e Corrispettivi dell'Agenzia delle Entrate.
 *
 * Per ogni cliente "in delega" del consulente:
 *   1. Scarica fatture passive (ricevute) → salva come Costo
 *   2. Scarica fatture attive (emesse) → salva come FatturaAttiva
 *   3. Scarica corrispettivi telematici → salva come Corrispettivo
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const Costo = require('../models/Costo');
const FatturaAttiva = require('../models/FatturaAttiva');
const Corrispettivo = require('../models/Corrispettivo');
const SdiSyncLog = require('../models/SdiSyncLog');
const AdeClient = require('./adeClient');
const {
  parseFatturaPassiva,
  parseFatturaAttiva,
  parseCorrispettivo
} = require('./parseFatturaPA');

/**
 * Costruisce la data di inizio sync per un cliente.
 * Priorità: lastSyncAt del cliente → importOnlyAfter del consulente → 30 giorni fa
 */
function getDataDal(cliente, consulente) {
  if (cliente.ade?.lastSyncAt) return cliente.ade.lastSyncAt;
  if (consulente.ade?.importOnlyAfter) return consulente.ade.importOnlyAfter;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return thirtyDaysAgo;
}

/**
 * Processa le fatture passive di un cliente e le salva come Costo.
 * @returns {{ importate: number, duplicate: number, errori: number, syncErrors: Array }}
 */
async function processaFatturePassive(adeClient, cliente, dataDal, dataAl) {
  let importate = 0, duplicate = 0, errori = 0;
  const syncErrors = [];

  let listaFile;
  try {
    const cf = cliente.codiceFiscale;
    listaFile = await adeClient.getFattureRicevute(cf, dataDal, dataAl);
  } catch (err) {
    syncErrors.push({ clienteId: cliente._id, errorMessage: `Errore lista fatture passive: ${err.message}`, timestamp: new Date() });
    return { importate, duplicate, errori: 1, syncErrors };
  }

  const files = listaFile?.files || listaFile?.listaFile || [];
  for (const file of files) {
    const idFile = file.idFile || file.identificativo;
    try {
      const xml = await adeClient.downloadFile(idFile);
      const dati = await parseFatturaPassiva(xml, idFile);
      dati.userId = cliente._id;

      const esistente = await Costo.findOne({ 'sdi.identificativoSdi': idFile });
      if (esistente) {
        duplicate++;
        continue;
      }

      await Costo.create(dati);
      importate++;
    } catch (err) {
      errori++;
      syncErrors.push({
        clienteId: cliente._id,
        identificativoSdi: idFile,
        errorMessage: err.message,
        timestamp: new Date()
      });
    }
  }

  return { importate, duplicate, errori, syncErrors };
}

/**
 * Processa le fatture attive di un cliente e le salva come FatturaAttiva.
 */
async function processaFattureAttive(adeClient, cliente, dataDal, dataAl) {
  let importate = 0, duplicate = 0, errori = 0;
  const syncErrors = [];

  let listaFile;
  try {
    const cf = cliente.codiceFiscale;
    listaFile = await adeClient.getFattureTrasmesse(cf, dataDal, dataAl);
  } catch (err) {
    syncErrors.push({ clienteId: cliente._id, errorMessage: `Errore lista fatture attive: ${err.message}`, timestamp: new Date() });
    return { importate, duplicate, errori: 1, syncErrors };
  }

  const files = listaFile?.files || listaFile?.listaFile || [];
  for (const file of files) {
    const idFile = file.idFile || file.identificativo;
    try {
      const xml = await adeClient.downloadFile(idFile);
      const dati = await parseFatturaAttiva(xml, idFile);
      dati.userId = cliente._id;
      dati.createdBy = cliente.consulenteId;

      const esistente = await FatturaAttiva.findOne({ 'sdi.identificativoSdi': idFile });
      if (esistente) {
        duplicate++;
        continue;
      }

      await FatturaAttiva.create(dati);
      importate++;
    } catch (err) {
      errori++;
      syncErrors.push({
        clienteId: cliente._id,
        identificativoSdi: idFile,
        errorMessage: err.message,
        timestamp: new Date()
      });
    }
  }

  return { importate, duplicate, errori, syncErrors };
}

/**
 * Processa i corrispettivi telematici di un cliente e li salva come Corrispettivo.
 */
async function processaCorrispettivi(adeClient, cliente, dataDal, dataAl) {
  let importate = 0, duplicate = 0, errori = 0;
  const syncErrors = [];

  let lista;
  try {
    const cf = cliente.codiceFiscale;
    lista = await adeClient.getCorrispettivi(cf, dataDal, dataAl);
  } catch (err) {
    syncErrors.push({ clienteId: cliente._id, errorMessage: `Errore lista corrispettivi: ${err.message}`, timestamp: new Date() });
    return { importate, duplicate, errori: 1, syncErrors };
  }

  const files = lista?.files || lista?.listaCorrispettivi || [];
  for (const file of files) {
    const idFile = file.idFile || file.identificativo;
    const identificativo = file.identificativo || idFile;
    try {
      const esistente = await Corrispettivo.findOne({ 'ade.idFile': idFile });
      if (esistente) {
        duplicate++;
        continue;
      }

      const xml = await adeClient.downloadCorrispettivo(idFile);
      const dati = await parseCorrispettivo(xml, idFile, identificativo);
      dati.userId = cliente._id;

      await Corrispettivo.create(dati);
      importate++;
    } catch (err) {
      errori++;
      syncErrors.push({
        clienteId: cliente._id,
        identificativoSdi: idFile,
        errorMessage: err.message,
        timestamp: new Date()
      });
    }
  }

  return { importate, duplicate, errori, syncErrors };
}

// ============ API PUBBLICA ============

/**
 * Sincronizza tutti i clienti in delega di un consulente.
 * @param {string|ObjectId} consulenteId
 * @returns {Promise<object>} - Riepilogo sync { fattureImportate, fattureDuplicate, fattureErrori, logId }
 */
async function syncAllClientiPerConsulente(consulenteId) {
  const consulente = await User.findById(consulenteId);
  if (!consulente) throw new Error('Consulente non trovato');
  if (!consulente.ade?.enabled) throw new Error('Integrazione AdE non abilitata per questo consulente');

  const clienti = await User.find({
    consulenteId,
    ruolo: 'cliente',
    accountSospeso: false,
    'ade.inDelega': true
  });

  if (clienti.length === 0) {
    return { fattureImportate: 0, fattureDuplicate: 0, fattureErrori: 0, clientiSincronizzati: 0 };
  }

  // Crea log sync
  const log = await SdiSyncLog.create({
    userId: consulenteId,
    consulenteId,
    source: 'ade',
    tipoDocumenti: ['fatture_passive', 'fatture_attive', 'corrispettivi'],
    syncStartedAt: new Date(),
    status: 'in_progress',
    fattureScaricare: clienti.length
  });

  const adeClient = new AdeClient(
    consulente.ade?.certPath || null,
    consulente.ade?.certPassword || null
  );

  const dataAl = new Date();
  let totImportate = 0, totDuplicate = 0, totErrori = 0;
  const allErrors = [];

  for (const cliente of clienti) {
    const dataDal = getDataDal(cliente, consulente);

    const [passive, attive, corrispettivi] = await Promise.allSettled([
      processaFatturePassive(adeClient, cliente, dataDal, dataAl),
      processaFattureAttive(adeClient, cliente, dataDal, dataAl),
      processaCorrispettivi(adeClient, cliente, dataDal, dataAl)
    ]);

    for (const result of [passive, attive, corrispettivi]) {
      if (result.status === 'fulfilled') {
        totImportate += result.value.importate;
        totDuplicate += result.value.duplicate;
        totErrori += result.value.errori;
        allErrors.push(...result.value.syncErrors);
      } else {
        totErrori++;
        allErrors.push({ clienteId: cliente._id, errorMessage: result.reason?.message, timestamp: new Date() });
      }
    }

    // Aggiorna lastSyncAt del cliente
    await User.findByIdAndUpdate(cliente._id, { 'ade.lastSyncAt': new Date() });
  }

  // Aggiorna log
  await SdiSyncLog.findByIdAndUpdate(log._id, {
    status: 'completed',
    syncCompletedAt: new Date(),
    fattureImportate: totImportate,
    fattureDuplicate: totDuplicate,
    fattureErrori: totErrori,
    syncErrors: allErrors.slice(0, 100) // limite per non appesantire il documento
  });

  // Aggiorna lastSyncAt del consulente
  await User.findByIdAndUpdate(consulenteId, { 'ade.lastSyncAt': new Date() });

  return {
    logId: log._id,
    fattureImportate: totImportate,
    fattureDuplicate: totDuplicate,
    fattureErrori: totErrori,
    clientiSincronizzati: clienti.length
  };
}

/**
 * Sincronizza un singolo cliente in delega.
 * @param {string|ObjectId} consulenteId
 * @param {string|ObjectId} clienteId
 * @returns {Promise<object>}
 */
async function syncClienteById(consulenteId, clienteId) {
  const consulente = await User.findById(consulenteId);
  if (!consulente) throw new Error('Consulente non trovato');
  if (!consulente.ade?.enabled) throw new Error('Integrazione AdE non abilitata per questo consulente');

  const cliente = await User.findOne({
    _id: clienteId,
    consulenteId,
    ruolo: 'cliente',
    accountSospeso: false,
    'ade.inDelega': true
  });
  if (!cliente) throw new Error('Cliente non trovato o non in delega');

  const log = await SdiSyncLog.create({
    userId: consulenteId,
    consulenteId,
    clienteId: cliente._id,
    source: 'ade',
    tipoDocumenti: ['fatture_passive', 'fatture_attive', 'corrispettivi'],
    syncStartedAt: new Date(),
    status: 'in_progress',
    fattureScaricare: 1
  });

  const adeClient = new AdeClient(
    consulente.ade?.certPath || null,
    consulente.ade?.certPassword || null
  );

  const dataDal = getDataDal(cliente, consulente);
  const dataAl = new Date();

  const [passive, attive, corrispettivi] = await Promise.allSettled([
    processaFatturePassive(adeClient, cliente, dataDal, dataAl),
    processaFattureAttive(adeClient, cliente, dataDal, dataAl),
    processaCorrispettivi(adeClient, cliente, dataDal, dataAl)
  ]);

  let totImportate = 0, totDuplicate = 0, totErrori = 0;
  const allErrors = [];

  for (const result of [passive, attive, corrispettivi]) {
    if (result.status === 'fulfilled') {
      totImportate += result.value.importate;
      totDuplicate += result.value.duplicate;
      totErrori += result.value.errori;
      allErrors.push(...result.value.syncErrors);
    } else {
      totErrori++;
      allErrors.push({ clienteId: cliente._id, errorMessage: result.reason?.message, timestamp: new Date() });
    }
  }

  await SdiSyncLog.findByIdAndUpdate(log._id, {
    status: 'completed',
    syncCompletedAt: new Date(),
    fattureImportate: totImportate,
    fattureDuplicate: totDuplicate,
    fattureErrori: totErrori,
    syncErrors: allErrors
  });

  await User.findByIdAndUpdate(cliente._id, { 'ade.lastSyncAt': new Date() });

  return {
    logId: log._id,
    fattureImportate: totImportate,
    fattureDuplicate: totDuplicate,
    fattureErrori: totErrori,
    clientiSincronizzati: 1
  };
}

module.exports = {
  syncAllClientiPerConsulente,
  syncClienteById
};
