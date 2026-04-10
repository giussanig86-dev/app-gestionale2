/**
 * CORRISPETTIVO MODEL
 * Gestisce incassi/corrispettivi dei clienti taxi
 * NON trasmessi a SDI
 */

const mongoose = require('mongoose');

const corrispettivoSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID obbligatorio'],
    index: true
  },

  data: {
    type: Date,
    required: [true, 'Data obbligatoria'],
    index: true
  },

  importo: {
    type: Number,
    required: [true, 'Importo obbligatorio'],
    min: [0.01, 'Importo deve essere positivo'],
    max: [10000, 'Importo troppo alto, verifica']
  },

  descrizione: {
    type: String,
    trim: true,
    maxlength: 200
  },

  metodoPagamento: {
    type: String,
    enum: {
      values: ['contante', 'carta', 'pos', 'bonifico'],
      message: 'Metodo pagamento non valido'
    },
    required: true,
    default: 'contante',
    index: true
  },

  // POS Integration
  posTransactionId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },

  posProvider: {
    type: String,
    enum: ['sumup', 'square', 'stripe_terminal', 'altro']
  },

  // Tracking
  insertMode: {
    type: String,
    enum: ['manuale', 'vocale', 'pos_automatico', 'import_registro_corrispettivi', 'ade'],
    default: 'manuale',
    required: true
  },

  verificato: {
    type: Boolean,
    default: true
  },

  note: {
    type: String,
    trim: true,
    maxlength: 500
  },

  // AdE: campi per corrispettivi scaricati dal portale Fatture e Corrispettivi
  //      e per la trasmissione corrispettivi telematici all'AdE
  ade: {
    // Download (sync)
    idFile: String,
    identificativo: String,
    importedAt: Date,
    // Trasmissione
    trasmesso: { type: Boolean, default: false },
    dataTrasmissione: Date,
    idTrasmissione: String
  }

}, {
  timestamps: true
});

// ============ INDICI ============
corrispettivoSchema.index({ userId: 1, data: -1 });
corrispettivoSchema.index({ userId: 1, metodoPagamento: 1 });
corrispettivoSchema.index({ userId: 1, createdAt: -1 });

// ============ VIRTUALS ============
corrispettivoSchema.virtual('anno').get(function() {
  return this.data.getFullYear();
});

corrispettivoSchema.virtual('mese').get(function() {
  return this.data.getMonth() + 1;
});

corrispettivoSchema.virtual('isPOS').get(function() {
  return this.insertMode === 'pos_automatico';
});

// ============ MIDDLEWARE ============
corrispettivoSchema.pre('save', async function(next) {
  if (this.insertMode === 'pos_automatico') {
    this.verificato = true;
  }
  next();
});

// ============ METODI ISTANZA ============
corrispettivoSchema.methods.importoFormattato = function() {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(this.importo);
};

// ============ METODI STATICI ============

corrispettivoSchema.statics.totaleAnno = async function(userId, anno) {
  const result = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        data: {
          $gte: new Date(anno, 0, 1),
          $lt: new Date(anno + 1, 0, 1)
        }
      }
    },
    {
      $group: {
        _id: null,
        totale: { $sum: '$importo' },
        count: { $sum: 1 }
      }
    }
  ]);

  return result[0] || { totale: 0, count: 0 };
};

corrispettivoSchema.statics.totaleMese = async function(userId, anno, mese) {
  const result = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        data: {
          $gte: new Date(anno, mese - 1, 1),
          $lt: new Date(anno, mese, 1)
        }
      }
    },
    {
      $group: {
        _id: null,
        totale: { $sum: '$importo' },
        count: { $sum: 1 }
      }
    }
  ]);

  return result[0] || { totale: 0, count: 0 };
};

corrispettivoSchema.statics.breakdownMetodi = async function(userId, anno) {
  return await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        data: {
          $gte: new Date(anno, 0, 1),
          $lt: new Date(anno + 1, 0, 1)
        }
      }
    },
    {
      $group: {
        _id: '$metodoPagamento',
        totale: { $sum: '$importo' },
        count: { $sum: 1 }
      }
    },
    { $sort: { totale: -1 } }
  ]);
};

corrispettivoSchema.statics.andamentoMensile = async function(userId, anno) {
  return await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        data: {
          $gte: new Date(anno, 0, 1),
          $lt: new Date(anno + 1, 0, 1)
        }
      }
    },
    {
      $group: {
        _id: { $month: '$data' },
        totale: { $sum: '$importo' },
        count: { $sum: 1 },
        media: { $avg: '$importo' }
      }
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        mese: '$_id',
        totale: 1,
        count: 1,
        media: { $round: ['$media', 2] },
        _id: 0
      }
    }
  ]);
};

const Corrispettivo = mongoose.model('Corrispettivo', corrispettivoSchema);

module.exports = Corrispettivo;
