import type { MiddlewareHandler } from 'hono';
import type { AppBindings } from '../lib/context.js';
import { fail } from '../lib/response.js';

export interface RateLimitOptions {
  /** Unique bucket name, e.g. 'ad' or 'impressions'. */
  bucket: string;
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

/**
 * Fixed-window rate limiter backed by the CounterStore (Redis in prod,
 * in-memory in dev/tests). Keyed by authenticated developer id when present,
 * otherwise by client IP.
 */
export function rateLimit(opts: RateLimitOptions): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const counters = c.get('counters');
    const developer = c.get('developer');
    const identity =
      developer?.id ??
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      c.req.header('x-real-ip') ??
      'anonymous';
    const key = `rl:${opts.bucket}:${identity}`;

    const count = await counters.incrWithTtl(key, opts.windowSeconds);
    c.header('X-RateLimit-Limit', String(opts.limit));
    c.header('X-RateLimit-Remaining', String(Math.max(0, opts.limit - count)));

    if (count > opts.limit) {
      c.header('Retry-After', String(opts.windowSeconds));
      return fail(c, 429, 'RATE_LIMITED', 'Too many requests, slow down');
    }
    await next();
  };
}
