import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  typeId: { type: String, index: true },
  name: String,
  systemId: { type: String, index: true },
  regionId: String,
  side: { type: String, enum: ['buy', 'sell'], index: true },
  price: Number,
  quantity: Number,
  remaining: Number,
  ownerCharacterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character', index: true },
  npc: { type: Boolean, default: false },
  expiresAt: Date
}, { timestamps: true });

schema.index({ typeId: 1, side: 1, price: 1 });

export const MarketOrder = mongoose.model('MarketOrder', schema);
