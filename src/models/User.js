import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 24, index: true },
  usernameLower: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['player', 'admin'], default: 'player' },
  banned: { type: Boolean, default: false },
  lastLoginAt: Date,
  lastIp: String,
  settings: {
    sound: { type: Boolean, default: true },
    compactUi: { type: Boolean, default: false },
    locale: { type: String, default: 'zh-CN' }
  }
}, { timestamps: true });

userSchema.index({ createdAt: 1 });

export const User = mongoose.model('User', userSchema);
