import { Hono } from 'hono';
import { adQuerySchema, generateToken, type AdResponse } from '@thinkcashback/shared';
import type { AppBindings } from '../lib/context.js';
import { apiKeyAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { fail, ok } from '../lib/response.js';
import { pickWeightedByBid } from '../lib/adselect.js';

export const adRoutes = new Hono<AppBindings>();

/**
 * GET /api/v1/ad
 * Returns one active campaign matching platform/country, chosen weighted by CPM
 * bid: higher bids serve more often but every eligible campaign keeps a chance,
 * so lower bidders still get impressions and the client's ad bar rotates.
 */
adRoutes.get(
  '/ad',
  apiKeyAuth,
  rateLimit({ bucket: 'ad', limit: 120, windowSeconds: 60 }),
  async (c) => {
    const parsed = adQuerySchema.safeParse({
      platform: c.req.query('platform'),
      country: c.req.query('country'),
      lang: c.req.query('lang'),
    });
    if (!parsed.success) {
      return fail(c, 422, 'VALIDATION_ERROR', 'Invalid ad query', {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const { platform, country } = parsed.data;
    const candidates = await c.get('store').selectServableCampaigns({ platform, country });
    if (candidates.length === 0) {
      return fail(c, 404, 'NO_FILL', 'No campaign available for this request');
    }

    const chosen = pickWeightedByBid(candidates) ?? candidates[0];
    const trackingId = generateToken(12);
    const payload: AdResponse = {
      id: chosen.id,
      headline: chosen.headline,
      url: chosen.targetUrl,
      trackingId,
    };

    // Best-effort realtime request counter; never blocks the response.
    const counters = c.get('counters');
    void counters.incrWithTtl(`ad:served:${chosen.id}`, 86_400).catch(() => undefined);

    return ok(c, payload);
  },
);
