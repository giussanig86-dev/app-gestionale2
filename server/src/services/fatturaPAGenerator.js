/**
 * FATTURA PA GENERATOR
 * Genera l'XML FatturaPA (formato standard SDI, versione FPR12)
 * a partire da un record FatturaAttiva del DB.
 *
 * Spec: https://www.fatturapa.gov.it/it/norme-e-regole/documentazione-allegata/specifiche-tecniche/
 * Schema: FatturaPA_versione1.2.2.xsd
 */

const { create } = require('xmlbuilder2');

/**
 * Formatta una data in YYYY-MM-DD per FatturaPA.
 */
const fmtDate = (d) => {
  const date = new Date(d);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

/**
 * Formatta un importo con 2 decimali (es. 1234.56).
 */
const fmtNum = (n) => (parseFloat(n) || 0).toFixed(2);

/**
 * Mappa il metodo di pagamento dell'app al codice FatturaPA.
 * Ref: Tabella "ModalitaPagamento" specifiche AdE
 */
const mapMetodoPagamento = (metodo) => {
  const map = {
    bonifico: 'MP05',
    contante: 'MP01',
    carta: 'MP08',
    altro: 'MP22'
  };
  return map[metodo] || 'MP05';
};

/**
 * Genera l'XML FatturaPA completo per una fattura attiva.
 *
 * @param {object} fattura - Record FatturaAttiva da MongoDB (con getter decrypt applicati)
 * @param {object} consulente - Record User del consulente (intermediario/trasmittente)
 * @param {object} cliente - Record User del cliente (cedente/prestatore, il tassista)
 * @returns {string} - XML FatturaPA come stringa UTF-8
 */
function generateFatturaPA(fattura, consulente, cliente) {
  // Progressivo invio: numero fattura formattato (max 10 char alfanumerici)
  const progressivoInvio = String(fattura.numeroFattura).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).padStart(5, '0');

  // Codice destinatario: 7 char (0000000 per privati/consumatori finali)
  const codiceDestinatario = fattura.cliente?.codiceSdi || '0000000';

  // CF/PIVA del cliente (cedente = il tassista che emette la fattura)
  const cfCliente = cliente.codiceFiscale || '';
  const pivaCliente = cliente.partitaIva || '';

  // Aliquota IVA: se importo IVA = 0 assume regime forfettario (fuori campo IVA)
  const aliquotaIVA = fattura.iva > 0 ? fmtNum((fattura.iva / fattura.imponibile) * 100) : '0.00';
  const naturaIVA = fattura.iva === 0 ? 'N2.2' : null; // N2.2 = fuori campo IVA (regime forfettario)

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('p:FatturaElettronica', {
      'xmlns:p': 'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2',
      'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
      'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      'xsi:schemaLocation': 'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2/Schema_del_file_xml_FatturaPA_versione_1.2.xsd',
      versione: 'FPR12'
    });

  // ── HEADER ─────────────────────────────────────────────────────────
  const header = doc.ele('FatturaElettronicaHeader');

  // DatiTrasmissione
  const datiTrasmissione = header.ele('DatiTrasmissione');
  const idTrasmittente = datiTrasmissione.ele('IdTrasmittente');
  idTrasmittente.ele('IdPaese').txt('IT');
  idTrasmittente.ele('IdCodice').txt(
    (consulente.codiceFiscale || consulente.partitaIva || '').slice(0, 16)
  );
  datiTrasmissione.ele('ProgressivoInvio').txt(progressivoInvio);
  datiTrasmissione.ele('FormatoTrasmissione').txt('FPR12');
  datiTrasmissione.ele('CodiceDestinatario').txt(codiceDestinatario);
  if (fattura.cliente?.pec && codiceDestinatario === '0000000') {
    datiTrasmissione.ele('PECDestinatario').txt(fattura.cliente.pec);
  }

  // CedentePrestatore (il tassista / cliente dell'app)
  const cedente = header.ele('CedentePrestatore');
  const datiAnagCed = cedente.ele('DatiAnagrafici');
  if (pivaCliente) {
    const idFiscale = datiAnagCed.ele('IdFiscaleIVA');
    idFiscale.ele('IdPaese').txt('IT');
    idFiscale.ele('IdCodice').txt(pivaCliente);
  }
  if (cfCliente) {
    datiAnagCed.ele('CodiceFiscale').txt(cfCliente);
  }
  const anagCed = datiAnagCed.ele('Anagrafica');
  anagCed.ele('Denominazione').txt(
    `${cliente.nome || ''} ${cliente.cognome || ''}`.trim() || 'N/D'
  );
  datiAnagCed.ele('RegimeFiscale').txt(
    cliente.regimeFiscale === 'ordinario' ? 'RF01' : 'RF19' // RF19 = regime forfettario
  );
  const sedeCed = cedente.ele('Sede');
  sedeCed.ele('Indirizzo').txt(cliente.indirizzo?.via || 'Via non specificata');
  sedeCed.ele('CAP').txt(cliente.indirizzo?.cap || '00000');
  sedeCed.ele('Comune').txt(cliente.indirizzo?.comune || 'N/D');
  if (cliente.indirizzo?.provincia) {
    sedeCed.ele('Provincia').txt(cliente.indirizzo.provincia.slice(0, 2).toUpperCase());
  }
  sedeCed.ele('Nazione').txt('IT');

  // CessionarioCommittente (destinatario della fattura)
  const cessionario = header.ele('CessionarioCommittente');
  const datiAnagCess = cessionario.ele('DatiAnagrafici');
  if (fattura.cliente?.partitaIva) {
    const idFiscaleCess = datiAnagCess.ele('IdFiscaleIVA');
    idFiscaleCess.ele('IdPaese').txt('IT');
    idFiscaleCess.ele('IdCodice').txt(fattura.cliente.partitaIva);
  }
  if (fattura.cliente?.codiceFiscale) {
    datiAnagCess.ele('CodiceFiscale').txt(fattura.cliente.codiceFiscale);
  }
  const anagCess = datiAnagCess.ele('Anagrafica');
  if (fattura.cliente?.tipo === 'azienda' || fattura.cliente?.tipo === 'pa') {
    anagCess.ele('Denominazione').txt(fattura.cliente.denominazione || 'N/D');
  } else {
    anagCess.ele('Nome').txt(fattura.cliente?.nome || 'N/D');
    anagCess.ele('Cognome').txt(fattura.cliente?.cognome || 'N/D');
  }
  const sedeCess = cessionario.ele('Sede');
  sedeCess.ele('Indirizzo').txt(fattura.cliente?.indirizzo || 'N/D');
  sedeCess.ele('CAP').txt(fattura.cliente?.cap || '00000');
  sedeCess.ele('Comune').txt(fattura.cliente?.citta || 'N/D');
  if (fattura.cliente?.provincia) {
    sedeCess.ele('Provincia').txt(fattura.cliente.provincia.slice(0, 2).toUpperCase());
  }
  sedeCess.ele('Nazione').txt('IT');

  // ── BODY ───────────────────────────────────────────────────────────
  const body = doc.ele('FatturaElettronicaBody');

  // DatiGenerali
  const datiGenerali = body.ele('DatiGenerali');
  const datiDoc = datiGenerali.ele('DatiGeneraliDocumento');
  datiDoc.ele('TipoDocumento').txt('TD01'); // TD01 = fattura
  datiDoc.ele('Divisa').txt('EUR');
  datiDoc.ele('Data').txt(fmtDate(fattura.dataEmissione));
  datiDoc.ele('Numero').txt(String(fattura.numeroFattura));
  datiDoc.ele('ImportoTotaleDocumento').txt(fmtNum(fattura.totale));
  if (fattura.descrizione) {
    datiDoc.ele('Causale').txt(fattura.descrizione.slice(0, 200));
  }

  // DatiBeniServizi
  const datiBeni = body.ele('DatiBeniServizi');

  // Riga dettaglio
  const dettaglio = datiBeni.ele('DettaglioLinee');
  dettaglio.ele('NumeroLinea').txt('1');
  dettaglio.ele('Descrizione').txt(
    fattura.descrizione || 'Prestazione di servizi taxi'
  );
  dettaglio.ele('Quantita').txt('1.00');
  dettaglio.ele('PrezzoUnitario').txt(fmtNum(fattura.imponibile));
  dettaglio.ele('PrezzoTotale').txt(fmtNum(fattura.imponibile));
  dettaglio.ele('AliquotaIVA').txt(aliquotaIVA);
  if (naturaIVA) {
    dettaglio.ele('Natura').txt(naturaIVA);
  }

  // Riepilogo IVA
  const riepilogo = datiBeni.ele('DatiRiepilogo');
  riepilogo.ele('AliquotaIVA').txt(aliquotaIVA);
  if (naturaIVA) {
    riepilogo.ele('Natura').txt(naturaIVA);
    riepilogo.ele('RiferimentoNormativo').txt(
      'Regime forfettario ex art. 1, cc. 54-89, L. 190/2014'
    );
  }
  riepilogo.ele('ImponibileImporto').txt(fmtNum(fattura.imponibile));
  riepilogo.ele('Imposta').txt(fmtNum(fattura.iva));

  // DatiPagamento
  if (fattura.metodoPagamento || fattura.dataScadenza) {
    const datiPag = body.ele('DatiPagamento');
    datiPag.ele('CondizioniPagamento').txt('TP02'); // TP02 = pagamento completo
    const detPag = datiPag.ele('DettaglioPagamento');
    detPag.ele('ModalitaPagamento').txt(mapMetodoPagamento(fattura.metodoPagamento));
    if (fattura.dataScadenza) {
      detPag.ele('DataScadenzaPagamento').txt(fmtDate(fattura.dataScadenza));
    }
    detPag.ele('ImportoPagamento').txt(fmtNum(fattura.totale));
  }

  return doc.end({ prettyPrint: false });
}

module.exports = { generateFatturaPA };
