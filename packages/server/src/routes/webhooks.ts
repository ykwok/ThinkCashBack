import { Hono } from 'hono';
import type { AppBindings } from '../lib/context.js';
import { fail, ok } from '../lib/response.js';
import { constructWebhookEvent, WebhookVerificationError } from '../lib/stripe.js';

export const webhookRoutes = new Hono<AppBindings>();

/**
 * POST /api/v1/webhooks/stripe
 *
 * Stripe event sink. The signature is verified against the raw request body
 * (never the parsed JSON). Every event id is recorded before handling so a
 * redelivered event is a no-op — exactly-once processing.
 *
 * Handled events:
 *   - payment_intent.succeeded → credit the campaign budget (top-up settled)
 *   - payout.paid              → finalize the developer payout + ledger rows
 *   - payout.failed / transfer.failed → release the held earnings
 */
webhookRoutes.post('/webhooks/stripe', async (c) => {
  const env = c.get('env');
  const store = c.get('store');

  // Signature verification requires the exact bytes Stripe signed.
  const rawBody = await c.req.text();
  const signature = c.req.header('stripe-signature');

  let event;
  try {
    event = constructWebhookEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return fail(c, 400, 'WEBHOOK_SIGNATURE_INVALID', 'Webhook signature verification failed');
    }
    throw err;
  }

  // Idempotency: skip events we have already processed.
  const fresh = await store.recordWebhookEvent(event.id, event.type);
  if (!fresh) {
    return ok(c, { received: true, duplicate: true });
  }

  const object = event.data?.object ?? {};
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const intentId = typeof object.id === 'string' ? object.id : null;
      if (intentId) await store.markPaymentSucceeded(intentId);
      break;
    }
    case 'payout.paid':
    case 'transfer.paid': {
      const payoutId = await resolvePayoutId(store, object);
      if (payoutId) await store.markPayoutPaid(payoutId);
      break;
    }
    case 'payout.failed':
    case 'transfer.failed': {
      const payoutId = await resolvePayoutId(store, object);
      if (payoutId) await store.markPayoutFailed(payoutId);
      break;
    }
    default:
      // Unhandled event types are acknowledged so Stripe stops retrying.
      break;
  }

  return ok(c, { received: true });
});

/**
 * Resolve our internal payout id from a Stripe payout/transfer object: prefer
 * the `payout_id` we set in metadata, otherwise match on the stored transfer id.
 */
async function resolvePayoutId(
  store: AppBindings['Variables']['store'],
  object: Record<string, unknown>,
): Promise<string | null> {
  const metadata = (object.metadata as Record<string, unknown> | undefined) ?? {};
  if (typeof metadata.payout_id === 'string') return metadata.payout_id;
  if (typeof object.id === 'string') {
    const payout = await store.getPayoutByTransferId(object.id);
    if (payout) return payout.id;
  }
  return null;
}
