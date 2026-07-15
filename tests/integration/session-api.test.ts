import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app';
import { resetEnvForTests } from '../../src/server/env';

beforeEach(() => {
  process.env.DATABASE_URL = 'postgresql://unused';
  process.env.APP_PASSWORD = 'senha-de-teste';
  process.env.SESSION_SECRET = 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';
  process.env.PUBLIC_APP_URL = 'http://localhost:3000';
  process.env.STORAGE_MODE = 'local';
  resetEnvForTests();
});

describe('API pública e sessão', () => {
  it('expõe health sem sessão e protege dados', async () => {
    const app = createApp();
    expect((await app.request('/api/health')).status).toBe(200);
    expect((await app.request('/api/animals')).status).toBe(401);
  });

  it('recusa senha errada e cria cookie HttpOnly com a correta', async () => {
    const app = createApp();
    const wrong = await app.request('/api/session/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'errada' }) });
    expect(wrong.status).toBe(401);
    const correct = await app.request('/api/session/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'senha-de-teste' }) });
    expect(correct.status).toBe(200);
    expect(correct.headers.get('set-cookie')).toContain('HttpOnly');
    expect(correct.headers.get('set-cookie')).toContain('SameSite=Lax');
  });
});
