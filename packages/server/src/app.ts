import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import type { AppBindings, AppDeps } from './lib/context.js';
import { fail } from './lib/response.js';
import { adRoutes } from './routes/ad.js';
import { authRoutes } from './routes/auth.js';
import { billingRoutes } from './routes/billing.js';
import { campaignRoutes } from './routes/campaigns.js';
import { deviceRoutes } from './routes/devices.js';
import { healthRoutes } from './routes/health.js';
import { impressionRoutes } from './routes/impressions.js';
import { meRoutes } from './routes/me.js';
import { payoutRoutes } from './routes/payouts.js';
import { webhookRoutes } from './routes/webhooks.js';

/**
 * Build the Hono application with its dependencies injected. Tests call this
 * with a MemoryStore; production calls it with the Postgres-backed store.
 */
export function createApp(deps: AppDeps): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  if (deps.env.NODE_ENV !== 'test') app.use('*', logger());
  app.use('*', secureHeaders());

  // Dependency injection: expose env/store/counters on every request context.
  app.use('*', async (c, next) => {
    c.set('env', deps.env);
    c.set('store', deps.store);
    c.set('counters', deps.counters);
    c.set('stripe', deps.stripe);
    await next();
  });

  // Health is unauthenticated and mounted at the root.
  app.route('/', healthRoutes);

  // Versioned API surface.
  const v1 = new Hono<AppBindings>();
  v1.route('/', adRoutes);
  v1.route('/', impressionRoutes);
  v1.route('/', authRoutes);
  v1.route('/', meRoutes);
  v1.route('/', deviceRoutes);
  v1.route('/', campaignRoutes);
  v1.route('/', billingRoutes);
  v1.route('/', payoutRoutes);
  v1.route('/', webhookRoutes);
  app.route('/api/v1', v1);

  app.notFound((c) => fail(c, 404, 'NOT_FOUND', 'Resource not found'));

  app.onError((err, c) => {
    // Never leak internals; log server-side, return a generic envelope.
    console.error('[unhandled]', err);
    return fail(c, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  });

  return app;
}
