import { Hono } from 'hono';
import type { EarningsSummary } from '@thinkcashback/shared';
import type { AppBindings } from '../lib/context.js';
import { sessionAuth } from '../middleware/auth.js';
import { ok } from '../lib/response.js';
import type { EarningsRecord } from '../store/index.js';

export const meRoutes = new Hono<AppBindings>();

/** GET /api/v1/me — current authenticated developer. */
meRoutes.get('/me', sessionAuth, (c) => {
  const dev = c.get('developer')!;
  return ok(c, {
    id: dev.id,
    githubId: dev.githubId,
    email: dev.email,
    revShareBps: dev.revShareBps,
    status: dev.status,
    stripeConnected: dev.stripeConnectId !== null,
    createdAt: dev.createdAt.toISOString(),
  });
});

/** GET /api/v1/me/earnings — earnings summary derived from the ledger. */
meRoutes.get('/me/earnings', sessionAuth, async (c) => {
  const dev = c.get('developer')!;
  const rows = await c.get('store').earningsForDeveloper(dev.id);
  return ok(c, summarizeEarnings(rows));
});

export function summarizeEarnings(rows: EarningsRecord[]): EarningsSummary {
  let totalCents = 0;
  let pendingCents = 0;
  let paidCents = 0;
  const dailyMap = new Map<
    string,
    { impressions: number; grossCents: number; devShareCents: number }
  >();

  for (const row of rows) {
    totalCents += row.devShareCents;
    if (row.status === 'paid') paidCents += row.devShareCents;
    else pendingCents += row.devShareCents; // pending + available are not-yet-paid

    const date = row.periodStart.toISOString().slice(0, 10);
    const bucket = dailyMap.get(date) ?? { impressions: 0, grossCents: 0, devShareCents: 0 };
    bucket.impressions += row.impressionsCount;
    bucket.grossCents += row.grossCents;
    bucket.devShareCents += row.devShareCents;
    dailyMap.set(date, bucket);
  }

  const daily = [...dailyMap.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return { totalCents, pendingCents, paidCents, daily };
}
