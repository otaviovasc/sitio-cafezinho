import { randomUUID } from 'node:crypto';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { requireSession } from './auth.js';
import { ApiError } from './http/api-error.js';
import { animalRoutes } from './routes/animals.routes.js';
import { attachmentRoutes } from './routes/attachments.routes.js';
import { dashboardRoutes } from './routes/dashboard.routes.js';
import { dailyMilkRoutes } from './routes/daily-milk.routes.js';
import { herdGroupRoutes } from './routes/herd-groups.routes.js';
import { milkRoutes } from './routes/milk.routes.js';
import { purchaseRoutes } from './routes/purchases.routes.js';
import { sessionRoutes } from './routes/session.routes.js';
import { supplierRoutes } from './routes/suppliers.routes.js';
import { systemRoutes } from './routes/system.routes.js';
import { weightRoutes } from './routes/weights.routes.js';

export function createApp() {
  const app = new Hono();

  app.use('*', async (c, next) => {
    c.header('x-request-id', c.req.header('x-request-id') ?? randomUUID());
    await next();
  });
  app.use('/api/*', logger());

  app.route('/api', systemRoutes);
  app.route('/api/session', sessionRoutes);
  app.use('/api/*', requireSession);
  app.route('/api', animalRoutes);
  app.route('/api', herdGroupRoutes);
  app.route('/api', milkRoutes);
  app.route('/api', dailyMilkRoutes);
  app.route('/api', supplierRoutes);
  app.route('/api', purchaseRoutes);
  app.route('/api', attachmentRoutes);
  app.route('/api', dashboardRoutes);
  app.route('/api', weightRoutes);

  app.onError((error, c) => {
    const known = error instanceof ApiError;
    const status = known ? error.status : 500;
    const requestId = c.res.headers.get('x-request-id');
    if (!known) console.error(`[${requestId}] Erro interno:`, error.message);
    return c.json({
      error: {
        code: known ? error.code : 'INTERNAL_ERROR',
        message: known ? error.message : 'Ocorreu um erro interno.',
        requestId,
      },
    }, status);
  });

  app.use('/assets/*', serveStatic({ root: './dist/client' }));
  app.get('*', serveStatic({ path: './dist/client/index.html' }));
  return app;
}
