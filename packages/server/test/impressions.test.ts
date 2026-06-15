import { describe, expect, it } from 'vitest';
import { hmacSign, impressionSigningPayload } from '@thinkcashback/shared';
import { bearer, json, makeHarness, type Harness } from './helpers.js';

async function setupDeviceAndCampaign(h: Harness) {
  const device = await h.store.createDevice({
    developerId: h.developerId,
    machineFingerprint: 'fingerprint-1234',
    platform: 'darwin',
  });
  const advertiser = await h.store.createAdvertiser({ name: 'A', email: 'a@x.com' });
  const campaign = await h.store.createCampaign({
    advertiserId: advertiser.id,
    headline: 'Ad',
    targetUrl: 'https://example.com',
    cpmBidCents: 100,
    dailyBudgetCents: 100_000,
    targetingCountries: [],
    targetingPlatforms: [],
  });
  return { deviceId: device.id, campaignId: campaign.id };
}

function signedBody(h: Harness, deviceId: string, campaignId: string, nonce: string) {
  const durationMs = 1500;
  const signature = hmacSign(
    h.signingSecret,
    impressionSigningPayload({ campaignId, deviceId, nonce, durationMs }),
  );
  return {
    campaign_id: campaignId,
    device_id: deviceId,
    nonce,
    signature,
    duration_ms: durationMs,
  };
}

function post(h: Harness, body: unknown) {
  return h.app.request('/api/v1/impressions', {
    method: 'POST',
    headers: { ...bearer(h.apiKey), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/impressions', () => {
  it('accepts a valid signed impression (201)', async () => {
    const h = await makeHarness();
    const { deviceId, campaignId } = await setupDeviceAndCampaign(h);
    const res = await post(h, signedBody(h, deviceId, campaignId, 'nonce-aaaaaaaa'));
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data.accepted).toBe(true);
  });

  it('rejects a tampered signature with 401', async () => {
    const h = await makeHarness();
    const { deviceId, campaignId } = await setupDeviceAndCampaign(h);
    const body = signedBody(h, deviceId, campaignId, 'nonce-bbbbbbbb');
    body.signature = body.signature.replace(/.$/, (ch: string) => (ch === '0' ? '1' : '0'));
    const res = await post(h, body);
    expect(res.status).toBe(401);
    expect((await json(res)).error.code).toBe('BAD_SIGNATURE');
  });

  it('returns 409 when the same nonce is reported twice', async () => {
    // Disable the time-window guard so we exercise the hard nonce dedup path.
    const h = await makeHarness({ IMPRESSION_DEDUP_WINDOW_MS: '1' });
    const { deviceId, campaignId } = await setupDeviceAndCampaign(h);
    const body = signedBody(h, deviceId, campaignId, 'nonce-cccccccc');

    const first = await post(h, body);
    expect(first.status).toBe(201);

    // wait out the 1ms window, then replay the same nonce
    await new Promise((r) => setTimeout(r, 5));
    const second = await post(h, body);
    expect(second.status).toBe(409);
    expect((await json(second)).error.code).toBe('DUPLICATE_NONCE');
  });

  it('rejects a device that belongs to another developer (403)', async () => {
    const h = await makeHarness();
    const { campaignId } = await setupDeviceAndCampaign(h);
    const otherDev = await h.store.createDeveloper({
      githubId: 'other',
      email: 'other@x.com',
      apiKeyHash: 'x',
      signingSecretHash: 'y',
      revShareBps: 8000,
    });
    const foreignDevice = await h.store.createDevice({
      developerId: otherDev.id,
      machineFingerprint: 'foreign',
      platform: 'linux',
    });
    const res = await post(h, signedBody(h, foreignDevice.id, campaignId, 'nonce-dddddddd'));
    expect(res.status).toBe(403);
    expect((await json(res)).error.code).toBe('DEVICE_MISMATCH');
  });
});
