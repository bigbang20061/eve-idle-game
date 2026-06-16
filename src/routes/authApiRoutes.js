import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { User } from '../models/index.js';
import { createStarterCharacter } from '../services/characterFactory.js';
import { starterRaceOptions } from '../services/starterConfig.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../middleware/auth.js';

export const authApiRoutes = express.Router();

const authLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false });

function publicUser(user) {
  if (!user) return null;
  return { id: String(user._id), username: user.username, role: user.role };
}

authApiRoutes.get('/starter-options', asyncHandler(async (req, res) => {
  res.json({ ok: true, ...starterRaceOptions() });
}));

authApiRoutes.get('/me', asyncHandler(async (req, res) => {
  res.json({ ok: true, user: publicUser(req.user), character: req.character || null });
}));

authApiRoutes.post('/register', authLimiter, asyncHandler(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const characterName = String(req.body.characterName || username).trim();
  const password = String(req.body.password || '');
  const inviteCode = String(req.body.inviteCode || '').trim();
  const race = String(req.body.race || '').trim().toLowerCase();
  const raceOptions = starterRaceOptions();
  if (!raceOptions.races[race]) throw new Error('请选择有效的初始势力。');
  if (!/^[\p{L}\p{N}_-]{3,24}$/u.test(username)) throw new Error('账号只能包含 3-24 位字母/数字/下划线/短横线。');
  if (characterName.length < 2 || characterName.length > 28) throw new Error('角色名需要 2-28 位。');
  if (password.length < 6) throw new Error('密码至少 6 位。');
  const usernameLower = username.toLowerCase();
  const exists = await User.findOne({ usernameLower });
  if (exists) throw new Error('账号已存在。');
  const userCount = await User.estimatedDocumentCount();
  const role = userCount === 0 || (env.adminInviteCode && inviteCode === env.adminInviteCode) ? 'admin' : 'player';
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ username, usernameLower, passwordHash, role, lastIp: req.ip });
  const character = await createStarterCharacter(user, characterName, { race });
  req.session.userId = String(user._id);
  req.session.save(() => res.json({ ok: true, user: publicUser(user), character }));
}));

authApiRoutes.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const usernameLower = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = await User.findOne({ usernameLower });
  if (!user || user.banned) return res.status(401).json({ ok: false, error: '账号或密码错误。' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ ok: false, error: '账号或密码错误。' });
  user.lastLoginAt = new Date();
  user.lastIp = req.ip;
  await user.save();
  req.session.userId = String(user._id);
  req.session.save(() => res.json({ ok: true, user: publicUser(user) }));
}));

authApiRoutes.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

authApiRoutes.use((err, req, res, next) => {
  console.error('[auth-api]', err);
  res.status(400).json({ ok: false, error: err.message || '请求失败。' });
});
