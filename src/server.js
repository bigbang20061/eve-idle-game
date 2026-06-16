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
import { authRoutes } from './routes/authRoutes.js';
import { pageRoutes } from './routes/pageRoutes.js';
import { apiRoutes } from './routes/apiRoutes.js';
import { adminRoutes } from './routes/adminRoutes.js';
import { createSocketServer } from './socket/index.js';
import { ensureCatalogSeeded } from './services/catalog.js';
import { startGameLoop } from './services/gameEngine.js';
import { User } from './models/User.js';
import { createStarterCharacter } from './services/characterFactory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

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
  if (env.autoSeed) {
    const summary = await ensureCatalogSeeded();
    console.log('[catalog]', summary);
  }
  await maybeCreateDemoUsers();

  const app = express();
  const server = http.createServer(app);

  const sessionMiddleware = session({
    name: 'eve_idle_game_sid',
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: env.mongoUri, dbName: env.mongoDbName, collectionName: 'sessions', ttl: 14 * 24 * 60 * 60 }),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.isProduction && env.publicOrigin.startsWith('https:'),
      maxAge: 14 * 24 * 60 * 60 * 1000
    }
  });

  const io = createSocketServer(server, sessionMiddleware);
  app.set('io', io);
  app.set('view engine', 'ejs');
  app.set('views', path.join(root, 'views'));
  app.locals.env = env;
  app.locals.formatNumber = value => Number(value || 0).toLocaleString('zh-CN');
  app.locals.shortDate = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '';

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(express.json({ limit: '2mb' }));
  app.use(sessionMiddleware);
  app.use(attachUser);
  app.use(attachCharacter);
  app.use('/public', express.static(path.join(root, 'public'), { maxAge: env.isProduction ? '7d' : 0 }));

  app.use(authRoutes);
  app.use(pageRoutes);
  app.use('/api', apiRoutes);
  app.use('/admin', adminRoutes);

  app.use((req, res) => res.status(404).render('pages/error', { title: '404', active: '', message: '没有找到这个星门。' }));
  app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    res.status(500).render('pages/error', { title: '服务器错误', active: '', message: env.isProduction ? '服务器异常。' : err.stack });
  });

  await startGameLoop(io, { tickMs: env.tickMs });

  server.listen(env.port, () => {
    console.log(`EVE Idle Game listening on ${env.publicOrigin} / port ${env.port}`);
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
