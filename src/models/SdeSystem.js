import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  systemId: { type: String, unique: true, index: true },
  name: { type: String, index: 'text' },
  zh: { type: String, index: 'text' },
  regionId: String,
  regionName: String,
  constellationId: String,
  constellationName: String,
  security: { type: Number, index: true },
  x: Number,
  y: Number,
  z: Number,
  richness: Number,
  danger: Number,
  hub: Boolean,
  kind: String,
  neighbors: [String],
  raw: mongoose.Schema.Types.Mixed,
  source: String
}, { timestamps: true });

schema.index({ security: 1, richness: -1 });

export const SdeSystem = mongoose.model('SdeSystem', schema);
