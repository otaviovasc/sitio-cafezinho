import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { env } from './env.js';

const COOKIE_NAME = 'sitio_session';
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

function sign(value: string) {
  return createHmac('sha256', env().SESSION_SECRET).update(value).digest('base64url');
}

export function createSessionToken(now = Date.now()) {
  const expiresAt = now + THIRTY_DAYS_SECONDS * 1000;
  const payload = String(expiresAt);
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()) {
  if (!token) return false;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra || !/^\d+$/.test(payload) || Number(payload) <= now) return false;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function passwordMatches(candidate: string) {
  const expected = Buffer.from(env().APP_PASSWORD);
  const received = Buffer.from(candidate);
  if (expected.length !== received.length) {
    timingSafeEqual(expected, Buffer.alloc(expected.length));
    return false;
  }
  return timingSafeEqual(expected, received);
}

export function setSession(c: Context) {
  setCookie(c, COOKIE_NAME, createSessionToken(), {
    httpOnly: true,
    sameSite: 'Lax',
    secure: env().NODE_ENV === 'production',
    maxAge: THIRTY_DAYS_SECONDS,
    path: '/',
  });
}

export function clearSession(c: Context) {
  deleteCookie(c, COOKIE_NAME, { path: '/' });
}

export function isAuthenticated(c: Context) {
  return verifySessionToken(getCookie(c, COOKIE_NAME));
}

export const requireSession: MiddlewareHandler = async (c, next) => {
  if (!isAuthenticated(c)) return c.json({ error: { code: 'UNAUTHORIZED', message: 'Entre novamente para continuar.' } }, 401);
  await next();
};

type Attempt = { count: number; resetAt: number };
const attempts = new Map<string, Attempt>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function loginAllowed(ip: string, now = Date.now()) {
  const current = attempts.get(ip);
  if (!current || current.resetAt <= now) {
    attempts.set(ip, { count: 0, resetAt: now + WINDOW_MS });
    return true;
  }
  return current.count < MAX_ATTEMPTS;
}

export function recordLoginFailure(ip: string, now = Date.now()) {
  const current = attempts.get(ip);
  if (!current || current.resetAt <= now) attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else current.count += 1;
}

export function clearLoginFailures(ip: string) {
  attempts.delete(ip);
}
