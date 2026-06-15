import { Hono } from 'hono';
import {
  hashIp,
  hmacVerify,
  impressionReportSchema,
  impressionSigningPayload,
  sha256,
} from '@thinkcashback/shared';
import type { AppBindings } from '../lib/context.js';
import { apiKeyAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { fail, ok } from '../lib/response.js';
import { impressionChargeCents } from '../lib/money.js';

export const impressionRoutes = new Hono<AppBindings>();

/**
 * POST /api/v1/impressions
 *
 * Anti-fraud pipeline:
 *   1. validate body shape
 *   2. the reporting device must belong to the authenticated developer
 *   3. verify HMAC signature over the canonical payload using the developer's
 *      signing secret (we compare against the stored hash of that secret)
 *   4. reject bursts inside the dedup window (per device + campaign)
 *   5. insert; a duplicate nonce hits the unique index and returns 409
 */
impressionRoutes.post(
  '/impressions',
  apiKeyAuth,
  rateLimit({ bucket: 'impressions', limit: 600, windowSeconds: 60 }),
  async (c) => {
    const developer = c.get('developer')!;
    const env = c.get('env');
    const store = c.get('store');

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return fail(c, 400, 'BAD_JSON', 'Request body must be valid JSON');
    }

    const parsed = impressionReportSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 422, 'VALIDATION_ERROR', 'Invalid impression payload', {
        issues: parsed.error.flatten().fieldErrors,
      });
    }
    const report = parsed.data;

    const device = await store.getDeviceById(report.device_id);
    if (!device || device.developerId !== developer.id) {
      return fail(c, 403, 'DEVICE_MISMATCH', 'Device does not belong to this developer');
    }

    const campaign = await store.getCampaignById(report.campaign_id);
    if (!campaign) {
      return fail(c, 404, 'CAMPAIGN_NOT_FOUND', 'Unknown campaign');
    }

    // HMAC is symmetric: the client signs with its signing secret and we
    // recompute the digest with the same key held on the developer record
    // (signing_secret_hash column; encrypt at rest in production).
    const signingPayload = impressionSigningPayload({
      campaignId: report.campaign_id,
      deviceId: report.device_id,
      nonce: report.nonce,
      durationMs: report.duration_ms,
    });
    const signatureValid = hmacVerify(
      developer.signingSecretHash,
      signingPayload,
      report.signature,
    );
    if (!signatureValid) {
      return fail(c, 401, 'BAD_SIGNATURE', 'HMAC signature verification failed');
    }

    // 5s sliding-window burst guard (independent of the hard nonce unique index).
    const recent = await store.countRecentImpressions(
      report.device_id,
      report.campaign_id,
      env.IMPRESSION_DEDUP_WINDOW_MS,
    );
    if (recent > 0) {
      return fail(c, 409, 'DEDUP_WINDOW', 'Impression rejected: inside dedup window');
    }

    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      c.req.header('x-real-ip') ??
      'unknown';
    const inserted = await store.recordImpression({
      deviceId: report.device_id,
      campaignId: report.campaign_id,
      nonce: report.nonce,
      signature: report.signature,
      ipHash: hashIp(ip, env.IP_HASH_SALT),
      durationMs: report.duration_ms,
      verified: true,
    });

    if (!inserted) {
      return fail(c, 409, 'DUPLICATE_NONCE', 'This nonce was already reported');
    }

    // Bill the impression: debit the campaign budget and accrue the developer's
    // revenue share. CPM is per 1000 impressions, so the whole-cent charge is
    // computed on the cumulative verified-impression count (see lib/money).
    const stats = await store.getCampaignStats(report.campaign_id);
    const verifiedCount = stats?.impressions ?? 1;
    const chargeCents = impressionChargeCents(verifiedCount - 1, campaign.cpmBidCents);
    await store.billImpression({
      campaignId: report.campaign_id,
      developerId: developer.id,
      chargeCents,
      revShareBps: developer.revShareBps,
      at: inserted.createdAt,
    });

    await store.touchDevice(report.device_id);

    // Realtime per-campaign impression counter (best effort).
    const counters = c.get('counters');
    void counters.incrWithTtl(`imp:count:${report.campaign_id}`, 86_400).catch(() => undefined);

    return ok(c, { id: inserted.id, accepted: true, trackingHash: sha256(inserted.id) }, 201);
  },
);
