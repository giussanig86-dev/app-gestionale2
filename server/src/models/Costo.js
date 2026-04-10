/**
 * COSTO MODEL
 * Fatture passive (SDI) + costi manuali
 */

const mongoose = require('mongoose');

const costoSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  tipoCosto: {
    type: String,
    enum: ['fattura_passiva', 'costo_manuale'],
    required: true,
    index: true
  },

  data: { type: Date, required: true, index: true },

  importo: {
    type: Number,
    required: true,
    min: [0.01, 'Importo deve essere positivo'],
    validate: {
      validator: function(v) { return v < 50000; },
      message: 'Importo elevato (>50k), verifica inserimento'
    }
  },

  categoria: {
    type: String,
    enum: ['carburante', 'manutenzione', 'assicurazione', 'bollo', 'pedaggi', 'parcheggi', 'altro'],
    required: true,
    index: true
  },

  descrizione: { type: String, trim: true, maxlength: 500 },

  competenzaAnno: {
    type: Number,
    required: true,
    default: function() { return new Date().getFullYear(); },
    index: true
  },

  // SDI - Fatture passive
  sdi: {
    isFatturaElettronica: { type: Boolean, default: false },
    numeroFattura: String,
    dataFattura: Date,
    fornitore: {
      denominazione: String,
      partitaIva: String,
      codiceFiscale: String,
      indirizzo: String
    },
    identificativoSdi: { type: String, unique: true, sparse: true, index: true },
    progressivoInvio: String,
    xmlFilePath: String,
    xmlHash: String,
    imponibile: Number,
    iva: Number,
    totaleDocumento: Number,
    causale: String,
    importedAt: Date,
    importedFrom: { type: String, enum: ['sdi', 'cassetto_fiscale'] }
  },

  ricevuta: String,

  // Giustificativo allegato (PDF o immagine)
  giustificativo: {
    data:      { type: Buffer },
    nome:      { type: String },
    mimeType:  { type: String },
    size:      { type: Number },
    caricatoAt:{ type: Date },
  },

  // Approvazione
  insertMode: {
    type: String,
    enum: ['manuale', 'vocale', 'sdi_automatico', 'import_registro_iva', 'ade'],
    default: 'manuale'
  },

  approvato: { type: Boolean, default: false, index: true },
  approvatoDa: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dataApprovazione: Date,
  note: { type: String, trim: true, maxlength: 1000 }

}, {
  timestamps: true
});

// ============ INDICI ============
costoSchema.index({ userId: 1, data: -1 });
costoSchema.index({ userId: 1, tipoCosto: 1, approvato: 1 });
costoSchema.index({ userId: 1, categoria: 1 });
costoSchema.index({ userId: 1, competenzaAnno: 1, approvato: 1 });

// ============ VIRTUALS ============
costoSchema.virtual('isApprovato').get(function() {
  return this.approvato === true;
});

costoSchema.virtual('isFatturaSDI').get(function() {
  return this.sdi?.isFatturaElettronica === true;
});

costoSchema.virtual('categoriaNome').get(function() {
  const map = {
    carburante: 'Carburante',
    manutenzione: 'Manutenzione',
    assicurazione: 'Assicurazione',
    bollo: 'Bollo Auto',
    pedaggi: 'Pedaggi',
    parcheggi: 'Parcheggi',
    altro: 'Altro'
  };
  return map[this.categoria] || this.categoria;
});

// ============ MIDDLEWARE ============
costoSchema.pre('save', async function(next) {
  if (this.sdi?.isFatturaElettronica && !this.approvato) {
    const user = await mongoose.model('User').findById(this.userId);
    if (user?.apiCube?.autoApprove) {
      this.approvato = true;
      this.approvatoDa = user.consulenteId;
      this.dataApprovazione = new Date();
    }
  }
  next();
});

// ============ METODI ISTANZA ============
costoSchema.methods.approva = async function(consulenteId) {
  this.approvato = true;
  this.approvatoDa = consulenteId;
  this.dataApprovazione = new Date();
  await this.save();
};

costoSchema.methods.rifiuta = async function(consulenteId, motivazione) {
  this.note = `RIFIUTATO: ${motivazione}`;
  await this.save();
};

// ============ METODI STATICI ============
costoSchema.statics.totaleAnno = async function(userId, anno, soloApprovati = true) {
  const match = {
    userId: new mongoose.Types.ObjectId(userId),
    competenzaAnno: anno
  };
  if (soloApprovati) match.approvato = true;

  const result = await this.aggregate([
    { $match: match },
    { $group: { _id: null, totale: { $sum: '$importo' }, count: { $sum: 1 } } }
  ]);

  return result[0] || { totale: 0, count: 0 };
};

costoSchema.statics.breakdownCategorie = async function(userId, anno) {
  return await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        competenzaAnno: anno,
        approvato: true
      }
    },
    { $group: { _id: '$categoria', totale: { $sum: '$importo' }, count: { $sum: 1 } } },
    { $sort: { totale: -1 } }
  ]);
};

costoSchema.statics.daApprovare = async function(userId) {
  return await this.find({
    userId: userId,
    approvato: false,
    tipoCosto: 'costo_manuale'
  }).sort({ data: -1 });
};

costoSchema.statics.daApprovareConsulente = async function(consulenteId) {
  const clienti = await mongoose.model('User').find({
    consulenteId: consulenteId,
    ruolo: 'cliente'
  }).select('_id');

  const clientiIds = clienti.map(c => c._id);

  return await this.find({
    userId: { $in: clientiIds },
    approvato: false
  })
  .populate('userId', 'nome cognome')
  .sort({ data: -1 });
};

const Costo = mongoose.model('Costo', costoSchema);

module.exports = Costo;
