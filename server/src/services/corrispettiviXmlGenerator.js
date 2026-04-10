/**
 * CORRISPETTIVI XML GENERATOR
 * Genera l'XML nel formato CorrispettiviType per la trasmissione
 * all'Agenzia delle Entrate tramite API.
 *
 * Spec: https://www.agenziaentrate.gov.it/portale/corrispettivi-telematici
 * Schema: CorrispettiviType_1.0.xsd
 *
 * Struttura: un file per giornata contabile, aggregazione dei corrispettivi
 * del giorno suddivisi per metodo di pagamento.
 */

const { create } = require('xmlbuilder2');

const fmtDate = (d) => {
  const date = new Date(d);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const fmtNum = (n) => (parseFloat(n) || 0).toFixed(2);

/**
 * Aggrega i corrispettivi per metodo di pagamento.
 * Restituisce { contante, elettronico, totale }.
 */
function aggregaPerMetodo(corrispettivi) {
  let contante = 0;
  let elettronico = 0;

  for (const c of corrispettivi) {
    if (c.metodoPagamento === 'contante') {
      contante += parseFloat(c.importo) || 0;
    } else {
      // carta, pos, bonifico → pagamento elettronico
      elettronico += parseFloat(c.importo) || 0;
    }
  }

  return {
    contante,
    elettronico,
    totale: contante + elettronico
  };
}

/**
 * Genera l'XML RegistroCorrispettivi per una singola giornata contabile.
 *
 * @param {object[]} corrispettivi - Array di record Corrispettivo della stessa giornata
 * @param {object}   cliente       - Record User del cliente (il tassista)
 * @param {Date}     dataContabile - La data della giornata da trasmettere
 * @returns {string} - XML come stringa UTF-8
 */
function generateCorrispettiviXml(corrispettivi, cliente, dataContabile) {
  if (!corrispettivi || corrispettivi.length === 0) {
    throw new Error('Nessun corrispettivo da trasmettere per la data indicata.');
  }

  const data = new Date(dataContabile);
  const anno = data.getFullYear();
  const cf = cliente.codiceFiscale || '';

  if (!cf) {
    throw new Error('Codice fiscale del cliente mancante.');
  }

  const { contante, elettronico, totale } = aggregaPerMetodo(corrispettivi);

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('RegistroCorrispettivi', {
      xmlns: 'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/corrispettivi/v1.0',
      'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      'xsi:schemaLocation': 'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/corrispettivi/v1.0',
      versione: '1.0'
    });

  // Intestazione: dati del soggetto trasmittente (il tassista)
  const intestazione = doc.ele('Intestazione');
  intestazione.ele('PeriodoImposta').txt(String(anno));
  intestazione.ele('CF').txt(cf);
  if (cliente.partitaIva) {
    intestazione.ele('PIVA').txt(cliente.partitaIva);
  }
  intestazione.ele('Denominazione').txt(
    `${cliente.nome || ''} ${cliente.cognome || ''}`.trim() || 'N/D'
  );

  // Dati giornata contabile
  const dati = doc.ele('Dati');
  dati.ele('DataContabile').txt(fmtDate(data));
  dati.ele('TotaleDocumentiEmessi').txt(String(corrispettivi.length));
  dati.ele('ImportoTotale').txt(fmtNum(totale));

  if (contante > 0) {
    dati.ele('ImportoContante').txt(fmtNum(contante));
  }
  if (elettronico > 0) {
    dati.ele('ImportoElettronico').txt(fmtNum(elettronico));
  }

  // Dettaglio per metodo (opzionale ma utile per riconciliazione)
  const breakdownMetodi = {};
  for (const c of corrispettivi) {
    const mp = c.metodoPagamento || 'contante';
    breakdownMetodi[mp] = (breakdownMetodi[mp] || 0) + (parseFloat(c.importo) || 0);
  }

  const dettaglio = dati.ele('DettaglioMetodiPagamento');
  for (const [mp, importo] of Object.entries(breakdownMetodi)) {
    const item = dettaglio.ele('Metodo');
    item.ele('Tipo').txt(mp);
    item.ele('Importo').txt(fmtNum(importo));
  }

  return doc.end({ prettyPrint: false });
}

/**
 * Genera XML corrispettivi per un intero mese (un file per giornata).
 * Restituisce un array di { data, xml } per ogni giorno con corrispettivi.
 *
 * @param {object[]} corrispettivi - Tutti i corrispettivi del mese
 * @param {object}   cliente       - Record User del cliente
 * @returns {{ data: string, xml: string, count: number, totale: number }[]}
 */
function generateCorrispettiviXmlPerMese(corrispettivi, cliente) {
  // Raggruppa per data (YYYY-MM-DD)
  const perGiorno = {};
  for (const c of corrispettivi) {
    const key = fmtDate(new Date(c.data));
    if (!perGiorno[key]) perGiorno[key] = [];
    perGiorno[key].push(c);
  }

  const risultati = [];
  for (const [dataStr, corrGiorno] of Object.entries(perGiorno).sort()) {
    const { totale } = aggregaPerMetodo(corrGiorno);
    const xml = generateCorrispettiviXml(corrGiorno, cliente, new Date(dataStr));
    risultati.push({
      data: dataStr,
      xml,
      count: corrGiorno.length,
      totale
    });
  }

  return risultati;
}

module.exports = { generateCorrispettiviXml, generateCorrispettiviXmlPerMese };
