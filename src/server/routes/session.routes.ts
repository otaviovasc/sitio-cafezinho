import { Hono } from 'hono';
import { z } from 'zod';
import {
  clearLoginFailures,
  clearSession,
  isAuthenticated,
  loginAllowed,
  passwordMatches,
  recordLoginFailure,
  setSession,
} from '../auth.js';
import { readJson, validate } from '../http/validation.js';

export const sessionRoutes = new Hono()
  .post('/login', async (c) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'local';
    if (!loginAllowed(ip)) return c.json({ error: { code: 'TOO_MANY_ATTEMPTS', message: 'Muitas tentativas. Aguarde alguns minutos.' } }, 429);
    const body = validate(z.object({ password: z.string() }), await readJson(c));
    if (!passwordMatches(body.password)) {
      recordLoginFailure(ip);
      return c.json({ error: { code: 'INVALID_CREDENTIALS', message: 'Senha incorreta.' } }, 401);
    }
    clearLoginFailures(ip);
    setSession(c);
    return c.json({ authenticated: true });
  })
  .get('/', (c) => c.json({ authenticated: isAuthenticated(c) }))
  .post('/logout', (c) => {
    clearSession(c);
    return c.json({ authenticated: false });
  });
