import http from 'http';
import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { env } from './config/env.js';
import { connectDatabase } from './db.js';
import { attachUser, attachCharacter } from './middleware/auth.js';
import { authApiRoutes } from './routes/authApiRoutes.js';
import { apiRoutes } from './routes/apiRoutes.js';
import { adminApiRoutes } from './routes/adminApiRoutes.js';
import { combatApiRoutes } from './routes/combatApiRoutes.js';
import { staticSdeRoutes } from './routes/staticSdeRoutes.js';
import { createSocketServer } from './socket/index.js';
import { ensureCatalogSeeded } from './services/catalog.js';
import { startGameLoop } from './services/gameEngine.js';
import { getStaticSdeStore } from './services/staticSdeStore.js';
import { User } from './models/User.js';
import { createStarterCharacter } from './services/characterFactory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const clientRoot = path.join(root, 'client');

async function maybeCreateDemoUsers() {
  if (!env.createDemoUsers) return;
  const existing = await User.findOne({ usernameLower: 'demo' });
  if (existing) return;
  const passwordHash = await bcrypt.hash('demo1234', 12);
  const user = await User.create({ username: 'demo', usernameLower: 'demo', passwordHash, role: 'player' });
  await createStarterCharacter(user, '演示克隆体');
  const adminHash = await bcrypt.hash('admin1234', 12);
  const admin = await User.create({ username: 'admin', usernameLower: 'admin', passwordHash: adminHash, role: 'admin' });
  await createStarterCharacter(admin, '空间站管理员');
  console.log('[seed] demo accounts: demo/demo1234 and admin/admin1234');
}

async function main() {
  await connectDatabase();
  if (env.sdeCacheAutoBuild) {
    try {
      const store = getStaticSdeStore({ cacheDir: env.sdeCacheDir });
      if (store.available()) console.log('[static-sde]', await store.ensureCache(env.sdeCacheDir));
    } catch (err) {
      console.warn('[static-sde] 紧凑缓存构建跳过：', err.message);
    }
  }
  if (env.autoSeed) console.log('[catalog]', await ensureCatalogSeeded());
  await maybeCreateDemoUsers();

  const app = express();
  const server = http.createServer(app);
  const sessionMiddleware = session({
    name: 'deep_sid',
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: env.mongoUri, dbName: env.mongoDbName, collectionName: 'sessions', ttl: 14 * 24 * 60 * 60 }),
    cookie: { httpOnly: true, sameSite: 'lax', secure: env.isProduction && env.publicOrigin.startsWith('https:'), maxAge: 14 * 24 * 60 * 60 * 1000 }
  });

  const io = createSocketServer(server, sessionMiddleware);
  app.set('io', io);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(express.json({ limit: '2mb' }));
  app.use(sessionMiddleware);
  app.use(attachUser);
  app.use(attachCharacter);
  app.use('/api/auth', authApiRoutes);
  app.use('/api/admin', adminApiRoutes);
  app.use('/api/combat', combatApiRoutes);
  app.use('/api/static-sde', staticSdeRoutes);
  app.use('/api', apiRoutes);
  app.use(express.static(clientRoot, { extensions: ['html'], maxAge: env.isProduction ? '1d' : 0 }));
  app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'API not found' }));
  app.use((req, res) => res.status(404).sendFile(path.join(clientRoot, '404.html')));
  app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    if (req.originalUrl.startsWith('/api')) return res.status(500).json({ ok: false, error: env.isProduction ? '服务器异常。' : err.message });
    return res.status(500).sendFile(path.join(clientRoot, '500.html'));
  });
  await startGameLoop(io, { tickMs: env.tickMs });
  server.listen(env.port, () => console.log(`EVE Idle Game listening on ${env.publicOrigin} / port ${env.port}`));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
