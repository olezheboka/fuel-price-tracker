import { describe, it, expect } from 'vitest';
import {
  DISCOUNT_MARKER_RE, EXTERNAL_DISCOUNT_RE, droppedEnough, isDiscountDay,
} from '../../src/lib/discounts.js';

// This is the de-duplicated decision tree shared by the chart and history table.
describe('discount marker regexes', () => {
  it('should_match_the_prices_page_uniform_text', () => {
    expect(DISCOUNT_MARKER_RE.test('Visās stacijās cenas vienādas')).toBe(true);
  });
  it('should_match_the_server_injected_marker', () => {
    expect(DISCOUNT_MARKER_RE.test('samazināta cena')).toBe(true);
    expect(EXTERNAL_DISCOUNT_RE.test('samazināta cena')).toBe(true);
  });
  it('should_not_treat_a_plain_address_as_a_marker', () => {
    expect(DISCOUNT_MARKER_RE.test('Brīvības gatve 297, Rīga')).toBe(false);
    expect(EXTERNAL_DISCOUNT_RE.test('Visās stacijās cenas vienādas')).toBe(false);
  });
});

describe('droppedEnough', () => {
  it('should_be_true_at_or_above_4_cents', () => {
    expect(droppedEnough(1.80, 1.76)).toBe(true);   // exactly 4c
    expect(droppedEnough(1.80, 1.70)).toBe(true);
  });
  it('should_be_false_below_4_cents', () => {
    expect(droppedEnough(1.80, 1.78)).toBe(false);  // 2c
  });
});

describe('isDiscountDay', () => {
  it('should_flag_externally_confirmed_days_regardless_of_drop', () => {
    expect(isDiscountDay({ hasExternalDiscount: true, isFirst: false, hasDiscountLocation: true, prevHasDiscountLocation: true, anyFuelDropped: false })).toBe(true);
  });
  it('should_not_flag_the_first_row', () => {
    expect(isDiscountDay({ hasExternalDiscount: false, isFirst: true, hasDiscountLocation: true, prevHasDiscountLocation: false, anyFuelDropped: true })).toBe(false);
  });
  it('should_flag_a_fresh_marker_onset_with_a_qualifying_drop', () => {
    expect(isDiscountDay({ hasExternalDiscount: false, isFirst: false, hasDiscountLocation: true, prevHasDiscountLocation: false, anyFuelDropped: true })).toBe(true);
  });
  it('should_not_flag_a_lingering_marker_from_the_previous_day', () => {
    expect(isDiscountDay({ hasExternalDiscount: false, isFirst: false, hasDiscountLocation: true, prevHasDiscountLocation: true, anyFuelDropped: true })).toBe(false);
  });
  it('should_not_flag_a_fresh_marker_without_a_qualifying_drop', () => {
    expect(isDiscountDay({ hasExternalDiscount: false, isFirst: false, hasDiscountLocation: true, prevHasDiscountLocation: false, anyFuelDropped: false })).toBe(false);
  });
});
