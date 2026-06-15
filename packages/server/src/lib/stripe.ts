import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Stripe integration boundary.
 *
 * Outbound calls go through the `StripeGateway` interface so the rest of the
 * app never imports the Stripe SDK directly: production uses `HttpStripeGateway`
 * (thin wrapper over the Stripe REST API via `fetch`), while tests use
 * `FakeStripeGateway` (deterministic, no network). Inbound webhooks are verified
 * by the pure `constructWebhookEvent` helper, which both real and test callers
 * share so signature handling is exercised by the test suite.
 *
 * No secret key, webhook secret, or live response is ever logged.
 */

export interface CreateTopupIntentInput {
  amountCents: number;
  currency: string;
  advertiserId: string;
  campaignId: string;
  /** Stripe customer to attach the PaymentIntent to, if known. */
  customerId?: string | null;
}

export interface TopupIntent {
  id: string;
  clientSecret: string | null;
  status: string;
}

export interface ConnectAccount {
  id: string;
}

export interface AccountLink {
  url: string;
}

export interface CreateTransferInput {
  amountCents: number;
  currency: string;
  /** Connected account id (acct_...). */
  destination: string;
  /** Idempotency key — our payout id — so retries never double-pay. */
  idempotencyKey: string;
  metadata?: Record<string, string>;
}

export interface Transfer {
  id: string;
  status: string;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export interface StripeGateway {
  /** Create a PaymentIntent for an advertiser top-up (test or live mode). */
  createTopupIntent(input: CreateTopupIntentInput): Promise<TopupIntent>;
  /** Create a Connect Express account for a developer; returns its id. */
  createConnectAccount(input: { email: string; developerId: string }): Promise<ConnectAccount>;
  /** Create an onboarding (account) link for a Connect Express account. */
  createAccountLink(input: {
    accountId: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<AccountLink>;
  /** Transfer funds from the platform balance to a connected account (payout). */
  createTransfer(input: CreateTransferInput): Promise<Transfer>;
}

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

/** Flatten a nested params object into Stripe's form-encoding (a[b]=c). */
function encodeForm(params: Record<string, unknown>, prefix = ''): string[] {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const field = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object') {
      parts.push(...encodeForm(value as Record<string, unknown>, field));
    } else {
      parts.push(`${encodeURIComponent(field)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts;
}

/** Real Stripe gateway backed by the REST API over fetch. */
export class HttpStripeGateway implements StripeGateway {
  constructor(private readonly secretKey: string) {}

  private async post<T>(
    path: string,
    params: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const res = await fetch(`${STRIPE_API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: encodeForm(params).join('&'),
    });
    if (!res.ok) {
      // Surface the Stripe error code (safe) but never the request body/secret.
      let code = 'unknown_error';
      try {
        const body = (await res.json()) as { error?: { code?: string; type?: string } };
        code = body.error?.code ?? body.error?.type ?? code;
      } catch {
        /* non-JSON error body */
      }
      throw new StripeApiError(`Stripe request failed (${res.status}): ${code}`, res.status, code);
    }
    return (await res.json()) as T;
  }

  async createTopupIntent(input: CreateTopupIntentInput): Promise<TopupIntent> {
    const intent = await this.post<{ id: string; client_secret: string | null; status: string }>(
      '/payment_intents',
      {
        amount: input.amountCents,
        currency: input.currency,
        customer: input.customerId ?? undefined,
        'automatic_payment_methods[enabled]': true,
        metadata: {
          advertiser_id: input.advertiserId,
          campaign_id: input.campaignId,
          kind: 'advertiser_topup',
        },
      },
    );
    return { id: intent.id, clientSecret: intent.client_secret, status: intent.status };
  }

  async createConnectAccount(input: {
    email: string;
    developerId: string;
  }): Promise<ConnectAccount> {
    const acct = await this.post<{ id: string }>('/accounts', {
      type: 'express',
      email: input.email,
      'capabilities[transfers][requested]': true,
      metadata: { developer_id: input.developerId },
    });
    return { id: acct.id };
  }

  async createAccountLink(input: {
    accountId: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<AccountLink> {
    const link = await this.post<{ url: string }>('/account_links', {
      account: input.accountId,
      refresh_url: input.refreshUrl,
      return_url: input.returnUrl,
      type: 'account_onboarding',
    });
    return { url: link.url };
  }

  async createTransfer(input: CreateTransferInput): Promise<Transfer> {
    const transfer = await this.post<{ id: string }>(
      '/transfers',
      {
        amount: input.amountCents,
        currency: input.currency,
        destination: input.destination,
        metadata: input.metadata,
      },
      input.idempotencyKey,
    );
    // Transfers settle synchronously; surface a paid status for callers.
    return { id: transfer.id, status: 'paid' };
  }
}

export class StripeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'StripeApiError';
  }
}

/**
 * Deterministic in-memory gateway for tests and local dev without Stripe keys.
 * Generated ids mimic Stripe's prefixes so downstream code paths are identical.
 */
export class FakeStripeGateway implements StripeGateway {
  /** Records of every outbound call, for assertions in tests. */
  readonly transfers: CreateTransferInput[] = [];
  readonly topups: CreateTopupIntentInput[] = [];

  private id(prefix: string): string {
    return `${prefix}_${randomBytes(12).toString('hex')}`;
  }

  async createTopupIntent(input: CreateTopupIntentInput): Promise<TopupIntent> {
    this.topups.push(input);
    const id = this.id('pi');
    return { id, clientSecret: `${id}_secret_${randomBytes(8).toString('hex')}`, status: 'requires_payment_method' };
  }

  async createConnectAccount(): Promise<ConnectAccount> {
    return { id: this.id('acct') };
  }

  async createAccountLink(input: {
    accountId: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<AccountLink> {
    return { url: `https://connect.stripe.com/setup/e/${input.accountId}` };
  }

  async createTransfer(input: CreateTransferInput): Promise<Transfer> {
    this.transfers.push(input);
    return { id: this.id('tr'), status: 'paid' };
  }
}

/** Build the gateway appropriate for the configured environment. */
export function createStripeGateway(secretKey?: string): StripeGateway {
  if (secretKey && secretKey.length > 0) return new HttpStripeGateway(secretKey);
  return new FakeStripeGateway();
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

/**
 * Verify a Stripe webhook signature and parse the event. Mirrors Stripe's
 * `constructEvent`: the signed payload is `${timestamp}.${rawBody}`, HMAC-SHA256
 * with the endpoint secret, compared in constant time against the `v1` scheme.
 *
 * @param toleranceSeconds reject events whose timestamp is older than this
 *   (default 5 minutes) to blunt replay attacks; pass 0 to disable.
 */
export function constructWebhookEvent(
  payload: string,
  signatureHeader: string | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): StripeWebhookEvent {
  if (!secret) throw new WebhookVerificationError('Webhook secret is not configured');
  if (!signatureHeader) throw new WebhookVerificationError('Missing Stripe-Signature header');

  const parts = signatureHeader.split(',').map((p) => p.trim());
  let timestamp: number | null = null;
  const v1Signatures: string[] = [];
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 't') timestamp = Number(value);
    else if (key === 'v1' && value) v1Signatures.push(value);
  }
  if (timestamp === null || Number.isNaN(timestamp) || v1Signatures.length === 0) {
    throw new WebhookVerificationError('Malformed Stripe-Signature header');
  }
  if (toleranceSeconds > 0 && Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    throw new WebhookVerificationError('Webhook timestamp outside tolerance');
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const matched = v1Signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, 'hex');
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  });
  if (!matched) throw new WebhookVerificationError('Signature verification failed');

  let event: StripeWebhookEvent;
  try {
    event = JSON.parse(payload) as StripeWebhookEvent;
  } catch {
    throw new WebhookVerificationError('Webhook payload is not valid JSON');
  }
  if (!event.id || !event.type) {
    throw new WebhookVerificationError('Webhook payload missing id/type');
  }
  return event;
}

/**
 * Build a signed Stripe-Signature header for a payload. Used by the test suite
 * (and could back a local webhook simulator) to exercise the verification path.
 */
export function signWebhookPayload(
  payload: string,
  secret: string,
  timestampSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const signature = createHmac('sha256', secret)
    .update(`${timestampSeconds}.${payload}`)
    .digest('hex');
  return `t=${timestampSeconds},v1=${signature}`;
}
