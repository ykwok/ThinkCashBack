import { describe, expect, it } from 'vitest';
import {
  cumulativeCostCents,
  devShareCents,
  impressionChargeCents,
  utcDayStart,
} from '../src/lib/money.js';
import {
  constructWebhookEvent,
  signWebhookPayload,
  WebhookVerificationError,
} from '../src/lib/stripe.js';

describe('money math', () => {
  it('charges sub-cent CPM exactly via cumulative delta rounding', () => {
    // $1.00 CPM => 0.1 cent per impression. Per-impression rounding would lose
    // every charge; the cumulative method must total to 100 cents at 1000 imps.
    const cpm = 100;
    let total = 0;
    for (let i = 0; i < 1000; i++) total += impressionChargeCents(i, cpm);
    expect(total).toBe(cumulativeCostCents(1000, cpm));
    expect(total).toBe(100);
  });

  it('computes the 80% developer share', () => {
    expect(devShareCents(1000, 8000)).toBe(800);
    expect(devShareCents(5, 8000)).toBe(4); // 4.0 -> 4
    expect(devShareCents(7, 8000)).toBe(6); // 5.6 -> 6
  });

  it('buckets to the start of the UTC day', () => {
    const d = utcDayStart(new Date('2026-06-15T18:42:11Z'));
    expect(d.toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });
});

describe('Stripe webhook signature verification', () => {
  const secret = 'whsec_unit';
  const payload = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded', data: {} });

  it('accepts a correctly signed payload', () => {
    const sig = signWebhookPayload(payload, secret);
    const event = constructWebhookEvent(payload, sig, secret);
    expect(event.id).toBe('evt_1');
    expect(event.type).toBe('payment_intent.succeeded');
  });

  it('rejects a tampered payload', () => {
    const sig = signWebhookPayload(payload, secret);
    expect(() => constructWebhookEvent(payload + ' ', sig, secret)).toThrow(
      WebhookVerificationError,
    );
  });

  it('rejects a wrong secret', () => {
    const sig = signWebhookPayload(payload, secret);
    expect(() => constructWebhookEvent(payload, sig, 'whsec_other')).toThrow(
      WebhookVerificationError,
    );
  });

  it('rejects a missing signature header', () => {
    expect(() => constructWebhookEvent(payload, undefined, secret)).toThrow(
      WebhookVerificationError,
    );
  });

  it('rejects an event outside the timestamp tolerance', () => {
    const stale = signWebhookPayload(payload, secret, 1_000_000);
    expect(() => constructWebhookEvent(payload, stale, secret, 1_000_000 + 600)).toThrow(
      /tolerance/,
    );
  });
});
