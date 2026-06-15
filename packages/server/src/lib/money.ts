/**
 * Money math for ThinkCashBack billing.
 *
 * CPM is priced per 1000 impressions, so a single impression is worth a
 * sub-cent fraction (e.g. a $1.00 CPM == 0.1 cent / impression). Storing
 * integer cents per impression would round every charge to zero. Instead we
 * charge on the *cumulative* impression count and bill the integer-cent delta
 * between successive counts. Summed over many impressions this converges to the
 * exact CPM-priced total with no drift.
 */

/** Total cost in whole cents of `count` impressions at the given CPM. */
export function cumulativeCostCents(count: number, cpmBidCents: number): number {
  return Math.round((count * cpmBidCents) / 1000);
}

/**
 * Whole-cent charge incurred by the impression that takes the campaign from
 * `prevCount` to `prevCount + 1` impressions. Usually 0, occasionally 1+.
 */
export function impressionChargeCents(prevCount: number, cpmBidCents: number): number {
  return cumulativeCostCents(prevCount + 1, cpmBidCents) - cumulativeCostCents(prevCount, cpmBidCents);
}

/** Developer share of a gross amount, rounded to whole cents (bps: 8000 = 80%). */
export function devShareCents(grossCents: number, revShareBps: number): number {
  return Math.round((grossCents * revShareBps) / 10_000);
}

/** Start of the UTC day for the given instant — the earnings-ledger bucket key. */
export function utcDayStart(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

/** End (exclusive) of the UTC day for the given instant. */
export function utcDayEnd(at: Date): Date {
  const start = utcDayStart(at);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}
