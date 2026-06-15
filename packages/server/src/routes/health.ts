import { Hono } from 'hono';
import type { AppBindings } from '../lib/context.js';

export const healthRoutes = new Hono<AppBindings>();

/** Liveness + dependency readiness. Returns 200 only when the store responds. */
healthRoutes.get('/health', async (c) => {
  let dbOk = false;
  try {
    dbOk = await c.get('store').ping();
  } catch {
    dbOk = false;
  }
  const status = dbOk ? 200 : 503;
  return c.json(
    {
      status: dbOk ? 'ok' : 'degraded',
      checks: { store: dbOk ? 'up' : 'down' },
      uptimeSeconds: Math.round(process.uptime()),
    },
    status,
  );
});
