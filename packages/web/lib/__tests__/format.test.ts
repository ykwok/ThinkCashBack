import { describe, expect, it } from 'vitest';
import { formatBps, formatCount, formatDate, formatUsd } from '../format';

describe('format helpers', () => {
  it('formats cents as USD', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(100)).toBe('$1.00');
    expect(formatUsd(123456)).toBe('$1,234.56');
  });

  it('formats counts with separators', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(1500000)).toBe('1,500,000');
  });

  it('formats basis points as a percentage', () => {
    expect(formatBps(8000)).toBe('80%');
    expect(formatBps(10000)).toBe('100%');
    expect(formatBps(8050)).toBe('80.50%');
  });

  it('formats ISO dates and passes through invalid input', () => {
    expect(formatDate('2026-06-15')).toBe('Jun 15, 2026');
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});
