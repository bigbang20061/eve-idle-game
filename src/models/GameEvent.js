import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  scope: { type: String, enum: ['global', 'system', 'fleet', 'character'], default: 'global', index: true },
  systemId: String,
  fleetId: mongoose.Schema.Types.ObjectId,
  characterId: mongoose.Schema.Types.ObjectId,
  severity: { type: String, enum: ['info', 'success', 'warn', 'danger'], default: 'info' },
  title: String,
  message: String,
  data: mongoose.Schema.Types.Mixed
}, { timestamps: true });

schema.index({ createdAt: -1 });

export const GameEvent = mongoose.model('GameEvent', schema);
