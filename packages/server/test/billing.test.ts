import { describe, expect, it } from 'vitest';
import { hmacSign, impressionSigningPayload } from '@thinkcashback/shared';
import { bearer, json, makeHarness, postWebhook, type Harness } from './helpers.js';

/** Create a developer-owned device + a funded-capable campaign for billing tests. */
async function setup(h: Harness, cpmBidCents = 1000, dailyBudgetCents = 1_000_000) {
  const device = await h.store.createDevice({
    developerId: h.developerId,
    machineFingerprint: 'fingerprint-billing',
    platform: 'darwin',
  });
  const advertiser = await h.store.createAdvertiser({ name: 'Acme', email: 'acme@x.com' });
  const campaign = await h.store.createCampaign({
    advertiserId: advertiser.id,
    headline: 'Ad',
    targetUrl: 'https://example.com',
    cpmBidCents,
    dailyBudgetCents,
    targetingCountries: [],
    targetingPlatforms: [],
  });
  return { deviceId: device.id, campaignId: campaign.id, advertiserId: advertiser.id };
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
    const res = await reportImpression(h, deviceId, campaignId, `nonce-${campaignId}-${i}`);
    expect(res.status).toBe(201);
  }
}

async function topup(h: Harness, advertiserId: string, campaignId: string, amountCents: number) {
  const res = await h.app.request(`/api/v1/advertisers/${advertiserId}/topup`, {
    method: 'POST',
    headers: { ...bearer(h.sessionToken), 'content-type': 'application/json' },
    body: JSON.stringify({ campaign_id: campaignId, amount_cents: amountCents }),
  });
  return res;
}

describe('Stripe billing — full top-up → charge → settle → payout loop', () => {
  it('runs the end-to-end revenue cycle with webhooks', async () => {
    // Lower the payout minimum so a small earned balance is withdrawable, and
    // shrink the dedup window so we can report several impressions in the test.
    const h = await makeHarness({ PAYOUT_MIN_CENTS: '1', IMPRESSION_DEDUP_WINDOW_MS: '1' });
    const { deviceId, campaignId, advertiserId } = await setup(h);

    // --- 1. Advertiser tops up the campaign (PaymentIntent created, not yet paid)
    const topupRes = await topup(h, advertiserId, campaignId, 5000);
    expect(topupRes.status).toBe(201);
    const topupBody = await json(topupRes);
    expect(topupBody.data.status).toBe('pending');
    expect(topupBody.data.stripePaymentIntentId).toMatch(/^pi_/);
    expect(topupBody.data.clientSecret).toBeTruthy();
    const piId = topupBody.data.stripePaymentIntentId;

    // Budget is not credited until Stripe confirms.
    expect((await h.store.getCampaignById(campaignId))!.balanceCents).toBe(0);

    // --- 2. payment_intent.succeeded webhook credits the budget
    const paid = await postWebhook(h, {
      id: 'evt_pi_1',
      type: 'payment_intent.succeeded',
      data: { object: { id: piId } },
    });
    expect(paid.status).toBe(200);
    expect((await h.store.getCampaignById(campaignId))!.balanceCents).toBe(5000);

    // --- 3. Developer serves 10 impressions ($10 CPM => 1 cent each)
    await reportMany(h, deviceId, campaignId, 10);
    const campaignAfter = (await h.store.getCampaignById(campaignId))!;
    expect(campaignAfter.spentTodayCents).toBe(10);
    expect(campaignAfter.balanceCents).toBe(4990);

    // --- 4. Settlement: ledger accrued the 80% developer share (gross 10 => 8)
    const earningsRes = await h.app.request('/api/v1/me/earnings', {
      headers: bearer(h.sessionToken),
    });
    const earnings = await json(earningsRes);
    expect(earnings.data.totalCents).toBe(8);
    expect(earnings.data.pendingCents).toBe(8);
    expect(earnings.data.paidCents).toBe(0);

    // --- 5. Developer connects a Stripe account
    const connectRes = await h.app.request('/api/v1/me/connect', {
      method: 'POST',
      headers: bearer(h.sessionToken),
    });
    expect(connectRes.status).toBe(200);
    const connect = await json(connectRes);
    expect(connect.data.connectId).toMatch(/^acct_/);
    expect(connect.data.onboardingUrl).toContain('connect.stripe.com');

    // --- 6. Developer requests a payout (transfer created, status processing)
    const payoutRes = await h.app.request('/api/v1/me/payouts', {
      method: 'POST',
      headers: bearer(h.sessionToken),
    });
    expect(payoutRes.status).toBe(201);
    const payout = await json(payoutRes);
    expect(payout.data.amountCents).toBe(8);
    expect(payout.data.status).toBe('processing');
    expect(payout.data.stripeTransferId).toMatch(/^tr_/);
    expect(h.stripe.transfers).toHaveLength(1);
    expect(h.stripe.transfers[0].amountCents).toBe(8);
    expect(h.stripe.transfers[0].destination).toBe(connect.data.connectId);

    // Earnings are now held (processing): still not paid.
    const midEarnings = await json(
      await h.app.request('/api/v1/me/earnings', { headers: bearer(h.sessionToken) }),
    );
    expect(midEarnings.data.paidCents).toBe(0);

    // --- 7. payout.paid webhook finalizes the payout + ledger rows
    const payoutPaid = await postWebhook(h, {
      id: 'evt_payout_1',
      type: 'payout.paid',
      data: { object: { id: 'po_xxx', metadata: { payout_id: payout.data.id } } },
    });
    expect(payoutPaid.status).toBe(200);

    const finalPayout = await h.store.getPayoutById(payout.data.id);
    expect(finalPayout!.status).toBe('paid');
    const finalEarnings = await json(
      await h.app.request('/api/v1/me/earnings', { headers: bearer(h.sessionToken) }),
    );
    expect(finalEarnings.data.paidCents).toBe(8);
    expect(finalEarnings.data.pendingCents).toBe(0);
  });

  it('credits the budget exactly once for a redelivered payment webhook', async () => {
    const h = await makeHarness();
    const { campaignId, advertiserId } = await setup(h);
    const topupBody = await json(await topup(h, advertiserId, campaignId, 2000));
    const piId = topupBody.data.stripePaymentIntentId;

    const event = {
      id: 'evt_dupe',
      type: 'payment_intent.succeeded',
      data: { object: { id: piId } },
    };
    const first = await postWebhook(h, event);
    expect((await json(first)).data.duplicate).toBeUndefined();
    const second = await postWebhook(h, event);
    expect((await json(second)).data.duplicate).toBe(true);

    // Same id replay must not double-credit.
    expect((await h.store.getCampaignById(campaignId))!.balanceCents).toBe(2000);
  });

  it('rejects a webhook with an invalid signature (400)', async () => {
    const h = await makeHarness();
    const res = await postWebhook(
      h,
      { id: 'evt_bad', type: 'payment_intent.succeeded', data: { object: { id: 'pi_x' } } },
      'whsec_wrong_secret',
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe('WEBHOOK_SIGNATURE_INVALID');
  });

  it('stops serving a campaign once its funded budget is exhausted', async () => {
    const h = await makeHarness();
    // $1000 CPM => 100 cents/impression; a $1.00 top-up funds exactly one.
    const { deviceId, campaignId, advertiserId } = await setup(h, 100_000);
    const piId = (await json(await topup(h, advertiserId, campaignId, 100))).data
      .stripePaymentIntentId;
    await postWebhook(h, {
      id: 'evt_fund',
      type: 'payment_intent.succeeded',
      data: { object: { id: piId } },
    });

    const res = await reportImpression(h, deviceId, campaignId, 'nonce-exhaust-0');
    expect(res.status).toBe(201);
    const campaign = (await h.store.getCampaignById(campaignId))!;
    expect(campaign.balanceCents).toBe(0);
    expect(campaign.status).toBe('exhausted');

    // Ad serving now returns NO_FILL for this (only) campaign.
    const adRes = await h.app.request('/api/v1/ad?platform=darwin', { headers: bearer(h.apiKey) });
    expect(adRes.status).toBe(404);
    expect((await json(adRes)).error.code).toBe('NO_FILL');
  });

  it('blocks payouts below the minimum and without a connected account', async () => {
    const h = await makeHarness({ PAYOUT_MIN_CENTS: '1000' });
    const { deviceId, campaignId, advertiserId } = await setup(h);
    const piId = (await json(await topup(h, advertiserId, campaignId, 5000))).data
      .stripePaymentIntentId;
    await postWebhook(h, {
      id: 'evt_min',
      type: 'payment_intent.succeeded',
      data: { object: { id: piId } },
    });
    await reportImpression(h, deviceId, campaignId, 'nonce-min-0');

    // No Connect account yet → 409.
    const noConnect = await h.app.request('/api/v1/me/payouts', {
      method: 'POST',
      headers: bearer(h.sessionToken),
    });
    expect(noConnect.status).toBe(409);
    expect((await json(noConnect)).error.code).toBe('PAYOUT_NO_CONNECT');

    // Connect, then fail on the minimum threshold (earned < $10).
    await h.app.request('/api/v1/me/connect', { method: 'POST', headers: bearer(h.sessionToken) });
    const belowMin = await h.app.request('/api/v1/me/payouts', {
      method: 'POST',
      headers: bearer(h.sessionToken),
    });
    expect(belowMin.status).toBe(422);
    expect((await json(belowMin)).error.code).toBe('PAYOUT_BELOW_MINIMUM');
  });
});
