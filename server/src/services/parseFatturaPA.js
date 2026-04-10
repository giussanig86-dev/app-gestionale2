/**
 * PARSER FATTURA PA (XML)
 * Parsing dell'XML FatturaPA (formato standard AdE/SDI) verso oggetti JS
 * pronti per il salvataggio nei modelli Costo, FatturaAttiva e Corrispettivo.
 *
 * Spec: https://www.fatturapa.gov.it/it/norme-e-regole/documentazione-allegata/specifiche-tecniche/
 */

const xml2js = require('xml2js');

const parser = new xml2js.Parser({
  explicitArray: false,
  ignoreAttrs: false,
  mergeAttrs: true,
  trim: true
});

/**
 * Converte una stringa XML in oggetto JS.
 * @param {string} xml
 * @returns {Promise<object>}
 */
async function parseXml(xml) {
  return parser.parseStringPromise(xml);
}

/**
 * Estrae un valore annidato in modo sicuro (evita eccezioni su undefined).
 */
const get = (obj, ...keys) => {
  let current = obj;
  for (const key of keys) {
    if (current == null) return undefined;
    current = current[key];
  }
  return current;
};

/**
 * Converte un numero in formato stringa italiana (es. "1.234,56") in float.
 */
const parseNum = (val) => {
  if (val == null) return 0;
  return parseFloat(String(val).replace(',', '.')) || 0;
};

/**
 * Converte una data in formato "YYYY-MM-DD" in Date.
 */
const parseDate = (val) => {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Normalizza un array anche se xml2js ha restituito un singolo oggetto.
 */
const toArray = (val) => {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
};

// ============ FATTURA PASSIVA (ricevuta) ============

/**
 * Parsa un XML FatturaPA e restituisce i dati per creare un record Costo.
 * @param {string} xml - XML FatturaPA grezzo
 * @param {string} identificativoSdi - ID assegnato dall'SDI (es. "IT01234567890_00001.xml")
 * @returns {Promise<object>} - Oggetto compatibile con il modello Costo
 */
async function parseFatturaPassiva(xml, identificativoSdi) {
  const doc = await parseXml(xml);
  const root = doc['p:FatturaElettronica'] || doc['FatturaElettronica'] || doc;

  const header = get(root, 'FatturaElettronicaHeader') || {};
  const body = toArray(get(root, 'FatturaElettronicaBody'))[0] || {};

  const cedente = get(header, 'CedentePrestatore') || {};
  const datiAnagrafici = get(cedente, 'DatiAnagrafici') || {};
  const anagrafica = get(datiAnagrafici, 'Anagrafica') || {};
  const sede = get(cedente, 'Sede') || {};
  const idFiscale = get(datiAnagrafici, 'IdFiscaleIVA') || {};

  const datiGenerali = get(body, 'DatiGenerali') || {};
  const datiDoc = get(datiGenerali, 'DatiGeneraliDocumento') || {};
  const riepilogo = toArray(get(body, 'DatiBeniServizi', 'DatiRiepilogo'));

  const imponibile = riepilogo.reduce((acc, r) => acc + parseNum(r.ImponibileImporto), 0);
  const iva = riepilogo.reduce((acc, r) => acc + parseNum(r.Imposta), 0);
  const totale = parseNum(get(datiDoc, 'ImportoTotaleDocumento')) || (imponibile + iva);

  const indirizzo = [get(sede, 'Indirizzo'), get(sede, 'Comune'), get(sede, 'Provincia')]
    .filter(Boolean).join(', ');

  return {
    tipoCosto: 'fattura_passiva',
    data: parseDate(get(datiDoc, 'Data')) || new Date(),
    importo: totale,
    categoria: 'altro',
    descrizione: get(datiDoc, 'Causale') || `Fattura n. ${get(datiDoc, 'Numero') || ''}`,
    competenzaAnno: (parseDate(get(datiDoc, 'Data')) || new Date()).getFullYear(),
    insertMode: 'ade',
    approvato: false,
    sdi: {
      isFatturaElettronica: true,
      numeroFattura: get(datiDoc, 'Numero') || '',
      dataFattura: parseDate(get(datiDoc, 'Data')),
      fornitore: {
        denominazione: get(anagrafica, 'Denominazione') ||
          `${get(anagrafica, 'Nome') || ''} ${get(anagrafica, 'Cognome') || ''}`.trim(),
        partitaIva: get(idFiscale, 'IdCodice') || '',
        codiceFiscale: get(datiAnagrafici, 'CodiceFiscale') || '',
        indirizzo
      },
      identificativoSdi,
      imponibile,
      iva,
      totaleDocumento: totale,
      causale: get(datiDoc, 'Causale') || '',
      importedAt: new Date(),
      importedFrom: 'cassetto_fiscale'
    }
  };
}

// ============ FATTURA ATTIVA (emessa) ============

/**
 * Parsa un XML FatturaPA e restituisce i dati per creare un record FatturaAttiva.
 * @param {string} xml - XML FatturaPA grezzo
 * @param {string} identificativoSdi
 * @returns {Promise<object>}
 */
async function parseFatturaAttiva(xml, identificativoSdi) {
  const doc = await parseXml(xml);
  const root = doc['p:FatturaElettronica'] || doc['FatturaElettronica'] || doc;

  const header = get(root, 'FatturaElettronicaHeader') || {};
  const body = toArray(get(root, 'FatturaElettronicaBody'))[0] || {};

  const cessionario = get(header, 'CessionarioCommittente') || {};
  const datiAnagCess = get(cessionario, 'DatiAnagrafici') || {};
  const anagraficaCess = get(datiAnagCess, 'Anagrafica') || {};
  const sedeCess = get(cessionario, 'Sede') || {};
  const idFiscaleCess = get(datiAnagCess, 'IdFiscaleIVA') || {};

  const datiTrasmissione = get(header, 'DatiTrasmissione') || {};
  const datiGenerali = get(body, 'DatiGenerali') || {};
  const datiDoc = get(datiGenerali, 'DatiGeneraliDocumento') || {};
  const riepilogo = toArray(get(body, 'DatiBeniServizi', 'DatiRiepilogo'));

  const imponibile = riepilogo.reduce((acc, r) => acc + parseNum(r.ImponibileImporto), 0);
  const iva = riepilogo.reduce((acc, r) => acc + parseNum(r.Imposta), 0);
  const totale = parseNum(get(datiDoc, 'ImportoTotaleDocumento')) || (imponibile + iva);

  const denominazioneCess = get(anagraficaCess, 'Denominazione') ||
    `${get(anagraficaCess, 'Nome') || ''} ${get(anagraficaCess, 'Cognome') || ''}`.trim();

  const codiceSdi = get(datiTrasmissione, 'CodiceDestinatario') || '';
  const tipo = get(idFiscaleCess, 'IdCodice') ? 'azienda' : 'privato';

  return {
    numeroFattura: get(datiDoc, 'Numero') || identificativoSdi,
    dataEmissione: parseDate(get(datiDoc, 'Data')) || new Date(),
    imponibile,
    iva,
    totale,
    descrizione: get(datiDoc, 'Causale') || '',
    insertMode: 'ade',
    cliente: {
      tipo,
      denominazione: tipo === 'azienda' ? denominazioneCess : undefined,
      nome: tipo === 'privato' ? get(anagraficaCess, 'Nome') : undefined,
      cognome: tipo === 'privato' ? get(anagraficaCess, 'Cognome') : undefined,
      partitaIva: get(idFiscaleCess, 'IdCodice') || undefined,
      codiceFiscale: get(datiAnagCess, 'CodiceFiscale') || undefined,
      indirizzo: get(sedeCess, 'Indirizzo') || undefined,
      cap: get(sedeCess, 'CAP') || undefined,
      citta: get(sedeCess, 'Comune') || undefined,
      provincia: get(sedeCess, 'Provincia') || undefined,
      codiceSdi: codiceSdi.length === 7 ? codiceSdi : undefined
    },
    sdi: {
      trasmessa: true,
      identificativoSdi,
      progressivoInvio: get(datiTrasmissione, 'ProgressivoInvio') || '',
      statoTrasmissione: 'consegnata',
      dataTrasmissione: new Date()
    }
  };
}

// ============ CORRISPETTIVO ============

/**
 * Parsa un XML di corrispettivo telematico AdE.
 * @param {string} xml - XML grezzo
 * @param {string} idFile - ID file AdE
 * @param {string} identificativo - Identificativo corrispettivo
 * @returns {Promise<object>}
 */
async function parseCorrispettivo(xml, idFile, identificativo) {
  const doc = await parseXml(xml);
  // La struttura dei corrispettivi telematici è diversa dalla FatturaPA
  // Cerchiamo i campi principali nei nodi comuni
  const root = doc['DatiiRT'] || doc['DatiRT'] || doc['Corrispettivi'] || doc || {};

  const datiVendita = get(root, 'DatiVendita') || get(root, 'DatiCorrispettivi') || {};
  const totale = parseNum(get(datiVendita, 'TotaleImporto') || get(root, 'Totale') || 0);
  const data = parseDate(get(datiVendita, 'DataOraOperazione') || get(root, 'DataOperazione'));

  let metodoPagamento = 'contante';
  const metodoPag = String(get(datiVendita, 'TipoPagamento') || '').toLowerCase();
  if (metodoPag.includes('carta') || metodoPag.includes('pos') || metodoPag.includes('elettroni')) {
    metodoPagamento = 'carta';
  } else if (metodoPag.includes('bonifico')) {
    metodoPagamento = 'bonifico';
  }

  return {
    data: data || new Date(),
    importo: totale || 0,
    metodoPagamento,
    descrizione: `Corrispettivo telematico AdE - ${identificativo || idFile}`,
    insertMode: 'ade',
    verificato: true,
    ade: {
      idFile,
      identificativo,
      importedAt: new Date()
    }
  };
}

module.exports = {
  parseFatturaPassiva,
  parseFatturaAttiva,
  parseCorrispettivo
};
