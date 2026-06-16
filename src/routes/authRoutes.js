import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { User } from '../models/index.js';
import { createStarterCharacter } from '../services/characterFactory.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../middleware/auth.js';

export const authRoutes = express.Router();

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false
});

authRoutes.get('/login', (req, res) => {
  res.render('auth/login', { title: '登录', active: 'login', error: '', next: req.query.next || '/command' });
});

authRoutes.get('/register', (req, res) => {
  res.render('auth/register', { title: '注册', active: 'register', error: '', values: {} });
});

authRoutes.post('/register', authLimiter, asyncHandler(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const characterName = String(req.body.characterName || username).trim();
  const password = String(req.body.password || '');
  const inviteCode = String(req.body.inviteCode || '').trim();
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
  await createStarterCharacter(user, characterName);
  req.session.userId = String(user._id);
  req.session.save(() => res.redirect('/command'));
}));

authRoutes.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const usernameLower = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = await User.findOne({ usernameLower });
  if (!user || user.banned) {
    return res.status(401).render('auth/login', { title: '登录', active: 'login', error: '账号或密码错误。', next: req.body.next || '/command' });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).render('auth/login', { title: '登录', active: 'login', error: '账号或密码错误。', next: req.body.next || '/command' });
  }
  user.lastLoginAt = new Date();
  user.lastIp = req.ip;
  await user.save();
  req.session.userId = String(user._id);
  req.session.save(() => res.redirect(req.body.next || '/command'));
}));

authRoutes.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

authRoutes.use((err, req, res, next) => {
  if (!['/register', '/login'].includes(req.path)) return next(err);
  const view = req.path === '/register' ? 'auth/register' : 'auth/login';
  res.status(400).render(view, {
    title: req.path === '/register' ? '注册' : '登录',
    active: req.path.slice(1),
    error: err.message || '请求失败。',
    values: req.body || {},
    next: req.body?.next || '/command'
  });
});
