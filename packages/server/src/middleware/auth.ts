import type { MiddlewareHandler } from 'hono';
import { sha256 } from '@thinkcashback/shared';
import type { AppBindings } from '../lib/context.js';
import { fail } from '../lib/response.js';
import { verifySession } from '../lib/jwt.js';

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * API-key auth for client/SDK endpoints (ad serving, impression reporting).
 * The raw key is hashed and looked up; we never store or compare plaintext.
 */
export const apiKeyAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  const token = bearerToken(c.req.header('authorization'));
  if (!token) {
    return fail(c, 401, 'UNAUTHENTICATED', 'Missing or malformed Authorization header');
  }
  const store = c.get('store');
  const developer = await store.getDeveloperByApiKeyHash(sha256(token));
  if (!developer) {
    return fail(c, 401, 'INVALID_API_KEY', 'API key is not recognised');
  }
  if (developer.status !== 'active') {
    return fail(c, 403, 'DEVELOPER_SUSPENDED', 'Developer account is not active');
  }
  c.set('developer', developer);
  await next();
};

/**
 * Session (JWT) auth for dashboard / user endpoints (me, earnings, campaigns).
 */
export const sessionAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  const token = bearerToken(c.req.header('authorization'));
  if (!token) {
    return fail(c, 401, 'UNAUTHENTICATED', 'Missing or malformed Authorization header');
  }
  const env = c.get('env');
  let developerId: string;
  try {
    const claims = await verifySession(env.JWT_SECRET, token);
    developerId = claims.sub;
  } catch {
    return fail(c, 401, 'INVALID_SESSION', 'Session token is invalid or expired');
  }
  const developer = await c.get('store').getDeveloperById(developerId);
  if (!developer) {
    return fail(c, 401, 'INVALID_SESSION', 'Session subject no longer exists');
  }
  c.set('developer', developer);
  await next();
};
