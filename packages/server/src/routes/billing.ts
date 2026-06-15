import { Hono } from 'hono';
import { topupSchema, type Payment } from '@thinkcashback/shared';
import type { AppBindings } from '../lib/context.js';
import { sessionAuth } from '../middleware/auth.js';
import { fail, ok } from '../lib/response.js';

export const billingRoutes = new Hono<AppBindings>();

/**
 * POST /api/v1/advertisers/:id/topup
 *
 * Funds a campaign's budget. We create a Stripe PaymentIntent (test or live
 * mode) and a `pending` payment row; the campaign balance is credited only when
 * Stripe confirms via the `payment_intent.succeeded` webhook. The client uses
 * the returned `clientSecret` to complete payment.
 */
billingRoutes.post('/advertisers/:id/topup', sessionAuth, async (c) => {
  const advertiserId = c.req.param('id');
  const store = c.get('store');
  const env = c.get('env');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, 400, 'BAD_JSON', 'Request body must be valid JSON');
  }

  const parsed = topupSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, 422, 'VALIDATION_ERROR', 'Invalid top-up payload', {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const advertiser = await store.getAdvertiserById(advertiserId);
  if (!advertiser) {
    return fail(c, 404, 'ADVERTISER_NOT_FOUND', 'Unknown advertiser');
  }

  const campaign = await store.getCampaignById(parsed.data.campaign_id);
  if (!campaign) {
    return fail(c, 404, 'CAMPAIGN_NOT_FOUND', 'Unknown campaign');
  }
  if (campaign.advertiserId !== advertiserId) {
    return fail(c, 409, 'CAMPAIGN_MISMATCH', 'Campaign does not belong to this advertiser');
  }

  const currency = parsed.data.currency ?? env.STRIPE_CURRENCY;
  const payment = await store.createPayment({
    advertiserId,
    campaignId: campaign.id,
    amountCents: parsed.data.amount_cents,
    currency,
    stripePaymentIntentId: null,
    status: 'pending',
  });

  const intent = await c.get('stripe').createTopupIntent({
    amountCents: parsed.data.amount_cents,
    currency,
    advertiserId,
    campaignId: campaign.id,
    customerId: advertiser.stripeCustomerId,
  });
  await store.setPaymentIntentId(payment.id, intent.id);

  const payload: Payment = {
    id: payment.id,
    advertiserId: payment.advertiserId,
    campaignId: payment.campaignId,
    amountCents: payment.amountCents,
    currency: payment.currency,
    status: payment.status,
    stripePaymentIntentId: intent.id,
    clientSecret: intent.clientSecret,
    createdAt: payment.createdAt.toISOString(),
  };
  return ok(c, payload, 201);
});
