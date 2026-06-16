import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  marketGroupId: { type: String, unique: true, index: true },
  name: String,
  zh: String,
  parentGroupId: String,
  raw: mongoose.Schema.Types.Mixed,
  source: String
}, { timestamps: true });

export const SdeMarketGroup = mongoose.model('SdeMarketGroup', schema);
