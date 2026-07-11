import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { env } from './src/config/env.ts';
import { connectDB } from './src/config/database.ts';
import app from './src/app.ts';

async function startServer() {
  await connectDB();

  if (!env.isProduction) {
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

  app.listen(env.port, '0.0.0.0', () => {
    console.log(`Beihang Mandarin Flow server running on http://0.0.0.0:${env.port} [${env.nodeEnv}]`);
  });
}

startServer().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
