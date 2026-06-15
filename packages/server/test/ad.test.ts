import { describe, expect, it } from 'vitest';
import { bearer, json, makeHarness } from './helpers.js';

describe('GET /api/v1/ad', () => {
  it('returns 401 without an API key', async () => {
    const { app } = await makeHarness();
    const res = await app.request('/api/v1/ad?platform=darwin');
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rotates among eligible campaigns weighted by bid (higher bid wins more often)', async () => {
    const h = await makeHarness();
    const advertiser = await h.store.createAdvertiser({ name: 'A', email: 'a@x.com' });
    await h.store.createCampaign({
      advertiserId: advertiser.id,
      headline: 'Low bid',
      targetUrl: 'https://example.com/low',
      cpmBidCents: 80,
      dailyBudgetCents: 10_000,
      targetingCountries: [],
      targetingPlatforms: ['darwin'],
    });
    await h.store.createCampaign({
      advertiserId: advertiser.id,
      headline: 'High bid',
      targetUrl: 'https://example.com/high',
      cpmBidCents: 200,
      dailyBudgetCents: 10_000,
      targetingCountries: [],
      targetingPlatforms: ['darwin'],
    });

    const counts: Record<string, number> = { 'Low bid': 0, 'High bid': 0 };
    // Stay under the /ad rate limit (120 / 60s) while keeping a stable sample.
    for (let i = 0; i < 90; i++) {
      const res = await app(h).request('/api/v1/ad?platform=darwin&country=US', {
        headers: bearer(h.apiKey),
      });
      expect(res.status).toBe(200);
      const body = await json(res);
      counts[body.data.headline] += 1;
    }
    // Both campaigns get served (rotation happens), and the higher bid dominates.
    expect(counts['High bid']).toBeGreaterThan(0);
    expect(counts['Low bid']).toBeGreaterThan(0);
    expect(counts['High bid']).toBeGreaterThan(counts['Low bid']);
  });

  it('filters out campaigns that do not target the requested platform', async () => {
    const h = await makeHarness();
    const advertiser = await h.store.createAdvertiser({ name: 'A', email: 'a@x.com' });
    await h.store.createCampaign({
      advertiserId: advertiser.id,
      headline: 'Linux only',
      targetUrl: 'https://example.com/linux',
      cpmBidCents: 200,
      dailyBudgetCents: 10_000,
      targetingCountries: [],
      targetingPlatforms: ['linux'],
    });

    const res = await app(h).request('/api/v1/ad?platform=darwin', {
      headers: bearer(h.apiKey),
    });
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.error.code).toBe('NO_FILL');
  });

  it('rejects an invalid platform with 422', async () => {
    const h = await makeHarness();
    const res = await app(h).request('/api/v1/ad?platform=bsd', {
      headers: bearer(h.apiKey),
    });
    expect(res.status).toBe(422);
  });
});

// small helper so each test reads `app(h)` consistently
function app(h: Awaited<ReturnType<typeof makeHarness>>) {
  return h.app;
}
