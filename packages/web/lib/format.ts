/** Pure formatting helpers shared across the dashboard. */

/** Format an integer number of US cents as a localized USD string. */
export function formatUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

/** Format an integer with thousands separators (e.g. impressions). */
export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

/** Render basis points as a percentage label, e.g. 8000 -> "80%". */
export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

/** Format an ISO date (YYYY-MM-DD or full ISO) as a short, locale-aware label. */
export function formatDate(iso: string): string {
  // Parse bare YYYY-MM-DD as local midnight so the label never shifts a day
  // across timezones (a plain `new Date('2026-06-15')` is parsed as UTC).
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = new Date(isDateOnly ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
