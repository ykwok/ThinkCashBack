import { Hono } from 'hono';
import { payoutRequestSchema, type Payout } from '@thinkcashback/shared';
import type { AppBindings } from '../lib/context.js';
import { sessionAuth } from '../middleware/auth.js';
import { fail, ok } from '../lib/response.js';

export const payoutRoutes = new Hono<AppBindings>();

/**
 * POST /api/v1/me/connect
 *
 * Start (or resume) Stripe Connect Express onboarding for the developer. On
 * first call we create the connected account and persist its id; every call
 * returns a fresh onboarding link the client should redirect the user to.
 */
payoutRoutes.post('/me/connect', sessionAuth, async (c) => {
  const dev = c.get('developer')!;
  const store = c.get('store');
  const env = c.get('env');
  const stripe = c.get('stripe');

  let connectId = dev.stripeConnectId;
  if (!connectId) {
    const account = await stripe.createConnectAccount({ email: dev.email, developerId: dev.id });
    connectId = account.id;
    await store.setDeveloperStripeConnect(dev.id, connectId);
  }

  const link = await stripe.createAccountLink({
    accountId: connectId,
    refreshUrl: `${env.PUBLIC_BASE_URL}/connect/refresh`,
    returnUrl: `${env.PUBLIC_BASE_URL}/connect/return`,
  });

  return ok(c, { connectId, onboardingUrl: link.url });
});

/** GET /api/v1/me/payouts — payout history for the authenticated developer. */
payoutRoutes.get('/me/payouts', sessionAuth, async (c) => {
  const dev = c.get('developer')!;
  const rows = await c.get('store').payoutsForDeveloper(dev.id);
  return ok(
    c,
    rows.map(
      (p): Payout => ({
        id: p.id,
        developerId: p.developerId,
        amountCents: p.amountCents,
        status: p.status,
        stripeTransferId: p.stripeTransferId,
        createdAt: p.createdAt.toISOString(),
      }),
    ),
  );
});

/**
 * POST /api/v1/me/payouts
 *
 * Settle the developer's available earnings into a Stripe Connect transfer.
 * V1 withdraws the full available balance (>= PAYOUT_MIN_CENTS). The payout
 * starts `processing`; the `payout.paid` webhook finalizes it to `paid` and
 * flips the linked ledger rows to `paid`.
 */
payoutRoutes.post('/me/payouts', sessionAuth, async (c) => {
  const dev = c.get('developer')!;
  const store = c.get('store');
  const env = c.get('env');

  let body: unknown = {};
  // Body is optional; tolerate an empty / missing JSON body.
  try {
    const text = await c.req.text();
    if (text.trim().length > 0) body = JSON.parse(text);
  } catch {
    return fail(c, 400, 'BAD_JSON', 'Request body must be valid JSON');
  }
  const parsed = payoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, 422, 'VALIDATION_ERROR', 'Invalid payout payload', {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  if (!dev.stripeConnectId) {
    return fail(
      c,
      409,
      'PAYOUT_NO_CONNECT',
      'Connect a Stripe account first (POST /api/v1/me/connect)',
    );
  }

  const available = await store.availableEarnings(dev.id);
  const totalCents = available.reduce((sum, e) => sum + e.devShareCents, 0);

  if (totalCents < env.PAYOUT_MIN_CENTS) {
    return fail(c, 422, 'PAYOUT_BELOW_MINIMUM', 'Available balance is below the payout minimum', {
      availableCents: totalCents,
      minimumCents: env.PAYOUT_MIN_CENTS,
    });
  }
  // V1: partial payouts are not supported — an explicit amount must equal the
  // full available balance.
  if (parsed.data.amount_cents !== undefined && parsed.data.amount_cents !== totalCents) {
    return fail(c, 422, 'PARTIAL_PAYOUT_UNSUPPORTED', 'Only full-balance payouts are supported', {
      availableCents: totalCents,
    });
  }

  const payout = await store.createPayout({
    developerId: dev.id,
    amountCents: totalCents,
    earningIds: available.map((e) => e.id),
    status: 'processing',
  });

  try {
    const transfer = await c.get('stripe').createTransfer({
      amountCents: totalCents,
      currency: env.STRIPE_CURRENCY,
      destination: dev.stripeConnectId,
      idempotencyKey: payout.id,
      metadata: { payout_id: payout.id, developer_id: dev.id },
    });
    await store.setPayoutTransfer(payout.id, transfer.id);

    const payload: Payout = {
      id: payout.id,
      developerId: payout.developerId,
      amountCents: payout.amountCents,
      status: payout.status,
      stripeTransferId: transfer.id,
      createdAt: payout.createdAt.toISOString(),
    };
    return ok(c, payload, 201);
  } catch {
    // Transfer failed to even be created — release the held earnings.
    await store.markPayoutFailed(payout.id);
    return fail(c, 502, 'PAYOUT_TRANSFER_FAILED', 'Could not create the payout transfer');
  }
});
