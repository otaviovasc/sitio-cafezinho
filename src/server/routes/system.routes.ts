import { Hono } from 'hono';
import { getPool } from '../../db/client.js';

export const systemRoutes = new Hono()
  .get('/health', (c) => c.json({ status: 'ok' }))
  .get('/ready', async (c) => {
    try {
      await getPool().query('select 1');
      return c.json({ status: 'ready', database: 'ok' });
    } catch {
      return c.json({ status: 'not_ready', database: 'error' }, 503);
    }
  });
