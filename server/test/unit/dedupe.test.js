import { describe, it, expect } from 'vitest';
import { dedupeLowest } from '../../scrapers/normalize.js';

// dedupeLowest collapses a site that lists the same fuel twice down to the
// cheapest row — the value the UI ultimately shows for that chain.
describe('dedupeLowest', () => {
    it('should_keep_the_lowest_price_per_fuel_type', () => {
        const rows = [
            { type: '95', price: 1.80, source: 'X' },
            { type: '95', price: 1.70, source: 'X' },
            { type: 'diesel', price: 1.65, source: 'X' },
        ];
        const out = dedupeLowest(rows);
        expect(out).toHaveLength(2);
        expect(out.find((r) => r.type === '95').price).toBe(1.70);
        expect(out.find((r) => r.type === 'diesel').price).toBe(1.65);
    });

    it('should_pass_a_single_row_through_unchanged', () => {
        const rows = [{ type: '98', price: 1.9, source: 'X' }];
        expect(dedupeLowest(rows)).toEqual(rows);
    });

    it('should_return_empty_for_no_rows', () => {
        expect(dedupeLowest([])).toEqual([]);
    });
});
