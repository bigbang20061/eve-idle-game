import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 40 },
  commanderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character', index: true },
  systemId: String,
  activity: { type: String, default: 'nullsec-raid' },
  status: { type: String, enum: ['forming', 'running', 'extracting', 'completed', 'lost'], default: 'forming', index: true },
  members: [{ characterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character' }, role: String, joinedAt: Date }],
  objective: mongoose.Schema.Types.Mixed,
  lootPool: mongoose.Schema.Types.Mixed,
  log: [String],
  startedAt: Date,
  readyAt: Date
}, { timestamps: true });

schema.index({ status: 1, createdAt: -1 });

export const Fleet = mongoose.model('Fleet', schema);
