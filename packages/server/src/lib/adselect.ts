import type { CampaignRecord } from '../store/types.js';

/**
 * Pick one campaign from the eligible pool, weighted by CPM bid.
 *
 * Higher bids are served more often, but every eligible campaign keeps a
 * non-zero chance — so lower bidders still get impressions (and the client's
 * ad bar visibly rotates) instead of the single top bidder winning 100% of the
 * fill. A bid of 0 is floored to weight 1 so it can still occasionally serve.
 *
 * `rng` is injectable for deterministic tests; it must return [0, 1).
 */
export function pickWeightedByBid(
  candidates: CampaignRecord[],
  rng: () => number = Math.random,
): CampaignRecord | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const weights = candidates.map((c) => Math.max(1, c.cpmBidCents));
  const total = weights.reduce((sum, w) => sum + w, 0);

  let r = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r < 0) return candidates[i];
  }
  // Floating-point fallthrough: return the last candidate.
  return candidates[candidates.length - 1];
}
