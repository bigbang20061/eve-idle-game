import mongoose from 'mongoose';
import { env } from './config/env.js';

mongoose.set('strictQuery', true);

export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  await mongoose.connect(env.mongoUri, {
    dbName: env.mongoDbName,
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 40
  });
  return mongoose.connection;
}

export async function closeDatabase() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}
