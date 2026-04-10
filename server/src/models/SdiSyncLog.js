/**
 * SDI SYNC LOG MODEL
 */

const mongoose = require('mongoose');

const sdiSyncLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Consulente che ha avviato il sync (per sync ADE)
  consulenteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },

  // Cliente specifico (per sync singolo cliente)
  clienteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },

  // Sorgente del sync
  source: {
    type: String,
    enum: ['api_cube', 'ade'],
    default: 'ade',
    index: true
  },

  // Tipi di documenti sincronizzati
  tipoDocumenti: [{
    type: String,
    enum: ['fatture_passive', 'fatture_attive', 'corrispettivi']
  }],

  syncStartedAt: { type: Date, required: true, index: true },
  syncCompletedAt: Date,

  status: {
    type: String,
    enum: ['in_progress', 'completed', 'failed'],
    default: 'in_progress',
    index: true
  },

  fattureScaricare: Number,
  fattureImportate: Number,
  fattureDuplicate: Number,
  fattureErrori: Number,

  syncErrors: [{
    clienteId: mongoose.Schema.Types.ObjectId,
    identificativoSdi: String,
    errorMessage: String,
    timestamp: Date
  }],

  apiCallsDuration: Number,
  parsingDuration: Number
}, {
  timestamps: true
});

sdiSyncLogSchema.index({ userId: 1, syncStartedAt: -1 });

const SdiSyncLog = mongoose.model('SdiSyncLog', sdiSyncLogSchema);

module.exports = SdiSyncLog;
