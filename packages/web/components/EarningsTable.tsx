import type { DailyEarnings } from '@/lib/types';
import { formatCount, formatDate, formatUsd } from '@/lib/format';
import { EmptyState } from './states';

/** Daily breakdown of impressions, gross, and developer share. */
export function EarningsTable({ daily }: { daily: DailyEarnings[] }) {
  if (daily.length === 0) {
    return <EmptyState>No daily activity to show yet.</EmptyState>;
  }

  return (
    <div className="overflow-x-auto" data-testid="earnings-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left muted" style={{ borderColor: 'rgb(var(--border))' }}>
            <th className="py-2 pr-4 font-medium">Date</th>
            <th className="py-2 pr-4 text-right font-medium">Impressions</th>
            <th className="py-2 pr-4 text-right font-medium">Gross</th>
            <th className="py-2 text-right font-medium">Your share</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((row) => (
            <tr
              key={row.date}
              className="border-b last:border-0"
              style={{ borderColor: 'rgb(var(--border))' }}
            >
              <td className="py-2 pr-4">{formatDate(row.date)}</td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {formatCount(row.impressions)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums muted">
                {formatUsd(row.grossCents)}
              </td>
              <td className="py-2 text-right font-semibold tabular-nums">
                {formatUsd(row.devShareCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
