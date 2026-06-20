import { describe, it, expect } from 'vitest';
import {
  fuelGroupId, stationKey, stationSupportedFuels, effectiveSelectedFuels, cheapestRow,
} from '../../src/lib/fuel.js';

describe('fuelGroupId', () => {
  it('should_map_full_neste_names_to_canonical_ids', () => {
    expect(fuelGroupId({ type: 'Neste Futura 95' })).toBe('95');
    expect(fuelGroupId({ type: 'Neste Pro Diesel' })).toBe('pro');
  });
  it('should_pass_through_canonical_ids_from_other_stations', () => {
    expect(fuelGroupId({ type: 'diesel' })).toBe('diesel');
  });
});

describe('stationKey', () => {
  it('should_default_to_Neste_when_source_missing', () => {
    expect(stationKey({})).toBe('Neste');
    expect(stationKey({ source: 'Viada' })).toBe('Viada');
  });
});

describe('effectiveSelectedFuels (station/fuel intersection)', () => {
  it('should_hide_gas_when_only_neste_is_selected', () => {
    const out = effectiveSelectedFuels(new Set(['95', 'gas']), new Set(['Neste']));
    expect(out.has('95')).toBe(true);
    expect(out.has('gas')).toBe(false);
  });
  it('should_hide_premium_diesel_when_only_virsi_is_selected', () => {
    const out = effectiveSelectedFuels(new Set(['diesel', 'pro']), new Set(['Virsi']));
    expect(out.has('diesel')).toBe(true);
    expect(out.has('pro')).toBe(false);
  });
  it('should_union_support_across_multiple_stations', () => {
    expect([...stationSupportedFuels(new Set(['Neste', 'CircleK']))].sort())
      .toEqual(['95', '98', 'diesel', 'gas', 'pro']);
  });
});

describe('cheapestRow', () => {
  it('should_return_the_lowest_priced_row', () => {
    const rows = [
      { source: 'Neste', price: 1.72 },
      { source: 'Viada', price: 1.64 },
      { source: 'CircleK', price: 1.70 },
    ];
    expect(cheapestRow(rows).source).toBe('Viada');
  });
  it('should_ignore_rows_without_a_finite_price', () => {
    const rows = [{ source: 'A', price: NaN }, { source: 'B', price: 1.9 }];
    expect(cheapestRow(rows).source).toBe('B');
  });
  it('should_return_null_for_an_empty_list', () => {
    expect(cheapestRow([])).toBe(null);
  });
});
