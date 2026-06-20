import { describe, it, expect } from 'vitest';
import { parsePrice } from '../../scrapers/normalize.js';

// parsePrice is the single funnel every non-Neste price flows through, so its
// decimal/comma/garbage handling is the highest-value pure unit under test.
describe('parsePrice', () => {
    it('should_parse_comma_decimal_to_float', () => {
        expect(parsePrice('1,754')).toBe(1.754);
    });

    it('should_parse_dot_decimal_with_currency_suffix', () => {
        expect(parsePrice('1.817 EUR')).toBe(1.817);
    });

    it('should_strip_non_breaking_spaces_and_symbols', () => {
        expect(parsePrice(' € 1,659 ')).toBe(1.659);
    });

    it('should_keep_four_decimal_gas_prices', () => {
        expect(parsePrice('0.9715 EUR')).toBe(0.9715);
    });

    it('should_return_NaN_for_non_numeric_input', () => {
        expect(Number.isNaN(parsePrice('n/a'))).toBe(true);
    });

    it('should_return_NaN_for_empty_input', () => {
        expect(Number.isNaN(parsePrice(''))).toBe(true);
    });
});
