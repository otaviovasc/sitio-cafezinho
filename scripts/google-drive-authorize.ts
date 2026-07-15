import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import process from 'node:process';
import { google } from 'googleapis';

try { process.loadEnvFile?.('.env'); } catch { /* Variáveis também podem vir do shell. */ }

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env antes de continuar.');
  process.exit(1);
}

const port = 53682;
const redirectUri = `http://127.0.0.1:${port}/oauth2/callback`;
const state = randomBytes(24).toString('hex');
const oauth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const url = oauth.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  include_granted_scopes: true,
  scope: ['https://www.googleapis.com/auth/drive.file', 'openid', 'email'],
  state,
});

console.log('\nAbra esta URL no navegador e autorize a conta que será usada pelo sistema:\n');
console.log(url);
console.log(`\nAguardando retorno em ${redirectUri} ...`);

const code = await new Promise<string>((resolve, reject) => {
  const timer = setTimeout(() => {
    server.close();
    reject(new Error('A autorização expirou após 10 minutos. Execute o comando novamente.'));
  }, 10 * 60 * 1000);
  const server = createServer((request, response) => {
    const callback = new URL(request.url || '/', redirectUri);
    if (callback.pathname !== '/oauth2/callback') { response.writeHead(404).end('Não encontrado'); return; }
    if (callback.searchParams.get('state') !== state) {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('State inválido. Feche esta aba e tente novamente.');
      clearTimeout(timer); server.close(); reject(new Error('State OAuth inválido.')); return;
    }
    const value = callback.searchParams.get('code');
    if (!value) {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('Código ausente. Feche esta aba e tente novamente.');
      clearTimeout(timer); server.close(); reject(new Error('O Google não retornou um código.')); return;
    }
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('Autorização concluída. Volte ao terminal.');
    clearTimeout(timer); server.close(); resolve(value);
  });
  server.listen(port, '127.0.0.1');
});

const { tokens } = await oauth.getToken(code);
if (!tokens.refresh_token) {
  console.error('O Google não retornou refresh token. Revogue o acesso anterior e execute novamente.');
  process.exit(1);
}

console.log('\nAutorização concluída. Copie estas variáveis para o serviço da aplicação no Railway:');
console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
console.log('GOOGLE_DRIVE_FOLDER_ID=<ID da pasta criada por vocês no Google Drive>');
console.log('\nO ID da pasta é o trecho após /folders/ na URL do Drive. Não salve este terminal em logs.');
