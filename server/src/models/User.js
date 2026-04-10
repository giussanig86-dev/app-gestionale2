/**
 * USER MODEL
 * Gestisce super_admin, consulenti e clienti
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { encrypt, decrypt } = require('../config/encryption');

const userSchema = new mongoose.Schema({
  // ============ DATI BASE ============
  nome: {
    type: String,
    required: [true, 'Nome obbligatorio'],
    trim: true,
    minlength: 2,
    maxlength: 50
  },

  cognome: {
    type: String,
    required: [true, 'Cognome obbligatorio'],
    trim: true,
    minlength: 2,
    maxlength: 50
  },

  email: {
    type: String,
    required: [true, 'Email obbligatoria'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, 'Email non valida']
  },

  password: {
    type: String,
    required: [true, 'Password obbligatoria'],
    minlength: 8,
    select: false
  },

  telefono: {
    type: String,
    trim: true
  },

  // ============ RUOLO E TENANT ============
  ruolo: {
    type: String,
    enum: {
      values: ['super_admin', 'consulente', 'cliente'],
      message: 'Ruolo non valido'
    },
    required: true,
    index: true
  },

  consulenteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },

  // ============ CODICE CLIENTE E LICENZA TAXI ============
  codiceCliente: {
    type: String,
    trim: true,
    maxlength: 50
  },

  numeroLicenza: {
    type: String,
    trim: true,
    maxlength: 50
  },

  comuneRilascioLicenza: {
    type: String,
    trim: true,
    maxlength: 100
  },

  // ============ STATO OPERATIVO CLIENTE ============
  statoCliente: {
    type: String,
    enum: ['attivo', 'sospeso', 'cessato'],
    default: 'attivo',
    index: true
  },

  // ============ DATI FISCALI (solo clienti) ============
  partitaIva: {
    type: String,
    set: encrypt,
    get: decrypt,
    trim: true
  },

  codiceFiscale: {
    type: String,
    set: encrypt,
    get: decrypt,
    uppercase: true,
    trim: true
  },

  regimeFiscale: {
    type: String,
    enum: ['forfettario', 'ordinario'],
    default: 'forfettario'
  },

  coefficienteRedditivita: {
    type: Number,
    default: 0.67,
    min: 0,
    max: 1
  },

  aliquotaForfettaria: {
    type: Number,
    default: 0.15,
    enum: [0.05, 0.15]
  },

  detrazioniLavoroAutonomo: {
    type: Number,
    default: 0,
    min: 0
  },

  aliquotaINPS: {
    type: Number,
    default: 0.2448,
    min: 0,
    max: 1
  },

  // ============ INDIRIZZO ============
  indirizzo: {
    via: String,
    cap: String,
    comune: String,
    provincia: String
  },

  // ============ API CUBE ============
  apiCube: {
    enabled: { type: Boolean, default: false },
    codiceSdi: { type: String, set: encrypt, get: decrypt },
    accessToken: { type: String, set: encrypt, get: decrypt },
    refreshToken: { type: String, set: encrypt, get: decrypt },
    tokenExpiresAt: Date,
    lastSyncAt: Date,
    syncFrequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: 'daily'
    },
    importOnlyAfter: Date,
    autoApprove: { type: Boolean, default: false },
    configuredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    configuredAt: Date
  },

  // ============ ADE (Agenzia delle Entrate) ============
  // Per i consulenti: configurazione certificato + schedule sync
  // Per i clienti: stato delega presso AdE
  ade: {
    // Consulente
    enabled: { type: Boolean, default: false },
    certPath: { type: String, trim: true },
    certPassword: { type: String, set: encrypt, get: decrypt },
    syncSchedule: { type: String, default: '0 6 * * *' },
    importOnlyAfter: Date,

    // Condiviso (usato sia dal consulente che dal cliente)
    lastSyncAt: Date,

    // Cliente
    inDelega: { type: Boolean, default: false },
    delegaDal: Date,
    trasmetteCorrispettivi: { type: Boolean, default: false } // es. NCC con obbligo RT
  },

  // ============ CONSULENTE - PIANO SAAS ============
  consulente: {
    piano: {
      type: String,
      enum: ['free', 'pro', 'enterprise', 'custom'],
      default: 'free'
    },
    limiti: {
      maxClienti: { type: Number, default: 5 },
      maxStorage: { type: Number, default: 1000 },
      hasFatturazioneElettronica: { type: Boolean, default: false },
      hasWhiteLabel: { type: Boolean, default: false },
      hasPrioritySupport: { type: Boolean, default: false }
    },
    utilizzo: {
      clientiAttivi: { type: Number, default: 0 },
      storageUsato: { type: Number, default: 0 }
    },
    billing: {
      abbonamentoPagato: { type: Boolean, default: false },
      dataScadenza: Date,
      metodoPagamento: {
        type: String,
        enum: ['stripe', 'paypal', 'bonifico', 'altro']
      },
      stripeCustomerId: String,
      stripeSubscriptionId: String,
      ultimoPagamento: Date,
      importoMensile: Number
    },
    branding: {
      logo: String,
      nomeStudio: String,
      indirizzo: String,
      colorePrimario: String,
      coloreSecondario: String
    }
  },

  // ============ SICUREZZA ============
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: String,
  accountSospeso: { type: Boolean, default: false },
  motivoSospensione: String,

  // ============ TRACKING ============
  lastLogin: Date,
  loginAttempts: { type: Number, default: 0 },
  accountLockedUntil: Date

}, {
  timestamps: true,
  toJSON: { getters: true, virtuals: true },
  toObject: { getters: true, virtuals: true }
});

// ============ INDICI ============
// email index already set via { unique: true } in schema definition
userSchema.index({ consulenteId: 1, ruolo: 1 });
userSchema.index({ ruolo: 1, 'consulente.piano': 1 });

// ============ VIRTUALS ============
userSchema.virtual('nomeCompleto').get(function() {
  return `${this.nome} ${this.cognome}`;
});

userSchema.virtual('isConsulente').get(function() {
  return this.ruolo === 'consulente';
});

userSchema.virtual('isCliente').get(function() {
  return this.ruolo === 'cliente';
});

userSchema.virtual('isSuperAdmin').get(function() {
  return this.ruolo === 'super_admin';
});

userSchema.virtual('pianoAttivo').get(function() {
  if (this.ruolo !== 'consulente') return null;
  return this.consulente?.billing?.abbonamentoPagato ? this.consulente.piano : 'scaduto';
});

// ============ MIDDLEWARE ============

// Pre-save: Hash password se modificata
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, 12);
  this.passwordChangedAt = Date.now() - 1000;

  next();
});

// Post-save: Aggiorna counter clienti consulente (SOLO per nuovi documenti)
userSchema.post('save', async function(doc) {
  if (doc.isNew && doc.ruolo === 'cliente' && doc.consulenteId) {
    await mongoose.model('User').updateOne(
      { _id: doc.consulenteId },
      { $inc: { 'consulente.utilizzo.clientiAttivi': 1 } }
    );
  }
});

// ============ METODI ISTANZA ============

userSchema.methods.verificaPassword = async function(passwordInserita) {
  return await bcrypt.compare(passwordInserita, this.password);
};

userSchema.methods.creaPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

userSchema.methods.passwordCambiataDopoJWT = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

userSchema.methods.puoCreareNuovoCliente = function() {
  if (this.ruolo !== 'consulente') return false;
  const utilizzo = this.consulente.utilizzo.clientiAttivi;
  const limite = this.consulente.limiti.maxClienti;
  return utilizzo < limite;
};

// ============ METODI STATICI ============

userSchema.statics.trovaClientiConsulente = function(consulenteId) {
  return this.find({
    consulenteId: consulenteId,
    ruolo: 'cliente',
    accountSospeso: false
  }).sort({ cognome: 1, nome: 1 });
};

userSchema.statics.trovaConsulentiAttivi = function() {
  return this.find({
    ruolo: 'consulente',
    'consulente.billing.abbonamentoPagato': true,
    'consulente.billing.dataScadenza': { $gt: new Date() }
  });
};

userSchema.statics.statistichePiattaforma = async function() {
  const [consulenti, clienti, revenue] = await Promise.all([
    this.countDocuments({ ruolo: 'consulente' }),
    this.countDocuments({ ruolo: 'cliente' }),
    this.aggregate([
      { $match: {
        ruolo: 'consulente',
        'consulente.billing.abbonamentoPagato': true
      }},
      { $group: {
        _id: null,
        totaleMensile: { $sum: '$consulente.billing.importoMensile' }
      }}
    ])
  ]);

  return {
    consulenti,
    clienti,
    MRR: revenue[0]?.totaleMensile || 0
  };
};

const User = mongoose.model('User', userSchema);

module.exports = User;
