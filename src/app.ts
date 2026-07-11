import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import { env } from './config/env.ts';
import { generalLimiter } from './middleware/rateLimit.ts';
import { errorHandler, notFound } from './middleware/errorHandler.ts';
import authRoutes from './routes/auth.routes.ts';
import characterRoutes from './routes/characters.routes.ts';
import practiceRoutes from './routes/practice.routes.ts';
import statsRoutes from './routes/stats.routes.ts';
import adminRoutes from './routes/admin.routes.ts';
import hanziDataRoutes from './routes/hanziData.routes.ts';

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
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: env.isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        connectSrc: env.isProduction ? ["'self'"] : ["'self'", 'ws:', 'wss:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
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
app.use(express.json({ limit: '1mb' }));

// Strips any request key starting with "$" or containing "." to block
// NoSQL/operator-injection payloads like { "studentId": { "$ne": null } }.
app.use(mongoSanitize());

app.use('/api', generalLimiter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', env: env.nodeEnv }));

app.use('/api/auth', authRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/hanzi-data', hanziDataRoutes);

app.use('/api', notFound);
app.use(errorHandler);

export default app;
