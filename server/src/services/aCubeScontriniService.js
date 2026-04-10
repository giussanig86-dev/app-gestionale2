/**
 * A-CUBE SCONTRINI SERVICE
 * Orchestratore per l'emissione di documenti commerciali (scontrini)
 * tramite A-Cube Scontrino Elettronico Smart.
 *
 * Flusso:
 * Corrispettivi (DB) → aggrega per giorno → chiama A-Cube API →
 * aggiorna Corrispettivo.ade.trasmesso → ritorna conferma
 */

const User = require('../models/User');
const Corrispettivo = require('../models/Corrispettivo');
const ACubeClient = require('./aCubeClient');

/**
 * Aggrega un array di corrispettivi in importo contante + elettronico.
 */
function aggregaImporti(corrispettivi) {
  let contante = 0;
  let elettronico = 0;
  for (const c of corrispettivi) {
    if (c.metodoPagamento === 'contante') {
      contante += parseFloat(c.importo) || 0;
    } else {
      elettronico += parseFloat(c.importo) || 0;
    }
  }
  return { contante, elettronico, totale: contante + elettronico };
}

/**
 * Emette un documento commerciale A-Cube per i corrispettivi di una giornata.
 * Aggrega tutti gli incassi del giorno in un unico documento commerciale.
 *
 * @param {string|ObjectId} clienteId    - ID del cliente (tassista/NCC)
 * @param {string|ObjectId} consulenteId - ID del consulente
 * @param {Date|string}     dataContabile - Data della giornata
 * @returns {Promise<{ success: boolean, documentId: string, count: number, totale: number }>}
 */
async function emettiScontrinoGiornaliero(clienteId, consulenteId, dataContabile) {
  // Verifica autorizzazione
  const cliente = await User.findOne({ _id: clienteId, consulenteId, ruolo: 'cliente' });
  if (!cliente) throw new Error('Cliente non trovato o non autorizzato.');
  if (!cliente.apiCube?.enabled) throw new Error('A-Cube non abilitato per questo cliente.');

  const data = new Date(dataContabile);
  const inizioGiorno = new Date(data.getFullYear(), data.getMonth(), data.getDate(), 0, 0, 0);
  const fineGiorno   = new Date(data.getFullYear(), data.getMonth(), data.getDate(), 23, 59, 59);

  // Carica corrispettivi del giorno non ancora trasmessi
  const corrispettivi = await Corrispettivo.find({
    userId: clienteId,
    data: { $gte: inizioGiorno, $lte: fineGiorno },
    'ade.trasmesso': { $ne: true }
  });

  if (corrispettivi.length === 0) {
    throw new Error('Nessun corrispettivo da trasmettere per questa data.');
  }

  const { contante, elettronico, totale } = aggregaImporti(corrispettivi);

  // Crea il client A-Cube con il token del cliente
  const aCube = new ACubeClient(null, clienteId);
  await aCube.ensureToken(cliente);

  // Emette il documento commerciale aggregato
  let ricevuta;
  try {
    ricevuta = await aCube.emettiDocumento({
      codiceFiscale: cliente.codiceFiscale || cliente.partitaIva,
      data,
      importoTotale: totale,
      importoContante: contante > 0 ? contante : undefined,
      importoElettronico: elettronico > 0 ? elettronico : undefined,
      descrizione: 'Prestazione di servizi taxi/NCC',
      numeroDocumenti: corrispettivi.length
    });
  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    throw new Error(`Errore A-Cube emissione documento: ${errMsg}`);
  }

  const documentId = ricevuta?.id || ricevuta?.document_id || '';

  // Aggiorna i corrispettivi come trasmessi
  const ids = corrispettivi.map((c) => c._id);
  await Corrispettivo.updateMany(
    { _id: { $in: ids } },
    {
      'ade.trasmesso': true,
      'ade.dataTrasmissione': new Date(),
      'ade.idTrasmissione': documentId
    }
  );

  console.log(`[A-Cube] ${corrispettivi.length} corrispettivi del ${data.toLocaleDateString('it-IT')} → documento ${documentId}`);

  return { success: true, documentId, count: corrispettivi.length, totale };
}

/**
 * Emette documenti commerciali per tutti i giorni di un mese (un documento per giorno).
 *
 * @param {string|ObjectId} clienteId
 * @param {string|ObjectId} consulenteId
 * @param {number}          anno
 * @param {number}          mese - 1-12
 * @returns {Promise<{ giorniTrasmessi: number, giorniErrori: number, dettagli: object[] }>}
 */
async function emettiScontrinoMensile(clienteId, consulenteId, anno, mese) {
  const cliente = await User.findOne({ _id: clienteId, consulenteId, ruolo: 'cliente' });
  if (!cliente) throw new Error('Cliente non trovato o non autorizzato.');
  if (!cliente.apiCube?.enabled) throw new Error('A-Cube non abilitato per questo cliente.');

  const inizioMese = new Date(anno, mese - 1, 1);
  const fineMese   = new Date(anno, mese, 0, 23, 59, 59);

  const corrispettivi = await Corrispettivo.find({
    userId: clienteId,
    data: { $gte: inizioMese, $lte: fineMese },
    'ade.trasmesso': { $ne: true }
  });

  if (corrispettivi.length === 0) {
    return { giorniTrasmessi: 0, giorniErrori: 0, dettagli: [] };
  }

  // Raggruppa per giorno
  const perGiorno = {};
  for (const c of corrispettivi) {
    const key = new Date(c.data).toISOString().slice(0, 10);
    if (!perGiorno[key]) perGiorno[key] = [];
    perGiorno[key].push(c);
  }

  const dettagli = [];
  let giorniTrasmessi = 0;
  let giorniErrori = 0;

  for (const [dataStr] of Object.entries(perGiorno).sort()) {
    try {
      const result = await emettiScontrinoGiornaliero(clienteId, consulenteId, new Date(dataStr));
      giorniTrasmessi++;
      dettagli.push({ data: dataStr, success: true, ...result });
    } catch (err) {
      giorniErrori++;
      dettagli.push({ data: dataStr, success: false, errore: err.message });
    }
  }

  return { giorniTrasmessi, giorniErrori, dettagli };
}

module.exports = { emettiScontrinoGiornaliero, emettiScontrinoMensile };
