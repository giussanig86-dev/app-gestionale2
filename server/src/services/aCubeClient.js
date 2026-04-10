/**
 * A-CUBE CLIENT
 * Client HTTP OAuth2 per le API A-Cube (apicube.it).
 * Gestisce il token OAuth2 (client credentials o per-utente) e le chiamate
 * al servizio "Scontrino Elettronico Smart" per l'emissione di documenti
 * commerciali all'Agenzia delle Entrate per soggetti esonerati da fattura.
 *
 * Documentazione A-Cube: https://docs.acube.it
 * Prodotto: Scontrino Elettronico Smart (documento commerciale)
 *
 * Nota sugli endpoint: i path esatti sono indicativi basati sulla struttura
 * REST standard A-Cube. Verificare con la documentazione ufficiale prima
 * di andare in produzione.
 */

const axios = require('axios');
const User = require('../models/User');
const { APICUBE_CLIENT_ID, APICUBE_CLIENT_SECRET, APICUBE_BASE_URL } = require('../config/env');

const fmtDate = (d) => {
  const date = new Date(d);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

class ACubeClient {
  /**
   * @param {string} [accessToken]  - Token OAuth2 (opzionale; se omesso usa env vars)
   * @param {string} [userId]       - ID utente nel DB (per aggiornare il token al rinnovo)
   */
  constructor(accessToken, userId) {
    this.baseUrl = APICUBE_BASE_URL;
    this.accessToken = accessToken || null;
    this.userId = userId || null;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });

    // Interceptor: aggiunge Bearer token e gestisce rinnovo automatico
    this.client.interceptors.request.use((config) => {
      if (this.accessToken) {
        config.headers['Authorization'] = `Bearer ${this.accessToken}`;
      }
      return config;
    });
  }

  // ═══════════════════════════════════════════════════════
  //  AUTENTICAZIONE OAuth2
  // ═══════════════════════════════════════════════════════

  /**
   * Ottiene un access token con le credenziali di sistema (client credentials grant).
   * Usato per operazioni a livello di consulente/piattaforma.
   *
   * @returns {Promise<{ access_token: string, expires_in: number }>}
   */
  async getSystemToken() {
    const res = await axios.post(`${this.baseUrl}/oauth/token`, {
      grant_type: 'client_credentials',
      client_id: APICUBE_CLIENT_ID,
      client_secret: APICUBE_CLIENT_SECRET
    });
    this.accessToken = res.data.access_token;
    return res.data;
  }

  /**
   * Rinnova il token usando il refresh_token.
   * Se `userId` è impostato, aggiorna i token nel DB.
   *
   * @param {string} refreshToken
   * @returns {Promise<{ access_token: string, refresh_token: string, expires_in: number }>}
   */
  async refreshAccessToken(refreshToken) {
    const res = await axios.post(`${this.baseUrl}/oauth/token`, {
      grant_type: 'refresh_token',
      client_id: APICUBE_CLIENT_ID,
      client_secret: APICUBE_CLIENT_SECRET,
      refresh_token: refreshToken
    });

    this.accessToken = res.data.access_token;

    // Persiste il nuovo token nel DB se abbiamo un userId
    if (this.userId) {
      await User.findByIdAndUpdate(this.userId, {
        'apiCube.accessToken': res.data.access_token,
        'apiCube.refreshToken': res.data.refresh_token || refreshToken,
        'apiCube.tokenExpiresAt': new Date(Date.now() + (res.data.expires_in || 3600) * 1000)
      });
    }

    return res.data;
  }

  /**
   * Assicura che ci sia un token valido. Se il token corrente è scaduto,
   * lo rinnova automaticamente con il refresh_token dal DB.
   *
   * @param {object} user - Record User dal DB (con apiCube.accessToken ecc.)
   */
  async ensureToken(user) {
    if (!user?.apiCube?.accessToken) {
      throw new Error('Token A-Cube non configurato. Configura A-Cube nelle Impostazioni.');
    }

    const scaduto = user.apiCube.tokenExpiresAt && new Date(user.apiCube.tokenExpiresAt) < new Date();
    if (scaduto && user.apiCube.refreshToken) {
      await this.refreshAccessToken(user.apiCube.refreshToken);
    } else {
      this.accessToken = user.apiCube.accessToken;
    }
  }

  // ═══════════════════════════════════════════════════════
  //  SCONTRINO ELETTRONICO SMART (Documento Commerciale)
  // ═══════════════════════════════════════════════════════

  /**
   * Emette un documento commerciale (scontrino) per un soggetto esonerante.
   * Il documento viene trasmesso da A-Cube al portale Fatture e Corrispettivi dell'AdE.
   *
   * @param {object} payload
   * @param {string} payload.codiceFiscale    - CF del soggetto (tassista/NCC)
   * @param {string} payload.data             - Data documento 'YYYY-MM-DD'
   * @param {number} payload.importoTotale    - Importo totale in EUR
   * @param {number} [payload.importoContante]  - Quota pagata in contanti
   * @param {number} [payload.importoElettronico] - Quota pagata con carta/POS
   * @param {string} [payload.descrizione]    - Descrizione prestazione (es. 'Servizio taxi')
   * @param {number} [payload.numeroDocumenti]  - N. documenti aggregati (default 1)
   * @returns {Promise<{ id: string, stato: string, dataTrasmissione: string }>}
   */
  async emettiDocumento(payload) {
    const body = {
      fiscal_code: payload.codiceFiscale,
      document_date: fmtDate(payload.data),
      total_amount: parseFloat(payload.importoTotale).toFixed(2),
      cash_amount: payload.importoContante != null ? parseFloat(payload.importoContante).toFixed(2) : undefined,
      electronic_amount: payload.importoElettronico != null ? parseFloat(payload.importoElettronico).toFixed(2) : undefined,
      description: payload.descrizione || 'Prestazione di servizio',
      documents_count: payload.numeroDocumenti || 1
    };

    // Rimuove i campi undefined
    Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);

    const res = await this.client.post('/api/v1/smart-receipt', body);
    return res.data;
  }

  /**
   * Verifica lo stato di un documento commerciale già emesso.
   * @param {string} documentId - ID restituito da emettiDocumento()
   * @returns {Promise<{ id: string, stato: string, dataTrasmissione: string, errore?: string }>}
   */
  async getStatoDocumento(documentId) {
    const res = await this.client.get(`/api/v1/smart-receipt/${documentId}`);
    return res.data;
  }

  /**
   * Lista i documenti commerciali emessi per un soggetto in un periodo.
   * @param {string} codiceFiscale
   * @param {Date}   dal
   * @param {Date}   al
   */
  async listDocumenti(codiceFiscale, dal, al) {
    const res = await this.client.get('/api/v1/smart-receipt', {
      params: {
        fiscal_code: codiceFiscale,
        date_from: fmtDate(dal),
        date_to: fmtDate(al)
      }
    });
    return res.data;
  }

  // ═══════════════════════════════════════════════════════
  //  VERIFICA CONFIGURAZIONE
  // ═══════════════════════════════════════════════════════

  /**
   * Verifica che le credenziali A-Cube siano valide.
   * @returns {Promise<{ valido: boolean, piano?: string, errore?: string }>}
   */
  async verificaCredenziali() {
    try {
      const res = await this.client.get('/api/v1/account/me');
      return { valido: true, piano: res.data?.plan || res.data?.piano };
    } catch (err) {
      return { valido: false, errore: err.response?.data?.message || err.message };
    }
  }
}

module.exports = ACubeClient;
