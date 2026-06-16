import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  channel: { type: String, default: 'global', index: true },
  userId: mongoose.Schema.Types.ObjectId,
  characterId: mongoose.Schema.Types.ObjectId,
  name: String,
  text: { type: String, maxlength: 280 },
  systemId: String,
  fleetId: mongoose.Schema.Types.ObjectId
}, { timestamps: true });

schema.index({ channel: 1, createdAt: -1 });

export const ChatMessage = mongoose.model('ChatMessage', schema);
