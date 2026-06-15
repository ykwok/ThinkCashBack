import { Hono } from 'hono';
import type { EarningsSummary } from '@thinkcashback/shared';
import type { AppBindings } from '../lib/context.js';
import { sessionAuth } from '../middleware/auth.js';
import { ok } from '../lib/response.js';
import { millicentsToCents } from '../lib/earnings.js';
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
  // Accumulate in millicents (integer) to preserve sub-cent precision, then
  // convert to cents once at the end. A single impression earns a sub-cent
  // amount, so summing rounded cents would discard it. Legacy/seeded rows that
  // only carry the cents columns fall back to `*Cents * 1000`.
  const gross = (r: EarningsRecord) => r.grossMillicents ?? r.grossCents * 1000;
  const share = (r: EarningsRecord) => r.devShareMillicents ?? r.devShareCents * 1000;

  let totalMillicents = 0;
  let pendingMillicents = 0;
  let paidMillicents = 0;
  const dailyMap = new Map<
    string,
    { impressions: number; grossMillicents: number; devShareMillicents: number }
  >();

  for (const row of rows) {
    totalMillicents += share(row);
    if (row.status === 'paid') paidMillicents += share(row);
    else pendingMillicents += share(row); // pending + available are not-yet-paid

    const date = row.periodStart.toISOString().slice(0, 10);
    const bucket = dailyMap.get(date) ?? {
      impressions: 0,
      grossMillicents: 0,
      devShareMillicents: 0,
    };
    bucket.impressions += row.impressionsCount;
    bucket.grossMillicents += gross(row);
    bucket.devShareMillicents += share(row);
    dailyMap.set(date, bucket);
  }

  const daily = [...dailyMap.entries()]
    .map(([date, v]) => ({
      date,
      impressions: v.impressions,
      grossCents: millicentsToCents(v.grossMillicents),
      devShareCents: millicentsToCents(v.devShareMillicents),
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return {
    totalCents: millicentsToCents(totalMillicents),
    pendingCents: millicentsToCents(pendingMillicents),
    paidCents: millicentsToCents(paidMillicents),
    daily,
  };
}
