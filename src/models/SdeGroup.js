import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  groupId: { type: String, unique: true, index: true },
  name: String,
  zh: String,
  categoryId: String,
  categoryName: String,
  raw: mongoose.Schema.Types.Mixed,
  source: String
}, { timestamps: true });

export const SdeGroup = mongoose.model('SdeGroup', schema);
