import { describe, expect, it } from 'vitest';
import { pickWeightedByBid } from '../src/lib/adselect.js';
import type { CampaignRecord } from '../src/store/types.js';

function campaign(id: string, cpmBidCents: number): CampaignRecord {
  return {
    id,
    advertiserId: 'adv',
    headline: `c-${id}`,
    targetUrl: 'https://x',
    cpmBidCents,
    dailyBudgetCents: 1_000_000,
    spentTodayCents: 0,
    spentTodayMillicents: 0,
    balanceCents: 1_000_000,
    billedImpressions: 0,
    status: 'active',
    targetingCountries: [],
    targetingPlatforms: [],
    createdAt: new Date(0),
  };
}

describe('pickWeightedByBid', () => {
  it('returns null for an empty pool and the sole candidate for a singleton', () => {
    expect(pickWeightedByBid([])).toBeNull();
    const only = campaign('a', 100);
    expect(pickWeightedByBid([only])).toBe(only);
  });

  it('maps the rng value onto cumulative bid weights deterministically', () => {
    const a = campaign('a', 100); // weights: a=100, b=300, total=400
    const b = campaign('b', 300);
    // r = rng*400; first 100 -> a, remainder -> b.
    expect(pickWeightedByBid([a, b], () => 0)?.id).toBe('a'); // r=0
    expect(pickWeightedByBid([a, b], () => 0.2)?.id).toBe('a'); // r=80 < 100
    expect(pickWeightedByBid([a, b], () => 0.25)?.id).toBe('b'); // r=100 -> into b
    expect(pickWeightedByBid([a, b], () => 0.999)?.id).toBe('b'); // r≈399.6
  });

  it('floors a zero bid to a non-zero weight so it can still serve', () => {
    const zero = campaign('z', 0); // weight floored to 1
    const big = campaign('g', 99); // total = 100
    // rng just under 1/100 lands in the first (zero-bid) bucket.
    expect(pickWeightedByBid([zero, big], () => 0)?.id).toBe('z');
    expect(pickWeightedByBid([zero, big], () => 0.005)?.id).toBe('z');
    expect(pickWeightedByBid([zero, big], () => 0.5)?.id).toBe('g');
  });

  it('favors higher bids over many draws', () => {
    const lo = campaign('lo', 80);
    const hi = campaign('hi', 200);
    let hiCount = 0;
    // Deterministic sweep of rng across [0,1) instead of Math.random.
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const r = i / N;
      if (pickWeightedByBid([lo, hi], () => r)?.id === 'hi') hiCount += 1;
    }
    // hi weight share = 200/280 ≈ 0.714.
    expect(hiCount).toBeGreaterThan(N * 0.65);
    expect(hiCount).toBeLessThan(N * 0.78);
  });
});
