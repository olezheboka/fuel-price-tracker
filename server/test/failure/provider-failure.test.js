import { describe, it, expect } from 'vitest';
import { parseCircleK } from '../../scrapers/circlek.js';
import { parseVirsi } from '../../scrapers/virsi.js';
import { parseViada } from '../../scrapers/viada.js';
import { parseNestePrices } from '../../scraper.js';

const PARSERS = [
    ['CircleK', parseCircleK],
    ['Virsi', parseVirsi],
    ['Viada', parseViada],
    ['Neste', parseNestePrices],
];

// Graceful degradation starts at the parser: malformed/empty input must yield an
// empty array, never throw. (A throw would still be caught by the scraper's
// try/catch, but returning [] keeps the contract clean and testable.)
describe.each(PARSERS)('%s parser robustness', (name, parse) => {
    it('should_return_empty_array_for_empty_html', () => {
        expect(parse('')).toEqual([]);
    });

    it('should_return_empty_array_for_garbage_html', () => {
        expect(parse('<html><body><h1>503 Service Unavailable</h1></body></html>')).toEqual([]);
    });

    it('should_not_throw_on_a_truncated_document', () => {
        expect(() => parse('<table><tr><td>95')).not.toThrow();
    });
});

// Malformed price cells must be skipped (NaN / out-of-range), good rows kept.
describe('CircleK skips bad price cells but keeps good ones', () => {
    it('should_drop_rows_with_unparseable_or_absurd_prices', () => {
        const html = `<table>
            <tr><td>95miles</td><td>not-a-price</td><td>Brivibas 1, Riga</td></tr>
            <tr><td>Dmiles</td><td>1.704 EUR</td><td>Krasta 2, Riga</td></tr>
            <tr><td>98miles+</td><td>9999 EUR</td><td>Krasta 3, Riga</td></tr>
        </table>`;
        const rows = parseCircleK(html);
        expect(rows).toHaveLength(1);
        expect(rows[0].type).toBe('diesel');
        expect(rows[0].price).toBe(1.704);
    });
});
