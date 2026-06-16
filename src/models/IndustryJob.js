import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  characterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character', index: true },
  blueprintTypeId: String,
  productTypeId: String,
  productName: String,
  runs: { type: Number, default: 1 },
  status: { type: String, enum: ['running', 'ready', 'delivered', 'cancelled'], default: 'running', index: true },
  startedAt: Date,
  readyAt: Date,
  materials: mongoose.Schema.Types.Mixed,
  output: mongoose.Schema.Types.Mixed,
  cost: Number
}, { timestamps: true });

schema.index({ characterId: 1, status: 1 });

export const IndustryJob = mongoose.model('IndustryJob', schema);
