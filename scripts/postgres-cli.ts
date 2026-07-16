import process from 'node:process';

try { process.loadEnvFile?.('.env'); } catch { /* Variáveis podem ser injetadas pelo ambiente. */ }

export function postgresEnvironment(databaseUrl: string) {
  const url = new URL(databaseUrl);
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') throw new Error('DATABASE_URL deve usar postgresql://.');
  const database = url.pathname.replace(/^\//, '');
  if (!database) throw new Error('DATABASE_URL não informa o banco.');
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(database),
    ...(url.searchParams.get('sslmode') ? { PGSSLMODE: url.searchParams.get('sslmode')! } : {}),
  };
}

export function requiredDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL não foi configurada.');
  return value;
}
