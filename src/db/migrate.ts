import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDb, getDb } from './client.js';

try {
  await migrate(getDb(), { migrationsFolder: 'drizzle' });
  console.log('Migrations aplicadas.');
} finally {
  await closeDb();
}
