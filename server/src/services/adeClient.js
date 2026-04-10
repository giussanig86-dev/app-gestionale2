/**
 * ADE CLIENT
 * Client HTTP con autenticazione mTLS (mutual TLS) verso il portale
 * Fatture e Corrispettivi dell'Agenzia delle Entrate.
 *
 * Documentazione API AdE:
 * https://www.agenziaentrate.gov.it/portale/fatture-e-corrispettivi
 *
 * Autenticazione: certificato digitale PFX/P12 del consulente (intermediario)
 * Le API vengono chiamate per conto dei clienti "in delega" specificando
 * il loro codice fiscale come parametro di query.
 */

const https = require('https');
const fs = require('fs');
const axios = require('axios');
const { ADE_BASE_URL, ADE_CERT_PATH, ADE_CERT_PASSWORD } = require('../config/env');

const formatDate = (date) => {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

class AdeClient {
  /**
   * @param {string} certPath  - Path al file PFX del consulente (opzionale, usa env var se omesso)
   * @param {string} certPassword - Password del PFX (opzionale, usa env var se omessa)
   */
  constructor(certPath, certPassword) {
    const pfxPath = certPath || ADE_CERT_PATH;
    const pfxPass = certPassword || ADE_CERT_PASSWORD;

    if (!pfxPath) {
      throw new Error('Certificato AdE non configurato. Imposta ADE_CERT_PATH nelle variabili ambiente o nella configurazione del consulente.');
    }

    let pfxData;
    try {
      pfxData = fs.readFileSync(pfxPath);
    } catch (err) {
      throw new Error(`Impossibile leggere il certificato AdE da "${pfxPath}": ${err.message}`);
    }

    this.baseUrl = ADE_BASE_URL;
    this.httpsAgent = new https.Agent({
      pfx: pfxData,
      passphrase: pfxPass || '',
      rejectUnauthorized: true
    });

    this.client = axios.create({
      baseURL: this.baseUrl,
      httpsAgent: this.httpsAgent,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Esegue una chiamata GET all'API AdE
   * @param {string} path - Path relativo (es. '/api/v1/consultazione/lista-file')
   * @param {object} params - Parametri query string
   * @returns {Promise<any>}
   */
  async request(path, params = {}) {
    const response = await this.client.get(path, { params });
    return response.data;
  }

  /**
   * Recupera la lista delle fatture ricevute (passive) per un cliente in delega.
   * @param {string} cf - Codice fiscale del cliente
   * @param {Date} dataDal - Data inizio periodo
   * @param {Date} dataAl - Data fine periodo
   */
  async getFattureRicevute(cf, dataDal, dataAl) {
    return this.request('/api/v1/consultazione/lista-file', {
      tipo: 'RICEVUTE',
      cfCessionario: cf,
      dataDal: formatDate(dataDal),
      dataAl: formatDate(dataAl)
    });
  }

  /**
   * Recupera la lista delle fatture trasmesse (attive) per un cliente in delega.
   * @param {string} cf - Codice fiscale del cliente
   * @param {Date} dataDal - Data inizio periodo
   * @param {Date} dataAl - Data fine periodo
   */
  async getFattureTrasmesse(cf, dataDal, dataAl) {
    return this.request('/api/v1/consultazione/lista-file', {
      tipo: 'TRASMESSE',
      cfCedente: cf,
      dataDal: formatDate(dataDal),
      dataAl: formatDate(dataAl)
    });
  }

  /**
   * Scarica il contenuto XML di una fattura tramite il suo ID file SDI.
   * @param {string} idFile - Identificativo file SDI
   * @returns {Promise<string>} - XML grezzo
   */
  async downloadFile(idFile) {
    const response = await this.client.get(`/api/v1/consultazione/file/${idFile}`, {
      headers: { Accept: 'application/octet-stream' },
      responseType: 'arraybuffer'
    });
    return Buffer.from(response.data).toString('utf-8');
  }

  /**
   * Recupera i metadati di un file SDI.
   * @param {string} idFile
   */
  async getMetadatiFile(idFile) {
    return this.request(`/api/v1/consultazione/metadati/${idFile}`);
  }

  /**
   * Recupera la lista dei corrispettivi telematici per un cliente in delega.
   * @param {string} cf - Codice fiscale del cliente
   * @param {Date} dataDal
   * @param {Date} dataAl
   */
  async getCorrispettivi(cf, dataDal, dataAl) {
    return this.request('/api/v1/corrispettivi/lista', {
      cf,
      dataDal: formatDate(dataDal),
      dataAl: formatDate(dataAl)
    });
  }

  /**
   * Scarica il file di un corrispettivo telematico.
   * @param {string} idFile
   * @returns {Promise<string>} - XML grezzo
   */
  async downloadCorrispettivo(idFile) {
    const response = await this.client.get(`/api/v1/corrispettivi/file/${idFile}`, {
      headers: { Accept: 'application/octet-stream' },
      responseType: 'arraybuffer'
    });
    return Buffer.from(response.data).toString('utf-8');
  }

  // ═══════════════════════════════════════════════════════
  //  METODI DI TRASMISSIONE (POST al SDI/AdE)
  // ═══════════════════════════════════════════════════════

  /**
   * Trasmette una FatturaPA firmata al SDI tramite il canale AdE.
   * @param {string} xmlFirmato  - XML FatturaPA con firma XAdES-BES
   * @param {string} cfCedente   - Codice fiscale o PIVA del cedente (tassista)
   * @returns {Promise<{ identificativoSdi: string, statoTrasmissione: string }>}
   */
  async trasmettiFattura(xmlFirmato, cfCedente) {
    const response = await this.client.post(
      '/api/v1/trasmissione/trasmetti',
      xmlFirmato,
      {
        headers: { 'Content-Type': 'application/xml' },
        params: { cfCedente }
      }
    );
    return response.data;
  }

  /**
   * Trasmette corrispettivi giornalieri firmati all'AdE.
   * @param {string} xmlFirmato  - XML corrispettivi con firma XAdES-BES
   * @param {string} cf          - Codice fiscale del soggetto trasmittente
   * @returns {Promise<{ idTrasmissione: string }>}
   */
  async trasmettiCorrispettivi(xmlFirmato, cf) {
    const response = await this.client.post(
      '/api/v1/corrispettivi/trasmetti',
      xmlFirmato,
      {
        headers: { 'Content-Type': 'application/xml' },
        params: { cf }
      }
    );
    return response.data;
  }

  /**
   * Verifica lo stato di una trasmissione precedente (polling ricevuta SDI).
   * @param {string} idTrasmissione - Identificativo restituito dalla trasmissione
   * @returns {Promise<{ statoAttuale: string, dataAggiornamento: string }>}
   */
  async getStatoTrasmissione(idTrasmissione) {
    return this.request(`/api/v1/trasmissione/stato/${idTrasmissione}`);
  }
}

module.exports = AdeClient;
