import { describe, expect, it } from 'vitest';
import { hmacSign, impressionSigningPayload } from '@thinkcashback/shared';
import { decryptSecret, encryptSecret } from '../src/lib/secrets.js';
import { bearer, json, makeHarness } from './helpers.js';

describe('secrets envelope encryption', () => {
  const KEY = 'unit-test-master-key';

  it('round-trips a secret through encrypt/decrypt', () => {
    const plain = 'super-secret-signing-key';
    const enc = encryptSecret(plain, KEY);
    expect(enc.startsWith('enc:v1:')).toBe(true);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc, KEY)).toBe(plain);
  });

  it('passes plaintext through when no master key is configured', () => {
    expect(encryptSecret('abc', '')).toBe('abc');
    expect(decryptSecret('abc', '')).toBe('abc');
    expect(decryptSecret('abc', KEY)).toBe('abc'); // legacy unencrypted row
  });

  it('produces a distinct ciphertext each time (random IV)', () => {
    expect(encryptSecret('abc', KEY)).not.toBe(encryptSecret('abc', KEY));
  });

  it('fails to decrypt under the wrong key', () => {
    const enc = encryptSecret('abc', KEY);
    expect(() => decryptSecret(enc, 'a-different-key')).toThrow();
  });

  it('rejects a tampered ciphertext (GCM auth tag)', () => {
    const enc = encryptSecret('abc', KEY);
    const tampered = enc.slice(0, -2) + (enc.endsWith('A') ? 'B' : 'A');
    expect(() => decryptSecret(tampered, KEY)).toThrow();
  });
});

describe('signing secret is encrypted at rest but still verifies', () => {
  it('stores the secret encrypted yet accepts impressions signed with the plaintext key', async () => {
    const h = await makeHarness({ SECRET_ENC_KEY: 'master-key-abc' });

    // First login mints credentials; the signing secret must be stored encrypted.
    const loginRes = await h.app.request('/api/v1/auth/github', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'dev:9001:enc@example.com' }),
    });
    expect(loginRes.status).toBe(201);
    const { data } = await json(loginRes);
    const { apiKey, signingSecret } = data.credentials;
    const developerId: string = data.developer.id;

    const stored = await h.store.getDeveloperById(developerId);
    expect(stored?.signingSecretHash.startsWith('enc:v1:')).toBe(true);
    expect(stored?.signingSecretHash).not.toContain(signingSecret);

    // Set up a servable campaign + a device owned by this developer.
    const advertiser = await h.store.createAdvertiser({ name: 'A', email: 'a@x.com' });
    const campaign = await h.store.createCampaign({
      advertiserId: advertiser.id,
      headline: 'Ad',
      targetUrl: 'https://example.com',
      cpmBidCents: 100,
      dailyBudgetCents: 1_000_000,
      targetingCountries: [],
      targetingPlatforms: [],
    });
    const device = await h.store.createDevice({
      developerId,
      machineFingerprint: 'fp-enc',
      platform: 'darwin',
    });

    const durationMs = 1500;
    const signature = hmacSign(
      signingSecret,
      impressionSigningPayload({
        campaignId: campaign.id,
        deviceId: device.id,
        nonce: 'nonce-enc-1',
        durationMs,
      }),
    );
    const res = await h.app.request('/api/v1/impressions', {
      method: 'POST',
      headers: { ...bearer(apiKey), 'content-type': 'application/json' },
      body: JSON.stringify({
        campaign_id: campaign.id,
        device_id: device.id,
        nonce: 'nonce-enc-1',
        signature,
        duration_ms: durationMs,
      }),
    });
    expect(res.status).toBe(201);
  });
});
