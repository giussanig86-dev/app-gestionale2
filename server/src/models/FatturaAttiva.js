/**
 * FATTURA ATTIVA MODEL
 * Fatture elettroniche emesse tramite SDI
 */

const mongoose = require('mongoose');

const fatturaAttivaSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  numeroFattura: {
    type: String,
    required: [true, 'Numero fattura obbligatorio'],
    trim: true
  },

  dataEmissione: {
    type: Date,
    required: [true, 'Data emissione obbligatoria'],
    index: true
  },

  dataScadenza: Date,

  // Cliente destinatario
  cliente: {
    tipo: {
      type: String,
      enum: ['privato', 'azienda', 'pa'],
      required: true
    },
    denominazione: String,
    nome: String,
    cognome: String,
    partitaIva: { type: String, match: /^[0-9]{11}$/ },
    codiceFiscale: String,
    indirizzo: String,
    cap: String,
    citta: String,
    provincia: String,
    codiceSdi: { type: String, match: /^[A-Z0-9]{7}$/ },
    pec: { type: String, match: /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/ }
  },

  // Importi
  imponibile: { type: Number, required: true, min: 0 },
  iva: { type: Number, default: 0, min: 0 },
  totale: { type: Number, required: true, min: 0 },

  descrizione: { type: String, trim: true, maxlength: 1000 },
  causale: { type: String, trim: true, maxlength: 200 },

  // SDI Integration
  sdi: {
    trasmessa: { type: Boolean, default: false, index: true },
    identificativoSdi: { type: String, unique: true, sparse: true, index: true },
    progressivoInvio: String,
    dataTrasmissione: Date,
    statoTrasmissione: {
      type: String,
      enum: ['bozza', 'inviata', 'consegnata', 'rifiutata', 'scartata', 'errore'],
      default: 'bozza',
      index: true
    },
    notificaSDI: String,
    motivoScarto: String,
    erroreTrasmissione: String,
    xmlFilePath: String,
    xmlHash: String
  },

  // Pagamento
  pagata: { type: Boolean, default: false, index: true },
  dataPagamento: Date,
  metodoPagamento: {
    type: String,
    enum: ['bonifico', 'contante', 'carta', 'altro']
  },

  // Tracking
  insertMode: {
    type: String,
    enum: ['manuale', 'api_cube', 'ade'],
    default: 'manuale'
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

}, {
  timestamps: true
});

// ============ INDICI ============
fatturaAttivaSchema.index({ userId: 1, numeroFattura: 1 }, { unique: true });
fatturaAttivaSchema.index({ userId: 1, dataEmissione: -1 });
fatturaAttivaSchema.index({ pagata: 1, dataScadenza: 1 });

// ============ VIRTUALS ============
fatturaAttivaSchema.virtual('clienteNome').get(function() {
  if (this.cliente.tipo === 'azienda' || this.cliente.tipo === 'pa') {
    return this.cliente.denominazione;
  }
  return `${this.cliente.nome} ${this.cliente.cognome}`;
});

fatturaAttivaSchema.virtual('isScaduta').get(function() {
  if (!this.dataScadenza || this.pagata) return false;
  return new Date() > this.dataScadenza;
});

fatturaAttivaSchema.virtual('giorniScadenza').get(function() {
  if (!this.dataScadenza || this.pagata) return null;
  const diff = this.dataScadenza - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// ============ MIDDLEWARE ============
fatturaAttivaSchema.pre('save', function(next) {
  if (this.cliente.tipo === 'azienda' && !this.cliente.codiceSdi && !this.cliente.pec) {
    return next(new Error('Codice SDI o PEC obbligatorio per azienda'));
  }

  const calcolato = this.imponibile + this.iva;
  if (Math.abs(calcolato - this.totale) > 0.01) {
    return next(new Error('Totale non corrisponde a imponibile + IVA'));
  }

  next();
});

// ============ METODI ISTANZA ============
fatturaAttivaSchema.methods.marcaPagata = async function(metodo) {
  this.pagata = true;
  this.dataPagamento = new Date();
  this.metodoPagamento = metodo;
  await this.save();
};

fatturaAttivaSchema.methods.aggiornaStatoSDI = async function(stato, motivoScarto = null) {
  this.sdi.statoTrasmissione = stato;
  if (motivoScarto) this.sdi.motivoScarto = motivoScarto;
  await this.save();
};

// ============ METODI STATICI ============
fatturaAttivaSchema.statics.fatturatoAnno = async function(userId, anno) {
  const result = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        'sdi.trasmessa': true,
        'sdi.statoTrasmissione': { $in: ['consegnata', 'inviata'] },
        dataEmissione: {
          $gte: new Date(anno, 0, 1),
          $lt: new Date(anno + 1, 0, 1)
        }
      }
    },
    {
      $group: {
        _id: null,
        totale: { $sum: '$totale' },
        count: { $sum: 1 }
      }
    }
  ]);

  return result[0] || { totale: 0, count: 0 };
};

fatturaAttivaSchema.statics.fattureScadute = async function(userId) {
  return await this.find({
    userId: userId,
    pagata: false,
    dataScadenza: { $lt: new Date() },
    'sdi.statoTrasmissione': 'consegnata'
  }).sort({ dataScadenza: 1 });
};

fatturaAttivaSchema.statics.prossimeScadenze = async function(userId, giorni = 30) {
  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() + giorni);

  return await this.find({
    userId: userId,
    pagata: false,
    dataScadenza: { $gte: new Date(), $lte: dataLimite },
    'sdi.statoTrasmissione': 'consegnata'
  }).sort({ dataScadenza: 1 });
};

const FatturaAttiva = mongoose.model('FatturaAttiva', fatturaAttivaSchema);

module.exports = FatturaAttiva;
