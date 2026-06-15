import { describe, expect, it } from 'vitest';
import { hmacSign, impressionSigningPayload } from '@thinkcashback/shared';
import { bearer, json, makeHarness, type Harness } from './helpers.js';
import { summarizeEarnings } from '../src/routes/me.js';
import {
  impressionDevShareMillicents,
  impressionGrossMillicents,
} from '../src/lib/earnings.js';

/**
 * Earnings accrual is owned by store.billImpression (called by the impressions
 * route after a verified impression is recorded). These tests drive the real
 * HTTP path so they exercise the merged billing pipeline end to end, and assert
 * that a sub-cent per-impression developer share is accrued in millicents and
 * never truncated to zero.
 */
async function setup(h: Harness, cpmBidCents = 100) {
  const device = await h.store.createDevice({
    developerId: h.developerId,
    machineFingerprint: 'fp-ledger',
    platform: 'darwin',
  });
  const advertiser = await h.store.createAdvertiser({ name: 'A', email: 'a@x.com' });
  const campaign = await h.store.createCampaign({
    advertiserId: advertiser.id,
    headline: 'Ad',
    targetUrl: 'https://example.com',
    cpmBidCents,
    dailyBudgetCents: 1_000_000,
    targetingCountries: [],
    targetingPlatforms: [],
  });
  return { deviceId: device.id, campaignId: campaign.id };
}

function reportImpression(h: Harness, deviceId: string, campaignId: string, nonce: string) {
  const durationMs = 1500;
  const signature = hmacSign(
    h.signingSecret,
    impressionSigningPayload({ campaignId, deviceId, nonce, durationMs }),
  );
  return h.app.request('/api/v1/impressions', {
    method: 'POST',
    headers: { ...bearer(h.apiKey), 'content-type': 'application/json' },
    body: JSON.stringify({
      campaign_id: campaignId,
      device_id: deviceId,
      nonce,
      signature,
      duration_ms: durationMs,
    }),
  });
}

/** Report `n` impressions, spacing them past the (1ms) dedup window. */
async function reportMany(h: Harness, deviceId: string, campaignId: string, n: number) {
  for (let i = 0; i < n; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 3));
    const res = await reportImpression(h, deviceId, campaignId, `n-${campaignId}-${i}`);
    expect(res.status).toBe(201);
  }
}

describe('impression -> earnings ledger', () => {
  it('credits a sub-cent amount for a single verified impression (no truncation to zero)', async () => {
    const h = await makeHarness({ IMPRESSION_DEDUP_WINDOW_MS: '1' });
    const { deviceId, campaignId } = await setup(h, 100);

    expect((await reportImpression(h, deviceId, campaignId, 'n-1')).status).toBe(201);

    const summary = summarizeEarnings(await h.store.earningsForDeveloper(h.developerId));
    // 100 cpm * 0.80 / 1000 = 0.08 cents — must be > 0, not floored to 0.
    expect(summary.totalCents).toBeCloseTo(0.08, 10);
    expect(summary.totalCents).toBeGreaterThan(0);
    expect(summary.pendingCents).toBeCloseTo(0.08, 10);
  });

  it('aggregates N impressions to N * cpm * 0.80 / 1000 cents', async () => {
    const h = await makeHarness({ IMPRESSION_DEDUP_WINDOW_MS: '1' });
    const cpm = 150;
    const { deviceId, campaignId } = await setup(h, cpm);

    const N = 5;
    await reportMany(h, deviceId, campaignId, N);

    const summary = summarizeEarnings(await h.store.earningsForDeveloper(h.developerId));
    expect(summary.totalCents).toBeCloseTo((N * cpm * 0.8) / 1000, 10);
  });

  it('does not credit earnings for an unverified impression', async () => {
    const h = await makeHarness();
    const { deviceId, campaignId } = await setup(h, 100);
    // recordImpression only persists the row; accrual is gated on the verified
    // route path, so a raw unverified insert must never touch the ledger.
    await h.store.recordImpression({
      deviceId,
      campaignId,
      nonce: 'n-x',
      signature: 's',
      ipHash: null,
      durationMs: 1500,
      verified: false,
    });
    expect(await h.store.earningsForDeveloper(h.developerId)).toHaveLength(0);
  });

  it('accumulates campaign spend in millicents without truncating to zero', async () => {
    const h = await makeHarness({ IMPRESSION_DEDUP_WINDOW_MS: '1' });
    const { deviceId, campaignId } = await setup(h, 100);
    expect((await reportImpression(h, deviceId, campaignId, 'n-spend')).status).toBe(201);
    const campaign = await h.store.getCampaignById(campaignId);
    // gross spend = 100/1000 cents = 0.1 cents = 100 millicents (previously 0).
    expect(campaign?.spentTodayMillicents).toBe(100);
  });

  it('GET /api/v1/me/earnings returns totalCents > 0 after a real signed impression', async () => {
    const h = await makeHarness({ IMPRESSION_DEDUP_WINDOW_MS: '1' });
    const { deviceId, campaignId } = await setup(h, 100);
    expect((await reportImpression(h, deviceId, campaignId, 'nonce-e2eaaaaa')).status).toBe(201);

    const res = await h.app.request('/api/v1/me/earnings', { headers: bearer(h.sessionToken) });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data.totalCents).toBeGreaterThan(0);
  });
});

describe('earnings money math (unit)', () => {
  it('gross millicents per impression equals cpm_bid_cents', () => {
    expect(impressionGrossMillicents(100)).toBe(100);
    expect(impressionGrossMillicents(150)).toBe(150);
  });

  it('dev share millicents applies the rev-share basis points', () => {
    expect(impressionDevShareMillicents(100, 8000)).toBe(80);
    expect(impressionDevShareMillicents(150, 8000)).toBe(120);
  });
});
