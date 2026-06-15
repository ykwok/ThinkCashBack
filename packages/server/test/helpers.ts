import { sha256 } from '@thinkcashback/shared';
import { createApp } from '../src/app.js';
import { loadEnv, resetEnvCache } from '../src/env.js';
import { createCounterStore } from '../src/redis/client.js';
import { MemoryStore } from '../src/store/memory.js';
import { FakeStripeGateway, signWebhookPayload } from '../src/lib/stripe.js';
import { issueSession } from '../src/lib/jwt.js';

export const TEST_WEBHOOK_SECRET = 'whsec_test_secret';

export interface Harness {
  app: ReturnType<typeof createApp>;
  store: MemoryStore;
  stripe: FakeStripeGateway;
  apiKey: string;
  signingSecret: string;
  developerId: string;
  sessionToken: string;
}

/**
 * Build a fully wired app backed by the in-memory store, plus a ready-to-use
 * developer (api key + signing secret + session JWT). No external services.
 */
export async function makeHarness(envOverrides: Record<string, string> = {}): Promise<Harness> {
  resetEnvCache();
  const env = loadEnv({
    NODE_ENV: 'test',
    JWT_SECRET: 'test-secret',
    STRIPE_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
    ...envOverrides,
  } as NodeJS.ProcessEnv);
  const store = new MemoryStore();
  const counters = createCounterStore(); // in-memory fallback
  const stripe = new FakeStripeGateway();
  const app = createApp({ env, store, counters, stripe });

  const apiKey = 'test-api-key-abcdefabcdef';
  const signingSecret = 'test-signing-secret-123456';
  const developer = await store.createDeveloper({
    githubId: 'tester',
    email: 'tester@example.com',
    apiKeyHash: sha256(apiKey),
    signingSecretHash: signingSecret,
    revShareBps: 8000,
  });
  const sessionToken = await issueSession(env.JWT_SECRET, developer.id, developer.githubId);

  return { app, store, stripe, apiKey, signingSecret, developerId: developer.id, sessionToken };
}

export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

/**
 * POST a properly signed Stripe webhook event to the harness app, exercising
 * the same signature-verification path production uses.
 */
export async function postWebhook(
  h: Harness,
  event: { id: string; type: string; data: { object: Record<string, unknown> } },
  secret: string = TEST_WEBHOOK_SECRET,
): Promise<Response> {
  const payload = JSON.stringify(event);
  return h.app.request('/api/v1/webhooks/stripe', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signWebhookPayload(payload, secret),
    },
    body: payload,
  });
}

/** Parse a response body as the loose API envelope (tests only). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function json(res: Response): Promise<any> {
  return res.json();
}
