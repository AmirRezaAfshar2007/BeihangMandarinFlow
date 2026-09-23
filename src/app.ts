import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import { env } from './config/env.ts';
import { generalLimiter } from './middleware/rateLimit.ts';
import { errorHandler, notFound } from './middleware/errorHandler.ts';
import { getSpeakingPoolStats } from './services/speaking.service.ts';
import authRoutes from './routes/auth.routes.ts';
import characterRoutes from './routes/characters.routes.ts';
import practiceRoutes from './routes/practice.routes.ts';
import statsRoutes from './routes/stats.routes.ts';
import adminRoutes from './routes/admin.routes.ts';
import hanziDataRoutes from './routes/hanziData.routes.ts';
import folderRoutes from './routes/folders.routes.ts';
import speakingRoutes from './routes/speaking.routes.ts';
import learningRoutes from './routes/learning.routes.ts';
import schoolRoutes from './routes/school.routes.ts';
import homeRoutes from './routes/home.routes.ts';

const app = express();

// Render (and most PaaS) sit behind a reverse proxy; without this,
// express-rate-limit and req.ip see the proxy's IP for every request.
app.set('trust proxy', 1);

// Helmet's default Content-Security-Policy only allows scripts/styles/data
// from our own origin ('self'). HanziWriter used to be loaded from jsdelivr
// via a <script> tag in index.html, which required allowlisting that CDN in
// script-src. It is now installed as an npm package and bundled into our own
// JS by Vite (import HanziWriter from 'hanzi-writer'), so the library code
// ships from 'self' like the rest of the app.
// IMPORTANT: HanziWriter also fetches per-character stroke data (the actual
// path data used to draw/animate each character) from jsdelivr *at runtime*
// by default, completely independent of how the library itself was loaded.
// That runtime fetch is proxied through our own /api/hanzi-data/:char route
// (see routes/hanziData.routes.ts), which fetches from jsdelivr server-side
// and returns it same-origin. That's why connect-src can stay locked to
// 'self' with no CDN exception - the browser never talks to jsdelivr
// directly for either the script or the stroke data.
// React's inline `style={{...}}` attributes still require 'unsafe-inline' in
// style-src, or every component using them silently loses its styling.
// In development we additionally allow 'unsafe-eval' and a loosened
// connect-src, because Vite's dev server injects an inline HMR client script
// that needs eval, and opens a WebSocket back to itself for live-reload.
//
// media-src MUST list 'blob:', or no recorded audio can ever be played.
//
// The School section records voice in the browser with MediaRecorder and
// plays it back from an object URL — both for the student previewing their own
// take and for the teacher listening to a student's submission. Those bytes
// are deliberately fetched with the Bearer token and turned into a `blob:` URL
// (a raw media URL cannot carry an Authorization header, and an
// unauthenticated one would expose student recordings). Without an explicit
// media-src, that directive falls back to default-src 'self' and the browser
// refuses to load the blob — the recording looks lost even though it was
// captured correctly.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: env.isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        connectSrc: env.isProduction ? ["'self'"] : ["'self'", 'ws:', 'wss:'],
        // Google Fonts is allowlisted in style-src/font-src (and preconnected
        // in index.html). Without this the production policy blocks the
        // stylesheet link outright, so the app silently renders in fallback
        // system fonts and every page logs CSP violations — while development,
        // which allows 'unsafe-inline' plus a looser policy, looked correct.
        // If the CDN is unreachable (some campus networks) index.html's
        // font-display swap still degrades to system fonts cleanly.
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:'],
        mediaSrc: ["'self'", 'blob:'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      },
    },
  })
);
app.use(
  cors({
    origin: env.corsOrigin ? env.corsOrigin.split(',').map((o) => o.trim()) : true,
    credentials: true,
  })
);
// Base64-encoded voice recordings from the AI Speaking Coach are the largest
// payloads the API accepts, so the limit is sized for a few minutes of
// compressed audio rather than typical JSON request bodies. This is the hard
// ceiling on how much a single request can make the server buffer, which is
// why it is kept as low as the largest legitimate payload allows (the
// per-route cap in speaking.routes.ts is lower still — see
// MAX_SPEAKING_AUDIO_BASE64). Oversized bodies are answered with 413 by
// errorHandler, not a generic 500.
app.use(express.json({ limit: '10mb' }));

// Strips any request key starting with "$" or containing "." to block
// NoSQL/operator-injection payloads like { "studentId": { "$ne": null } }.
app.use(mongoSanitize());

/**
 * Health check used by the platform (see healthCheckPath in render.yaml).
 *
 * Registered BEFORE the rate limiter on purpose: an endpoint whose whole job
 * is to answer "is this process alive?" must never be able to answer 429 — a
 * monitoring probe that gets throttled looks exactly like a dead service.
 *
 * It reports the database state and the heavy-work pools rather than just
 * "ok", so an operator can see *why* the app is unhealthy instead of guessing.
 * It still returns 200 while the database is briefly unavailable: this probe
 * drives automatic restarts, and restarting a perfectly healthy Node process
 * because Atlas blipped would turn a short outage into a long one. Real
 * database failures surface as 5xx on the affected routes instead.
 */
app.get('/api/health', (_req, res) => {
  const READY_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({
    status: 'ok',
    env: env.nodeEnv,
    uptimeSeconds: Math.round(process.uptime()),
    db: READY_STATES[mongoose.connection.readyState] ?? 'unknown',
    memoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    pools: getSpeakingPoolStats(),
  });
});

app.use('/api', generalLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/speaking', speakingRoutes);
app.use('/api/learning', learningRoutes);
app.use('/api/school', schoolRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/hanzi-data', hanziDataRoutes);

app.use('/api', notFound);
app.use(errorHandler);

export default app;
