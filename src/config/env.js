import dotenv from 'dotenv';

dotenv.config();

const intEnv = (name, fallback) => {
  const raw = process.env[name];
  const value = raw ? Number.parseInt(raw, 10) : fallback;
  return Number.isFinite(value) ? value : fallback;
};

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: intEnv('PORT', 3000),
  publicOrigin: process.env.PUBLIC_ORIGIN || 'http://localhost:3000',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eve_idle_game',
  mongoDbName: process.env.MONGO_DB_NAME || 'eve_idle_game',
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-change-me',
  tickMs: intEnv('TICK_MS', 5000),
  autoSeed: process.env.AUTO_SEED !== 'false',
  createDemoUsers: process.env.CREATE_DEMO_USERS !== 'false',
  adminInviteCode: process.env.ADMIN_INVITE_CODE || ''
});
