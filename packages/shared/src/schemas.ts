import { z } from 'zod';

export const platformSchema = z.enum(['darwin', 'linux', 'win32']);

/** GET /api/v1/ad query params. */
export const adQuerySchema = z.object({
  platform: platformSchema,
  country: z
    .string()
    .length(2)
    .transform((s) => s.toUpperCase())
    .optional(),
  lang: z.string().min(2).max(8).optional(),
});
export type AdQuery = z.infer<typeof adQuerySchema>;

/** POST /api/v1/impressions body. */
export const impressionReportSchema = z.object({
  campaign_id: z.string().uuid(),
  device_id: z.string().uuid(),
  nonce: z.string().min(8).max(128),
  signature: z.string().regex(/^[0-9a-f]+$/i, 'signature must be hex'),
  duration_ms: z.number().int().nonnegative().max(600_000),
});
export type ImpressionReport = z.infer<typeof impressionReportSchema>;

/** POST /api/v1/devices body. */
export const registerDeviceSchema = z.object({
  machine_fingerprint: z.string().min(8).max(256),
  platform: platformSchema,
  device_pubkey: z.string().min(1).max(2048).optional(),
});
export type RegisterDevice = z.infer<typeof registerDeviceSchema>;

/** POST /api/v1/campaigns body. */
export const createCampaignSchema = z.object({
  headline: z.string().min(3).max(140),
  target_url: z.string().url(),
  cpm_bid_cents: z.number().int().positive().max(1_000_000),
  daily_budget_cents: z.number().int().positive().max(100_000_000),
  targeting_countries: z.array(z.string().length(2)).default([]),
  targeting_platforms: z.array(platformSchema).default([]),
});
export type CreateCampaign = z.infer<typeof createCampaignSchema>;

/**
 * POST /api/v1/advertisers/:id/topup body.
 * Funds a specific campaign's budget; amount is in integer cents (>= $1.00).
 */
export const topupSchema = z.object({
  campaign_id: z.string().uuid(),
  amount_cents: z.number().int().min(100).max(100_000_000),
  currency: z
    .string()
    .length(3)
    .transform((s) => s.toLowerCase())
    .default('usd'),
});
export type Topup = z.infer<typeof topupSchema>;

/**
 * POST /api/v1/me/payouts body.
 * With no amount the full available balance is withdrawn; an explicit amount
 * must not exceed the available balance (validated server-side).
 */
export const payoutRequestSchema = z.object({
  amount_cents: z.number().int().positive().max(100_000_000).optional(),
});
export type PayoutRequest = z.infer<typeof payoutRequestSchema>;

/** POST /api/v1/auth/github body (code exchanged for a session). */
export const githubAuthSchema = z.object({
  code: z.string().min(1),
});
export type GithubAuth = z.infer<typeof githubAuthSchema>;
