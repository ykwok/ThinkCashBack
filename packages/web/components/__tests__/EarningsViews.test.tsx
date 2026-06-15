import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DailyEarnings } from '@/lib/types';
import { EarningsTable } from '../EarningsTable';
import { EarningsChart } from '../EarningsChart';

const daily: DailyEarnings[] = [
  { date: '2026-06-13', impressions: 1000, grossCents: 100, devShareCents: 80 },
  { date: '2026-06-14', impressions: 2500, grossCents: 250, devShareCents: 200 },
];

describe('earnings views', () => {
  it('renders a row per day with formatted USD shares', () => {
    render(<EarningsTable daily={daily} />);
    expect(screen.getByTestId('earnings-table').querySelectorAll('tbody tr')).toHaveLength(2);
    expect(screen.getByText('$2.00')).toBeInTheDocument();
    expect(screen.getByText('2,500')).toBeInTheDocument();
  });

  it('shows an empty state when there is no activity', () => {
    render(<EarningsTable daily={[]} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('renders one chart bar per day', () => {
    const { container } = render(<EarningsChart daily={daily} />);
    expect(screen.getByTestId('earnings-chart')).toBeInTheDocument();
    // Each day yields one bar wrapper in the flex row.
    expect(container.querySelectorAll('.flex.h-40 > div')).toHaveLength(2);
  });
});
