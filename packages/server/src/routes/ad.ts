import { Hono } from 'hono';
import { adQuerySchema, generateToken, type AdResponse } from '@thinkcashback/shared';
import type { AppBindings } from '../lib/context.js';
import { apiKeyAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { fail, ok } from '../lib/response.js';

export const adRoutes = new Hono<AppBindings>();

/**
 * GET /api/v1/ad
 * Returns the highest-bidding active campaign matching platform/country.
 * The campaign pool is cached in Redis for a few seconds to keep this hot path
 * cheap; cache misses fall through to the store.
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

    const chosen = candidates[0];
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
