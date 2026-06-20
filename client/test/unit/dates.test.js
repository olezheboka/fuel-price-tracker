import { describe, it, expect } from 'vitest';
import { getRigaDateParts, fmtRigaYmd, fmtRigaShort } from '../../src/lib/dates.js';

// All price bucketing keys off Riga-local dates. An off-by-one here mis-buckets
// every chart point and history row, so DST boundaries are the key cases.
describe('getRigaDateParts', () => {
  it('should_return_riga_local_components_in_winter_utc_plus_2', () => {
    // 2026-01-15 23:30 UTC is already 01:30 on the 16th in Riga (UTC+2).
    expect(getRigaDateParts('2026-01-15T23:30:00Z')).toEqual({ year: 2026, month: 1, day: 16 });
  });

  it('should_return_riga_local_components_in_summer_utc_plus_3', () => {
    // 2026-06-20 22:30 UTC is 01:30 on the 21st in Riga (UTC+3, DST).
    expect(getRigaDateParts('2026-06-20T22:30:00Z')).toEqual({ year: 2026, month: 6, day: 21 });
  });

  it('should_keep_the_same_calendar_day_for_midday_utc', () => {
    expect(getRigaDateParts('2026-06-20T10:00:00Z')).toEqual({ year: 2026, month: 6, day: 20 });
  });
});

describe('fmtRigaYmd', () => {
  it('should_zero_pad_month_and_day', () => {
    expect(fmtRigaYmd('2026-03-05T09:00:00Z')).toBe('2026-03-05');
  });
});

describe('fmtRigaShort', () => {
  it('should_format_as_dd_mm_yy', () => {
    expect(fmtRigaShort('2026-03-05T09:00:00Z')).toBe('05.03.26');
  });
});
