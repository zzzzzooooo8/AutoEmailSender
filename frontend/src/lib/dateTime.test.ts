import { describe, expect, it } from 'vitest';
import { formatApiDateTime, parseApiDateTime } from './dateTime';

describe('dateTime', () => {
  it('parses api datetime without timezone suffix as utc', () => {
    expect(parseApiDateTime('2026-04-27 02:54:06').toISOString()).toBe(
      '2026-04-27T02:54:06.000Z',
    );
  });

  it('formats api datetime to minute precision by default', () => {
    expect(formatApiDateTime('2026-04-27T02:54:06Z')).toMatch(/\d{2}:\d{2}$/);
  });

  it('formats api datetime to second precision when requested', () => {
    expect(
      formatApiDateTime('2026-04-27T02:54:06Z', {
        second: '2-digit',
      }),
    ).toMatch(/\d{2}:\d{2}:\d{2}$/);
  });
});
