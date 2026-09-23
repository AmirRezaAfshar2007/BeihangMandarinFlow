import path from 'path';
import http from 'node:http';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { env } from './src/config/env.ts';
import { configureNetwork } from './src/config/network.ts';
import { connectDB, disconnectDB } from './src/config/database.ts';
import { sweepStaleTempAudio } from './src/utils/tempFiles.ts';
import app from './src/app.ts';

// Configures the global fetch dispatcher (proxy/timeout/IPv4 preference).
// Safe to run here even though ES module imports above already finished
// loading — none of them call fetch() at import time, only later when a
// request actually triggers an AI call, which is always after this runs.
configureNetwork();

// A promise that rejects with nothing awaiting it terminates a modern Node
// process by default. On a single instance that takes every student's
// in-flight request down with it, for what is usually one stray write or
// stream error. These log loudly and keep serving; genuine startup failures
// still exit via the catch at the bottom of this file.
process.on('unhandledRejection', (reason) => {
  console.error('[fatal-guard] Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[fatal-guard] Uncaught exception:', err);
});

async function startServer() {
  // Scratch files left behind by a previous run — the process being killed
  // between ffmpeg writing its working files and deleting them — are cleared
  // before any traffic is served. Best-effort; never blocks startup.
  await sweepStaleTempAudio();

  await connectDB();

  if (!env.isProduction) {
    console.warn(
      '[server] NODE_ENV is not "production": starting the Vite dev middleware in-process. ' +
        'This mode is for local development only — a deployed environment must set NODE_ENV=production, ' +
        'otherwise every request pays the dev server\'s memory and CPU cost.'
    );
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = http.createServer(app);

  // Sockets that go quiet used to be held open indefinitely, each one pinning
  // memory and a connection slot on an instance that cannot spare either. The
  // generous request budget covers slow uploads and AI calls; the keep-alive
  // window is set just above the platform proxy's idle timeout (Render closes
  // idle connections at ~60s) so the server is never the one that surprises a
  // client with a closed socket.
  server.requestTimeout = 5 * 60 * 1000;
  server.headersTimeout = 60 * 1000;
  server.keepAliveTimeout = 65 * 1000;

  server.listen(env.port, '0.0.0.0', () => {
    console.log(`Beihang Mandarin Flow server running on http://0.0.0.0:${env.port} [${env.nodeEnv}]`);
    console.log(
      `[server] heavy-work pools: ffmpeg=${env.ffmpegConcurrency}, ai=${env.aiConcurrency} ` +
        '(tune with FFMPEG_CONCURRENCY / AI_CONCURRENCY)'
    );
  });

  /**
   * Graceful shutdown.
   *
   * Render sends SIGTERM on every deploy, restart and scale event. Without a
   * handler the process is killed mid-request: answers already being written
   * are truncated, and pooled MongoDB connections are left for Atlas to reap on
   * a timeout instead of being closed on the way out. The hard deadline below
   * guarantees a single stuck connection can never block a deploy forever.
   */
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal} received — finishing in-flight requests, then exiting.`);

    const forceExit = setTimeout(() => {
      console.warn('[server] Graceful shutdown timed out; exiting immediately.');
      process.exit(1);
    }, 15_000);
    forceExit.unref();

    server.close(async () => {
      try {
        await disconnectDB();
      } catch (err) {
        console.error('[server] Error while closing the database connection:', err);
      }
      clearTimeout(forceExit);
      console.log('[server] Shutdown complete.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
