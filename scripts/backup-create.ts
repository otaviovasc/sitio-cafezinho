import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { postgresEnvironment, requiredDatabaseUrl } from './postgres-cli.js';

const requested = process.argv.find((argument) => argument.startsWith('--file='))?.slice('--file='.length);
const timestamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
const target = resolve(requested || `backups/sitio-${timestamp}.dump`);
if (existsSync(target) && !process.argv.includes('--force')) throw new Error(`O arquivo já existe: ${target}. Use outro caminho ou --force.`);
mkdirSync(resolve(target, '..'), { recursive: true });
const result = spawnSync('pg_dump', ['--format=custom', '--file', target], { env: postgresEnvironment(requiredDatabaseUrl()), stdio: 'inherit' });
if (result.error) throw new Error(`Não foi possível executar pg_dump: ${result.error.message}`);
if (result.status !== 0) throw new Error(`pg_dump falhou com código ${result.status}.`);
const validation = spawnSync('pg_restore', ['--list', target], { env: postgresEnvironment(requiredDatabaseUrl()), stdio: 'ignore' });
if (validation.status !== 0) throw new Error('O arquivo foi criado, mas falhou na validação do pg_restore.');
console.log(`Backup criado e validado: ${target}`);
