import { z } from 'zod';

/**
 * Centralised, validated runtime configuration. Importing this module reads
 * process.env once and fails fast if a required variable is malformed.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(1).default('dev-only-change-me'),
  GITHUB_CLIENT_ID: z.string().default(''),
  GITHUB_CLIENT_SECRET: z.string().default(''),
  GITHUB_OAUTH_REDIRECT_URI: z.string().default(''),
  DEFAULT_REV_SHARE_BPS: z.coerce.number().int().min(0).max(10_000).default(8000),
  IMPRESSION_DEDUP_WINDOW_MS: z.coerce.number().int().positive().default(5000),
  IP_HASH_SALT: z.string().default('tcb-dev-salt'),
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_CONNECT_CLIENT_ID: z.string().default(''),
  /** Signing secret for verifying inbound Stripe webhooks (whsec_...). */
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  /** Default settlement currency for top-ups and payouts. */
  STRIPE_CURRENCY: z
    .string()
    .length(3)
    .transform((s) => s.toLowerCase())
    .default('usd'),
  /** Base URL used to build Stripe Connect onboarding return/refresh links. */
  PUBLIC_BASE_URL: z.string().default('http://localhost:8787'),
  /** Minimum developer balance (cents) required to request a payout. */
  PAYOUT_MIN_CENTS: z.coerce.number().int().positive().default(1000),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests: reset the memoised env so a fresh process.env can be read. */
export function resetEnvCache(): void {
  cached = null;
}
