import { describe, expect, it } from 'vitest';
import {
  applyDateRule,
  normalizeScheduledDates,
  toggleScheduledDate,
} from './scheduleDates';

describe('scheduleDates', () => {
  it('normalizes dates by sorting and deduplicating', () => {
    expect(normalizeScheduledDates(['2026-05-04', '2026-04-28', '2026-05-04'])).toEqual([
      '2026-04-28',
      '2026-05-04',
    ]);
  });

  it('generates weekdays from a date range', () => {
    expect(applyDateRule('weekdays', '2026-05-01', '2026-05-05')).toEqual([
      '2026-05-01',
      '2026-05-04',
      '2026-05-05',
    ]);
  });

  it('toggles selected dates', () => {
    expect(toggleScheduledDate(['2026-05-04'], '2026-05-04')).toEqual([]);
    expect(toggleScheduledDate([], '2026-05-04')).toEqual(['2026-05-04']);
  });

  it('rejects invalid ISO dates when normalizing and toggling', () => {
    expect(normalizeScheduledDates(['2026-02-30', '20260504', '2026-05-04'])).toEqual([
      '2026-05-04',
    ]);
    expect(toggleScheduledDate(['2026-05-04'], '2026-02-30')).toEqual(['2026-05-04']);
  });

  it('generates weekends and Monday Wednesday Friday rules', () => {
    expect(applyDateRule('weekends', '2026-05-01', '2026-05-05')).toEqual([
      '2026-05-02',
      '2026-05-03',
    ]);
    expect(applyDateRule('mon-wed-fri', '2026-05-01', '2026-05-06')).toEqual([
      '2026-05-01',
      '2026-05-04',
      '2026-05-06',
    ]);
  });
});
