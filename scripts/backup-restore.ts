import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { postgresEnvironment, requiredDatabaseUrl } from './postgres-cli.js';

const requested = process.argv.find((argument) => argument.startsWith('--file='))?.slice('--file='.length);
if (!requested) throw new Error('Informe o arquivo: pnpm backup:restore --file=<arquivo>');
const source = resolve(requested);
if (!existsSync(source)) throw new Error(`Arquivo não encontrado: ${source}`);
const databaseUrl = requiredDatabaseUrl();
const environment = postgresEnvironment(databaseUrl);
const validation = spawnSync('pg_restore', ['--list', source], { env: environment, stdio: 'ignore' });
if (validation.error) throw new Error(`Não foi possível executar pg_restore: ${validation.error.message}`);
if (validation.status !== 0) throw new Error('O arquivo não é um backup PostgreSQL custom válido.');

let confirmed = process.argv.includes('--confirm');
if (!confirmed && process.stdin.isTTY) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question('A restauração substituirá os dados do DATABASE_URL. Digite RESTAURAR para continuar: ');
  prompt.close();
  confirmed = answer === 'RESTAURAR';
}
if (!confirmed) throw new Error('Restauração cancelada. Em automação controlada, use --confirm após conferir DATABASE_URL e o arquivo.');

const result = spawnSync('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--exit-on-error', '--dbname', environment.PGDATABASE!, source], { env: environment, stdio: 'inherit' });
if (result.status !== 0) throw new Error(`pg_restore falhou com código ${result.status}.`);
console.log('Backup restaurado e validado pelo pg_restore.');
