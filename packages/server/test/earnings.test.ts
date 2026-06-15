import { describe, expect, it } from 'vitest';
import { bearer, json, makeHarness } from './helpers.js';
import { summarizeEarnings } from '../src/routes/me.js';
import type { EarningsRecord } from '../src/store/index.js';

describe('GET /api/v1/me/earnings', () => {
  it('returns 401 without a session token', async () => {
    const { app } = await makeHarness();
    const res = await app.request('/api/v1/me/earnings');
    expect(res.status).toBe(401);
  });

  it('returns an earnings summary for the authenticated developer', async () => {
    const h = await makeHarness();
    h.store.seedEarnings({
      id: 'e1',
      developerId: h.developerId,
      campaignId: 'c1',
      periodStart: new Date('2026-06-01T00:00:00Z'),
      periodEnd: new Date('2026-06-02T00:00:00Z'),
      impressionsCount: 10_000,
      grossCents: 1000,
      devShareCents: 800,
      status: 'paid',
    });
    h.store.seedEarnings({
      id: 'e2',
      developerId: h.developerId,
      campaignId: 'c1',
      periodStart: new Date('2026-06-02T00:00:00Z'),
      periodEnd: new Date('2026-06-03T00:00:00Z'),
      impressionsCount: 5_000,
      grossCents: 500,
      devShareCents: 400,
      status: 'pending',
    });

    const res = await h.app.request('/api/v1/me/earnings', { headers: bearer(h.sessionToken) });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data.totalCents).toBe(1200);
    expect(body.data.paidCents).toBe(800);
    expect(body.data.pendingCents).toBe(400);
    expect(body.data.daily).toHaveLength(2);
  });

  it('GET /api/v1/me returns the developer profile', async () => {
    const h = await makeHarness();
    const res = await h.app.request('/api/v1/me', { headers: bearer(h.sessionToken) });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data.githubId).toBe('tester');
    expect(body.data.revShareBps).toBe(8000);
  });
});

describe('summarizeEarnings (unit)', () => {
  it('aggregates totals and groups by day', () => {
    const rows: EarningsRecord[] = [
      {
        id: 'a',
        developerId: 'd',
        campaignId: 'c',
        periodStart: new Date('2026-06-01T00:00:00Z'),
        periodEnd: new Date('2026-06-02T00:00:00Z'),
        impressionsCount: 100,
        grossCents: 200,
        devShareCents: 160,
        status: 'available',
      },
    ];
    const summary = summarizeEarnings(rows);
    expect(summary.totalCents).toBe(160);
    expect(summary.pendingCents).toBe(160); // available counts as not-yet-paid
    expect(summary.paidCents).toBe(0);
  });
});
