import express from 'express';
import fs from 'fs';
import http from 'node:http';
import path from 'path';
import { excelRouter } from './server/excel_routes.ts';

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '15mb' }));

  app.use('/api/excel', excelRouter);

  const distDir = path.resolve(process.cwd(), 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(path.join(distDir, 'index.html'));

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`SSM CRM server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start SSM CRM server:', err);
  process.exit(1);
});
