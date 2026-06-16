import mongoose from 'mongoose';

const materialSchema = new mongoose.Schema({ typeId: String, name: String, quantity: Number }, { _id: false });

const schema = new mongoose.Schema({
  blueprintTypeId: { type: String, unique: true, index: true },
  name: String,
  zh: String,
  productTypeId: { type: String, index: true },
  productName: String,
  productKind: String,
  quantity: { type: Number, default: 1 },
  time: { type: Number, default: 60 },
  materials: [materialSchema],
  raw: mongoose.Schema.Types.Mixed,
  source: String
}, { timestamps: true });

export const SdeBlueprint = mongoose.model('SdeBlueprint', schema);
