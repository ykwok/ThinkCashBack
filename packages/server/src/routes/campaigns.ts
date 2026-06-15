import { Hono } from 'hono';
import { createCampaignSchema, generateToken } from '@thinkcashback/shared';
import type { AppBindings } from '../lib/context.js';
import { sessionAuth } from '../middleware/auth.js';
import { fail, ok } from '../lib/response.js';

export const campaignRoutes = new Hono<AppBindings>();

/**
 * POST /api/v1/campaigns
 * Minimal advertiser flow: the authenticated developer creates a campaign; an
 * advertiser record is provisioned on the fly (full advertiser onboarding is
 * out of V1 scope).
 */
campaignRoutes.post('/campaigns', sessionAuth, async (c) => {
  const dev = c.get('developer')!;
  const store = c.get('store');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, 400, 'BAD_JSON', 'Request body must be valid JSON');
  }

  const parsed = createCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, 422, 'VALIDATION_ERROR', 'Invalid campaign payload', {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const advertiser = await store.createAdvertiser({
    name: `Advertiser for ${dev.githubId}`,
    email: `advertiser+${dev.githubId}-${generateToken(4)}@thinkcashback.local`,
  });

  const campaign = await store.createCampaign({
    advertiserId: advertiser.id,
    headline: parsed.data.headline,
    targetUrl: parsed.data.target_url,
    cpmBidCents: parsed.data.cpm_bid_cents,
    dailyBudgetCents: parsed.data.daily_budget_cents,
    targetingCountries: parsed.data.targeting_countries.map((c2) => c2.toUpperCase()),
    targetingPlatforms: parsed.data.targeting_platforms,
  });

  return ok(
    c,
    {
      id: campaign.id,
      advertiserId: campaign.advertiserId,
      headline: campaign.headline,
      targetUrl: campaign.targetUrl,
      cpmBidCents: campaign.cpmBidCents,
      dailyBudgetCents: campaign.dailyBudgetCents,
      balanceCents: campaign.balanceCents,
      status: campaign.status,
      targetingCountries: campaign.targetingCountries,
      targetingPlatforms: campaign.targetingPlatforms,
      createdAt: campaign.createdAt.toISOString(),
    },
    201,
  );
});

/** GET /api/v1/campaigns/:id/stats */
campaignRoutes.get('/campaigns/:id/stats', sessionAuth, async (c) => {
  const id = c.req.param('id');
  const stats = await c.get('store').getCampaignStats(id);
  if (!stats) {
    return fail(c, 404, 'CAMPAIGN_NOT_FOUND', 'Unknown campaign');
  }
  return ok(c, {
    campaignId: stats.campaignId,
    impressions: stats.impressions,
    spentCents: stats.spentCents,
    status: stats.status,
  });
});
