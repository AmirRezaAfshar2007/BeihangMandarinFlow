import mongoose from 'mongoose';
import { env } from './env.ts';

mongoose.set('strictQuery', true);

let connecting: Promise<typeof mongoose> | null = null;

/**
 * Connects to MongoDB Atlas. Safe to call multiple times (e.g. in serverless
 * contexts or tests) — subsequent calls reuse the in-flight/completed connection.
 */
export function connectDB(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve(mongoose);
  }
  if (connecting) {
    return connecting;
  }

  mongoose.connection.on('connected', () => {
    console.log('[mongo] connected');
  });
  mongoose.connection.on('error', (err) => {
    console.error('[mongo] connection error:', err.message);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[mongo] disconnected');
  });

  connecting = mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10,
  }).catch((err) => {
    connecting = null; // allow a retry on the next call instead of caching a rejected promise
    if (err?.code === 'ECONNREFUSED' && err?.syscall === 'querySrv') {
      console.error(
        '[mongo] DNS SRV lookup for the mongodb+srv:// URI was refused by your network.\n' +
        '  This is common behind restrictive ISPs/firewalls (mongodb+srv relies on DNS SRV/TXT records).\n' +
        '  Fix: switch MONGODB_URI in .env to the standard mongodb:// form with explicit hosts ' +
        '(see .env.example / README for the exact string), which avoids the SRV lookup entirely.'
      );
    }
    throw err;
  });

  return connecting;
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  connecting = null;
}

export default mongoose;
