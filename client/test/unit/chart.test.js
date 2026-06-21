import { describe, it, expect } from 'vitest';
import { buildChartData, defaultBrushWindow, resolveBrushFromDates } from '../../src/lib/chart.js';

// Synthetic history row. Neste stores full product names; others canonical ids.
const NESTE_NAME = { '95': 'Neste Futura 95', '98': 'Neste Futura 98', diesel: 'Neste Futura D', pro: 'Neste Pro Diesel' };
const row = (date, fuel, price, { source = 'Neste', location = 'Brīvības 1' } = {}) => ({
  type: source === 'Neste' ? NESTE_NAME[fuel] : fuel,
  price,
  location,
  source,
  timestamp: `${date}T09:00:00Z`,
});

const NOW = new Date('2026-06-30T00:00:00Z');

describe('buildChartData — shape & aggregation', () => {
  it('should_return_empty_for_no_history', () => {
    expect(buildChartData([])).toEqual([]);
    expect(buildChartData(null)).toEqual([]);
  });

  it('should_build_one_entry_per_day_with_the_station_series_value', () => {
    const out = buildChartData([row('2026-06-20', '95', 1.717)], { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].periodKey).toBe('2026-06-20');
    expect(out[0].formattedTime).toBe('20.06.2026');
    expect(out[0]['95__Neste']).toBe(1.717);
  });

  it('should_plot_the_last_price_and_an_intraday_min_max_range', () => {
    const out = buildChartData([
      { ...row('2026-06-20', '95', 1.70), timestamp: '2026-06-20T08:00:00Z' },
      { ...row('2026-06-20', '95', 1.66), timestamp: '2026-06-20T10:00:00Z' },
    ], { now: NOW });
    const e = out[0];
    expect(e['95__Neste']).toBe(1.66);        // last
    expect(e['95__Neste_min']).toBe(1.66);
    expect(e['95__Neste_max']).toBe(1.70);
    expect(e['95__Neste_range'][0]).toBeCloseTo(0, 5);    // down err (last-min)
    expect(e['95__Neste_range'][1]).toBeCloseTo(0.04, 5); // up err (max-last)
    expect(e['95__Neste_history']).toHaveLength(2);
  });

  it('should_not_attach_a_range_when_price_was_flat_all_day', () => {
    const out = buildChartData([
      { ...row('2026-06-20', '95', 1.70), timestamp: '2026-06-20T08:00:00Z' },
      { ...row('2026-06-20', '95', 1.70), timestamp: '2026-06-20T10:00:00Z' },
    ], { now: NOW });
    expect(out[0]['95__Neste_range']).toBeUndefined();
  });

  it('should_keep_separate_series_per_station_and_fuel', () => {
    const out = buildChartData([
      row('2026-06-20', '95', 1.717, { source: 'Neste' }),
      row('2026-06-20', '95', 1.647, { source: 'Viada' }),
      row('2026-06-20', 'diesel', 1.59, { source: 'Viada' }),
    ], { now: NOW });
    expect(out[0]['95__Neste']).toBe(1.717);
    expect(out[0]['95__Viada']).toBe(1.647);
    expect(out[0]['diesel__Viada']).toBe(1.59);
  });

  it('should_sort_days_ascending_even_for_out_of_order_and_irregular_input', () => {
    const out = buildChartData([
      row('2026-06-20', '95', 1.70),
      row('2026-06-10', '95', 1.72),
      row('2026-06-18', '95', 1.71),
    ], { now: NOW });
    expect(out.map((e) => e.periodKey)).toEqual(['2026-06-10', '2026-06-18', '2026-06-20']);
  });

  it('should_drop_rows_older_than_365_days', () => {
    const out = buildChartData([
      row('2026-06-20', '95', 1.70),
      row('2025-01-01', '95', 1.50), // ~545 days before NOW
    ], { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].periodKey).toBe('2026-06-20');
  });
});

describe('buildChartData — discount flagging (Neste-based)', () => {
  it('should_flag_an_externally_confirmed_day_regardless_of_price_move', () => {
    const out = buildChartData([
      row('2026-06-20', '95', 1.71, { location: 'samazināta cena' }),
    ], { now: NOW });
    expect(out[0].isDiscount).toBe(true);
  });

  it('should_flag_a_fresh_marker_day_with_a_4c_drop', () => {
    const out = buildChartData([
      row('2026-06-19', '95', 1.80, { location: 'Brīvības 1' }),
      row('2026-06-20', '95', 1.75, { location: 'Visās stacijās cenas vienādas' }),
    ], { now: NOW });
    expect(out[0].isDiscount).toBe(false); // first day
    expect(out[1].isDiscount).toBe(true);  // fresh marker + 5c drop
  });

  it('should_not_flag_a_lingering_marker_on_the_recovery_day', () => {
    const out = buildChartData([
      row('2026-06-19', '95', 1.75, { location: 'Visās stacijās cenas vienādas' }),
      row('2026-06-20', '95', 1.74, { location: 'Visās stacijās cenas vienādas' }),
    ], { now: NOW });
    expect(out[1].isDiscount).toBe(false); // marker present on prev day → not a fresh onset
  });
});

describe('buildChartData — large input', () => {
  it('should_aggregate_a_year_of_4_stations_x_5_fuels_correctly', () => {
    // ~7k rows: a year of daily prices for every station/fuel combination.
    // No wall-clock assertion — a timing threshold is flaky on shared CI runners
    // and can't reliably tell linear from quadratic; this guards correctness at
    // scale (and that the pipeline doesn't blow up on a full year of data).
    const sources = ['Neste', 'CircleK', 'Virsi', 'Viada'];
    const fuels = ['95', '98', 'diesel', 'pro', 'gas'];
    const rows = [];
    for (let d = 0; d < 365; d++) {
      const date = new Date(NOW.getTime() - d * 86400000).toISOString().slice(0, 10);
      for (const s of sources) for (const f of fuels) {
        if (s === 'Neste' && f === 'gas') continue; // Neste has no gas
        rows.push(row(date, f, 1.7, { source: s }));
      }
    }
    const out = buildChartData(rows, { now: NOW });
    expect(out).toHaveLength(365);                 // one entry per day
    expect(out[0].date).toBeLessThan(out[364].date); // sorted ascending
    expect(out[0]['95__Neste']).toBe(1.7);        // series populated
    expect(out[0]['gas__Viada']).toBe(1.7);
    expect(out[0]['gas__Neste']).toBeUndefined(); // Neste has no gas
  });
});

describe('defaultBrushWindow', () => {
  it('should_default_to_the_last_30_days', () => {
    expect(defaultBrushWindow(100)).toEqual({ startIndex: 70, endIndex: 99 });
  });
  it('should_show_the_whole_series_when_shorter_than_30', () => {
    expect(defaultBrushWindow(10)).toEqual({ startIndex: 0, endIndex: 9 });
  });
  it('should_handle_an_empty_series', () => {
    expect(defaultBrushWindow(0)).toEqual({ startIndex: 0, endIndex: 0 });
  });
});

describe('resolveBrushFromDates', () => {
  const cd = buildChartData(
    Array.from({ length: 30 }, (_, i) => row(`2026-06-${String(i + 1).padStart(2, '0')}`, '95', 1.7)),
    { now: NOW }
  );

  it('should_map_a_wide_date_window_to_the_matching_indices', () => {
    const { startIndex, endIndex } = resolveBrushFromDates(cd, { s: '2026-06-05', e: '2026-06-20' });
    expect(cd[startIndex].periodKey).toBe('2026-06-05');
    expect(cd[endIndex].periodKey).toBe('2026-06-20');
  });

  it('should_clamp_a_too_narrow_window_to_the_7_day_min_span', () => {
    const { startIndex, endIndex } = resolveBrushFromDates(cd, { s: '2026-06-10', e: '2026-06-12' });
    expect(cd[startIndex].periodKey).toBe('2026-06-10');
    expect(endIndex - startIndex).toBe(6); // 7 inclusive days
  });

  it('should_return_a_zero_window_for_empty_data', () => {
    expect(resolveBrushFromDates([], { s: '2026-06-01', e: '2026-06-30' })).toEqual({ startIndex: 0, endIndex: 0 });
  });
});
