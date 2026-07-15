import { serve } from '@hono/node-server';
import { closeDb } from '../db/client.js';
import { createApp } from './app.js';
import { env } from './env.js';

const config = env();
const server = serve({ fetch: createApp().fetch, port: config.PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`Sítio Cafezinho em http://0.0.0.0:${info.port}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} recebido; encerrando.`);
  server.close(async () => {
    await closeDb();
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
