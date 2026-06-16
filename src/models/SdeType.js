import mongoose from 'mongoose';

const sdeTypeSchema = new mongoose.Schema({
  typeId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, index: 'text' },
  zh: { type: String, index: 'text' },
  description: String,
  groupId: String,
  groupName: String,
  categoryId: String,
  categoryName: String,
  marketGroupId: String,
  marketGroupName: String,
  kind: { type: String, index: true },
  published: Boolean,
  volume: Number,
  capacity: Number,
  mass: Number,
  basePrice: Number,
  rarity: Number,
  tier: Number,
  slot: String,
  role: String,
  effects: mongoose.Schema.Types.Mixed,
  stats: mongoose.Schema.Types.Mixed,
  attributes: mongoose.Schema.Types.Mixed,
  source: String,
  raw: mongoose.Schema.Types.Mixed
}, { timestamps: true });

sdeTypeSchema.index({ kind: 1, tier: 1 });
sdeTypeSchema.index({ groupName: 1, categoryName: 1 });

export const SdeType = mongoose.model('SdeType', sdeTypeSchema);
