/**
 * Earnings / spend money math.
 *
 * V1 pricing (decided in the wave-2 PRD): a fixed CPM of $1.00 per 1,000
 * impressions and an 80% developer revenue share. A single impression is
 * therefore worth a *sub-cent* amount, so we MUST NOT do the math in integer
 * cents — `cpm_bid_cents / 1000` truncates to zero and earnings never accrue.
 *
 * The precision unit is the **millicent** (1 cent = 1,000 millicents). Per
 * impression the gross spend in millicents is exactly `cpm_bid_cents`
 * (cpm_bid_cents/1000 cents x 1000 millicents/cent), which is a clean integer
 * with no truncation. Amounts are accumulated as integer millicents and only
 * converted to (possibly fractional) cents for display/aggregation.
 */

export const MILLICENTS_PER_CENT = 1000;

/** Gross advertiser spend for one verified impression, in millicents. */
export function impressionGrossMillicents(cpmBidCents: number): number {
  // gross cents = cpmBidCents / 1000; in millicents that is exactly cpmBidCents.
  return cpmBidCents;
}

/**
 * Developer share for one verified impression, in millicents.
 * revShareBps is basis points (8000 = 80%). Rounded to the nearest millicent
 * to avoid systematic truncation bias across many impressions.
 */
export function impressionDevShareMillicents(cpmBidCents: number, revShareBps: number): number {
  return Math.round((impressionGrossMillicents(cpmBidCents) * revShareBps) / 10_000);
}

/** Convert millicents to cents (may be fractional — do not re-truncate). */
export function millicentsToCents(millicents: number): number {
  return millicents / MILLICENTS_PER_CENT;
}

/** Round millicents to whole cents (used for the display-only cents columns). */
export function millicentsToWholeCents(millicents: number): number {
  return Math.round(millicents / MILLICENTS_PER_CENT);
}

/** UTC day-bounded billing period for a given instant. */
export function dayPeriod(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end };
}
