'use client';

import type { DailyEarnings } from '@/lib/types';
import { formatDate, formatUsd } from '@/lib/format';
import { EmptyState } from './states';

/**
 * Dependency-free SVG bar chart of daily developer-share earnings. Bars are
 * sorted oldest→newest and scaled to the busiest day.
 */
export function EarningsChart({ daily }: { daily: DailyEarnings[] }) {
  if (daily.length === 0) {
    return <EmptyState>No earnings yet — install the CLI and serve your first ad.</EmptyState>;
  }

  const rows = [...daily].sort((a, b) => (a.date < b.date ? -1 : 1));
  const max = Math.max(...rows.map((r) => r.devShareCents), 1);

  return (
    <div data-testid="earnings-chart">
      <div className="flex h-40 items-end gap-1" role="img" aria-label="Daily earnings bar chart">
        {rows.map((r) => {
          const heightPct = Math.max((r.devShareCents / max) * 100, 2);
          return (
            <div key={r.date} className="group relative flex flex-1 flex-col items-center">
              <div
                className="w-full rounded-t transition-opacity group-hover:opacity-80"
                style={{ height: `${heightPct}%`, background: 'rgb(var(--brand))' }}
              />
              <span
                className="pointer-events-none absolute -top-7 hidden whitespace-nowrap rounded px-1.5 py-0.5 text-xs text-white group-hover:block"
                style={{ background: 'rgb(var(--text))' }}
              >
                {formatUsd(r.devShareCents)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs muted">
        <span>{formatDate(rows[0].date)}</span>
        <span>{formatDate(rows[rows.length - 1].date)}</span>
      </div>
    </div>
  );
}
