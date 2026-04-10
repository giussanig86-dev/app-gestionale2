/**
 * SDI TRANSMISSION SERVICE
 * Orchestratore di trasmissione: genera XML → firma XAdES-BES → invia ad AdE → aggiorna DB.
 *
 * Flusso per fatture attive:
 *   FatturaAttiva (DB) → generateFatturaPA → signXml → adeClient.trasmettiFattura → aggiorna DB
 *
 * Flusso per corrispettivi:
 *   Corrispettivo[] (DB) → generateCorrispettiviXml → signXml → adeClient.trasmettiCorrispettivi → aggiorna DB
 */

const User = require('../models/User');
const FatturaAttiva = require('../models/FatturaAttiva');
const Corrispettivo = require('../models/Corrispettivo');
const AdeClient = require('./adeClient');
const { generateFatturaPA } = require('./fatturaPAGenerator');
const { generateCorrispettiviXml, generateCorrispettiviXmlPerMese } = require('./corrispettiviXmlGenerator');
const { signXml } = require('./xmlSigningService');
const { ADE_CERT_PATH, ADE_CERT_PASSWORD } = require('../config/env');

/**
 * Crea un client AdE usando la configurazione del consulente.
 * Usa certPath/certPassword personalizzati del consulente se presenti,
 * altrimenti cade back sulle variabili d'ambiente.
 */
function buildAdeClient(consulente) {
  const certPath = consulente.ade?.certPath || ADE_CERT_PATH;
  const certPassword = consulente.ade?.certPassword || ADE_CERT_PASSWORD;
  return new AdeClient(certPath, certPassword);
}

/**
 * Ottiene certPath e certPassword del consulente per la firma.
 */
function getCertConfig(consulente) {
  return {
    certPath: consulente.ade?.certPath || ADE_CERT_PATH,
    certPassword: consulente.ade?.certPassword || ADE_CERT_PASSWORD
  };
}

// ═══════════════════════════════════════════════════════
//  TRASMISSIONE SINGOLA FATTURA ATTIVA
// ═══════════════════════════════════════════════════════

/**
 * Trasmette una singola FatturaAttiva al SDI tramite API AdE.
 *
 * @param {string|ObjectId} fatturaId    - ID della FatturaAttiva
 * @param {string|ObjectId} consulenteId - ID del consulente (intermediario)
 * @returns {Promise<{ success: boolean, identificativoSdi?: string, errore?: string }>}
 */
async function trasmettiFattura(fatturaId, consulenteId) {
  // 1. Carica fattura, consulente e cliente dal DB
  const fattura = await FatturaAttiva.findById(fatturaId);
  if (!fattura) throw new Error(`Fattura non trovata: ${fatturaId}`);

  if (fattura.sdi?.trasmessa) {
    throw new Error(`La fattura ${fattura.numeroFattura} è già stata trasmessa al SDI.`);
  }

  const consulente = await User.findById(consulenteId);
  if (!consulente) throw new Error('Consulente non trovato.');

  const cliente = await User.findById(fattura.userId);
  if (!cliente) throw new Error('Cliente (cedente) non trovato.');

  // 2. Genera XML FatturaPA
  let xml;
  try {
    xml = generateFatturaPA(fattura, consulente, cliente);
  } catch (err) {
    throw new Error(`Errore generazione XML FatturaPA: ${err.message}`);
  }

  // 3. Firma XAdES-BES
  const { certPath, certPassword } = getCertConfig(consulente);
  let xmlFirmato;
  try {
    xmlFirmato = await signXml(xml, certPath, certPassword);
  } catch (err) {
    throw new Error(`Errore firma XML: ${err.message}`);
  }

  // 4. Invia ad AdE tramite API
  const adeClient = buildAdeClient(consulente);
  let ricevuta;
  try {
    ricevuta = await adeClient.trasmettiFattura(xmlFirmato, cliente.codiceFiscale || cliente.partitaIva);
  } catch (err) {
    const errMsg = err.response?.data?.messaggio || err.message;
    // Aggiorna stato fattura come "errore"
    await FatturaAttiva.findByIdAndUpdate(fatturaId, {
      'sdi.statoTrasmissione': 'errore',
      'sdi.erroreTrasmissione': errMsg
    });
    throw new Error(`Errore trasmissione AdE: ${errMsg}`);
  }

  // 5. Aggiorna FatturaAttiva con i dati ricevuta
  const identificativoSdi = ricevuta?.identificativoSdi || ricevuta?.id || ricevuta?.idFile || '';
  await FatturaAttiva.findByIdAndUpdate(fatturaId, {
    'sdi.trasmessa': true,
    'sdi.dataTrasmissione': new Date(),
    'sdi.identificativoSdi': identificativoSdi,
    'sdi.statoTrasmissione': 'inviata',
    'sdi.erroreTrasmissione': null
  });

  console.log(`[SDI Trasmissione] Fattura ${fattura.numeroFattura} trasmessa. ID SDI: ${identificativoSdi}`);

  return { success: true, identificativoSdi };
}

// ═══════════════════════════════════════════════════════
//  TRASMISSIONE BATCH FATTURE DI UN CLIENTE
// ═══════════════════════════════════════════════════════

/**
 * Trasmette tutte le fatture attive in stato 'bozza' di un cliente.
 *
 * @param {string|ObjectId} clienteId    - ID del cliente (cedente)
 * @param {string|ObjectId} consulenteId - ID del consulente
 * @returns {Promise<{ trasmesse: number, errori: number, dettagli: object[] }>}
 */
async function trasmettiFattureCliente(clienteId, consulenteId) {
  // Verifica autorizzazione: il cliente deve appartenere al consulente
  const cliente = await User.findOne({
    _id: clienteId,
    consulenteId,
    ruolo: 'cliente'
  });
  if (!cliente) throw new Error('Cliente non trovato o non autorizzato.');

  // Trova fatture bozza non ancora trasmesse
  const fatture = await FatturaAttiva.find({
    userId: clienteId,
    stato: 'bozza',
    'sdi.trasmessa': { $ne: true }
  });

  if (fatture.length === 0) {
    return { trasmesse: 0, errori: 0, dettagli: [] };
  }

  const dettagli = [];
  let trasmesse = 0;
  let errori = 0;

  for (const fattura of fatture) {
    try {
      const result = await trasmettiFattura(fattura._id, consulenteId);
      trasmesse++;
      dettagli.push({
        fatturaId: fattura._id,
        numero: fattura.numeroFattura,
        success: true,
        identificativoSdi: result.identificativoSdi
      });
    } catch (err) {
      errori++;
      dettagli.push({
        fatturaId: fattura._id,
        numero: fattura.numeroFattura,
        success: false,
        errore: err.message
      });
    }
  }

  return { trasmesse, errori, dettagli };
}

// ═══════════════════════════════════════════════════════
//  TRASMISSIONE CORRISPETTIVI
// ═══════════════════════════════════════════════════════

/**
 * Trasmette i corrispettivi di una singola giornata per un cliente.
 *
 * @param {string|ObjectId} clienteId    - ID del cliente
 * @param {string|ObjectId} consulenteId - ID del consulente
 * @param {Date|string}     dataContabile - La data della giornata
 * @returns {Promise<{ success: boolean, idTrasmissione?: string, count: number, totale: number }>}
 */
async function trasmettiCorrispettiviGiorno(clienteId, consulenteId, dataContabile) {
  const cliente = await User.findOne({ _id: clienteId, consulenteId, ruolo: 'cliente' });
  if (!cliente) throw new Error('Cliente non trovato o non autorizzato.');

  const data = new Date(dataContabile);
  const inizioGiorno = new Date(data.getFullYear(), data.getMonth(), data.getDate(), 0, 0, 0);
  const fineGiorno = new Date(data.getFullYear(), data.getMonth(), data.getDate(), 23, 59, 59);

  // Carica corrispettivi del giorno non ancora trasmessi
  const corrispettivi = await Corrispettivo.find({
    userId: clienteId,
    data: { $gte: inizioGiorno, $lte: fineGiorno },
    'ade.trasmesso': { $ne: true }
  });

  if (corrispettivi.length === 0) {
    throw new Error('Nessun corrispettivo da trasmettere per questa data.');
  }

  const consulente = await User.findById(consulenteId);
  if (!consulente) throw new Error('Consulente non trovato.');

  // Genera XML
  let xml;
  try {
    xml = generateCorrispettiviXml(corrispettivi, cliente, data);
  } catch (err) {
    throw new Error(`Errore generazione XML corrispettivi: ${err.message}`);
  }

  // Firma
  const { certPath, certPassword } = getCertConfig(consulente);
  let xmlFirmato;
  try {
    xmlFirmato = await signXml(xml, certPath, certPassword);
  } catch (err) {
    throw new Error(`Errore firma XML corrispettivi: ${err.message}`);
  }

  // Trasmetti
  const adeClient = buildAdeClient(consulente);
  let ricevuta;
  try {
    ricevuta = await adeClient.trasmettiCorrispettivi(
      xmlFirmato,
      cliente.codiceFiscale || cliente.partitaIva
    );
  } catch (err) {
    const errMsg = err.response?.data?.messaggio || err.message;
    throw new Error(`Errore trasmissione corrispettivi AdE: ${errMsg}`);
  }

  // Aggiorna i corrispettivi trasmessi
  const idTrasmissione = ricevuta?.idTrasmissione || ricevuta?.id || '';
  const ids = corrispettivi.map((c) => c._id);
  await Corrispettivo.updateMany(
    { _id: { $in: ids } },
    {
      'ade.trasmesso': true,
      'ade.dataTrasmissione': new Date(),
      'ade.idTrasmissione': idTrasmissione
    }
  );

  const totale = corrispettivi.reduce((sum, c) => sum + (parseFloat(c.importo) || 0), 0);

  console.log(`[SDI Corrispettivi] ${corrispettivi.length} corrispettivi del ${data.toLocaleDateString('it-IT')} trasmessi. ID: ${idTrasmissione}`);

  return {
    success: true,
    idTrasmissione,
    count: corrispettivi.length,
    totale
  };
}

/**
 * Trasmette tutti i corrispettivi di un mese per un cliente (una chiamata per giorno).
 *
 * @param {string|ObjectId} clienteId    - ID del cliente
 * @param {string|ObjectId} consulenteId - ID del consulente
 * @param {number}          anno         - Anno (es. 2026)
 * @param {number}          mese         - Mese 1-12
 * @returns {Promise<{ giorniTrasmessi: number, giorniErrori: number, dettagli: object[] }>}
 */
async function trasmettiCorrispettiviMese(clienteId, consulenteId, anno, mese) {
  const cliente = await User.findOne({ _id: clienteId, consulenteId, ruolo: 'cliente' });
  if (!cliente) throw new Error('Cliente non trovato o non autorizzato.');

  const inizioMese = new Date(anno, mese - 1, 1);
  const fineMese = new Date(anno, mese, 0, 23, 59, 59);

  const corrispettivi = await Corrispettivo.find({
    userId: clienteId,
    data: { $gte: inizioMese, $lte: fineMese },
    'ade.trasmesso': { $ne: true }
  });

  if (corrispettivi.length === 0) {
    return { giorniTrasmessi: 0, giorniErrori: 0, dettagli: [] };
  }

  const consulente = await User.findById(consulenteId);
  if (!consulente) throw new Error('Consulente non trovato.');

  const { certPath, certPassword } = getCertConfig(consulente);
  const adeClient = buildAdeClient(consulente);

  // Genera XML per mese (array per giorno)
  const xmlPerGiorno = generateCorrispettiviXmlPerMese(corrispettivi, cliente);

  const dettagli = [];
  let giorniTrasmessi = 0;
  let giorniErrori = 0;

  for (const { data, xml, count, totale } of xmlPerGiorno) {
    // Firma XML del giorno
    let xmlFirmato;
    try {
      xmlFirmato = await signXml(xml, certPath, certPassword);
    } catch (err) {
      giorniErrori++;
      dettagli.push({ data, success: false, errore: `Firma fallita: ${err.message}` });
      continue;
    }

    // Trasmetti giorno
    try {
      const ricevuta = await adeClient.trasmettiCorrispettivi(
        xmlFirmato,
        cliente.codiceFiscale || cliente.partitaIva
      );
      const idTrasmissione = ricevuta?.idTrasmissione || ricevuta?.id || '';

      // Aggiorna corrispettivi del giorno
      const inizioGiorno = new Date(`${data}T00:00:00`);
      const fineGiorno = new Date(`${data}T23:59:59`);
      await Corrispettivo.updateMany(
        {
          userId: clienteId,
          data: { $gte: inizioGiorno, $lte: fineGiorno },
          'ade.trasmesso': { $ne: true }
        },
        {
          'ade.trasmesso': true,
          'ade.dataTrasmissione': new Date(),
          'ade.idTrasmissione': idTrasmissione
        }
      );

      giorniTrasmessi++;
      dettagli.push({ data, success: true, count, totale, idTrasmissione });
    } catch (err) {
      giorniErrori++;
      dettagli.push({ data, success: false, errore: err.response?.data?.messaggio || err.message });
    }
  }

  return { giorniTrasmessi, giorniErrori, dettagli };
}

// ═══════════════════════════════════════════════════════
//  VERIFICA STATO TRASMISSIONE
// ═══════════════════════════════════════════════════════

/**
 * Controlla lo stato di una trasmissione presso AdE.
 * Aggiorna FatturaAttiva se la ricevuta è disponibile.
 *
 * @param {string|ObjectId} fatturaId    - ID della FatturaAttiva
 * @param {string|ObjectId} consulenteId - ID del consulente
 */
async function verificaStatoFattura(fatturaId, consulenteId) {
  const fattura = await FatturaAttiva.findById(fatturaId);
  if (!fattura) throw new Error('Fattura non trovata.');
  if (!fattura.sdi?.identificativoSdi) throw new Error('Fattura non ancora trasmessa.');

  const consulente = await User.findById(consulenteId);
  const adeClient = buildAdeClient(consulente);

  const stato = await adeClient.getStatoTrasmissione(fattura.sdi.identificativoSdi);

  if (stato?.statoAttuale) {
    await FatturaAttiva.findByIdAndUpdate(fatturaId, {
      'sdi.statoTrasmissione': stato.statoAttuale
    });
  }

  return stato;
}

module.exports = {
  trasmettiFattura,
  trasmettiFattureCliente,
  trasmettiCorrispettiviGiorno,
  trasmettiCorrispettiviMese,
  verificaStatoFattura
};
