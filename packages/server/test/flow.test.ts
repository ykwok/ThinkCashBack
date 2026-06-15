import { describe, expect, it } from 'vitest';
import { bearer, json, makeHarness } from './helpers.js';

describe('end-to-end developer flow', () => {
  it('GET /health returns 200', async () => {
    const { app } = await makeHarness();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect((await json(res)).status).toBe('ok');
  });

  it('logs in via the GitHub dev shortcut and provisions credentials', async () => {
    const { app } = await makeHarness();
    const res = await app.request('/api/v1/auth/github', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'dev:99001:newdev@example.com' }),
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.data.token).toBeTruthy();
    expect(body.data.credentials.apiKey).toBeTruthy();
    expect(body.data.credentials.signingSecret).toBeTruthy();
  });

  it('creates a campaign and reads its stats', async () => {
    const h = await makeHarness();
    const createRes = await h.app.request('/api/v1/campaigns', {
      method: 'POST',
      headers: { ...bearer(h.sessionToken), 'content-type': 'application/json' },
      body: JSON.stringify({
        headline: 'Buy our thing',
        target_url: 'https://example.com/buy',
        cpm_bid_cents: 120,
        daily_budget_cents: 20_000,
        targeting_countries: ['us'],
        targeting_platforms: ['darwin'],
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await json(createRes);
    expect(created.data.targetingCountries).toEqual(['US']);

    const statsRes = await h.app.request(`/api/v1/campaigns/${created.data.id}/stats`, {
      headers: bearer(h.sessionToken),
    });
    expect(statsRes.status).toBe(200);
    expect((await json(statsRes)).data.impressions).toBe(0);
  });

  it('rejects campaign creation without a session (401)', async () => {
    const { app } = await makeHarness();
    const res = await app.request('/api/v1/campaigns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });
});
