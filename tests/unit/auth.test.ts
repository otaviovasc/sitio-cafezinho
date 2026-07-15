import { beforeEach, describe, expect, it } from 'vitest';
import { createSessionToken, passwordMatches, verifySessionToken } from '../../src/server/auth';
import { resetEnvForTests } from '../../src/server/env';

beforeEach(() => {
  process.env.DATABASE_URL = 'postgresql://unused';
  process.env.APP_PASSWORD = 'senha-de-teste';
  process.env.SESSION_SECRET = 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';
  process.env.PUBLIC_APP_URL = 'http://localhost:3000';
  process.env.STORAGE_MODE = 'local';
  resetEnvForTests();
});

describe('senha e sessão compartilhada', () => {
  it('compara a senha sem aceitar aproximações', () => {
    expect(passwordMatches('senha-de-teste')).toBe(true);
    expect(passwordMatches('senha-de-test')).toBe(false);
  });

  it('assina, valida e expira sessão', () => {
    const token = createSessionToken(1_000);
    expect(verifySessionToken(token, 2_000)).toBe(true);
    expect(verifySessionToken(token, 1_000 + 31 * 24 * 60 * 60 * 1000)).toBe(false);
    expect(verifySessionToken(`${token}x`, 2_000)).toBe(false);
  });
});
