import { describe, it, expect } from 'vitest';
import { validatePrice, MIN_REALISTIC_PRICE, MAX_REALISTIC_PRICE } from '../../scrapers/normalize.js';

// validatePrice is the sanity gate that closes the "parser glitch publishes a
// bogus price" gap. It must reject 0/negative/NaN/absurd while accepting the
// full realistic Latvian retail range (LPG ~0.6 up to premium diesel ~2.2).
describe('validatePrice', () => {
    it('should_accept_typical_petrol_price', () => {
        expect(validatePrice(1.717)).toBe(true);
    });

    it('should_accept_low_lpg_price', () => {
        expect(validatePrice(0.835)).toBe(true);
    });

    it('should_reject_zero', () => {
        expect(validatePrice(0)).toBe(false);
    });

    it('should_reject_negative_price', () => {
        expect(validatePrice(-1.5)).toBe(false);
    });

    it('should_reject_NaN', () => {
        expect(validatePrice(NaN)).toBe(false);
    });

    it('should_reject_non_number', () => {
        expect(validatePrice('1.7')).toBe(false);
        expect(validatePrice(null)).toBe(false);
        expect(validatePrice(undefined)).toBe(false);
    });

    it('should_reject_price_above_realistic_max', () => {
        // e.g. a mis-split "18.17" from a malformed cell
        expect(validatePrice(18.17)).toBe(false);
    });

    it('should_treat_the_documented_bounds_as_inclusive', () => {
        expect(validatePrice(MIN_REALISTIC_PRICE)).toBe(true);
        expect(validatePrice(MAX_REALISTIC_PRICE)).toBe(true);
    });
});
