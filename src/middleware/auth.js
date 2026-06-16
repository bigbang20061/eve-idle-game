import { User, Character } from '../models/index.js';

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function requireAuth(req, res, next) {
  if (req.session?.userId) return next();
  const wantsJson = req.originalUrl.startsWith('/api') || req.get('accept')?.includes('application/json');
  if (wantsJson) return res.status(401).json({ ok: false, error: '需要登录' });
  return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}

export function requireAdmin(req, res, next) {
  if (req.user?.role === 'admin') return next();
  return res.status(403).json({ ok: false, error: '需要管理员权限。' });
}

export async function attachUser(req, res, next) {
  res.locals.user = null;
  res.locals.character = null;
  if (!req.session?.userId) return next();
  const user = await User.findById(req.session.userId).lean();
  if (!user || user.banned) {
    req.session.destroy(() => {});
    return next();
  }
  req.user = user;
  res.locals.user = user;
  next();
}

export async function attachCharacter(req, res, next) {
  if (!req.session?.userId) return next();
  const character = await Character.findOne({ userId: req.session.userId }).lean();
  req.character = character;
  res.locals.character = character;
  next();
}
