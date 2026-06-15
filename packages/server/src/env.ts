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
  /**
   * Master key for envelope-encrypting the developer signing secret at rest
   * (see lib/secrets.ts). Required in production; in dev/test the secret is
   * stored as plaintext when this is empty.
   */
  SECRET_ENC_KEY: z.string().default(''),
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
}).superRefine((env, ctx) => {
  // Production must not boot with dev defaults for secret material.
  if (env.NODE_ENV !== 'production') return;
  const requireStrong = (field: keyof typeof env, devDefault: string) => {
    const value = env[field];
    if (!value || value === devDefault) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `${String(field)} must be set to a strong, non-default value in production`,
      });
    }
  };
  requireStrong('JWT_SECRET', 'dev-only-change-me');
  requireStrong('IP_HASH_SALT', 'tcb-dev-salt');
  requireStrong('SECRET_ENC_KEY', '');
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
