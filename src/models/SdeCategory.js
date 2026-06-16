import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  categoryId: { type: String, unique: true, index: true },
  name: String,
  zh: String,
  raw: mongoose.Schema.Types.Mixed,
  source: String
}, { timestamps: true });

export const SdeCategory = mongoose.model('SdeCategory', schema);
