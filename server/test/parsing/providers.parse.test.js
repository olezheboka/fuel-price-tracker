import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCircleK } from '../../scrapers/circlek.js';
import { parseVirsi } from '../../scrapers/virsi.js';
import { parseViada } from '../../scrapers/viada.js';
import { parseNestePrices } from '../../scraper.js';
import { MIN_REALISTIC_PRICE, MAX_REALISTIC_PRICE } from '../../scrapers/normalize.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name, file) =>
    fs.readFileSync(path.join(dir, '..', 'fixtures', name, file), 'utf8');
const expected = (name) =>
    JSON.parse(fixture(name, 'expected.json'));

// Map a row to its canonical fuel group id. Neste rows carry the full product
// name; the other chains already store the canonical id in `type`.
const NESTE_NAME_TO_ID = {
    'Neste Futura 95': '95',
    'Neste Futura 98': '98',
    'Neste Futura D': 'diesel',
    'Neste Pro Diesel': 'pro',
};
const idOf = (row) => NESTE_NAME_TO_ID[row.type] || row.type;

// Per-chain contract: which canonical fuels MUST be present, the expected
// `source` tag, and the parser. Neste lacks gas; Virši lacks premium diesel.
const PROVIDERS = [
    { name: 'neste', parse: parseNestePrices, source: undefined, mustHave: ['95', '98', 'diesel', 'pro'] },
    { name: 'circlek', parse: parseCircleK, source: 'CircleK', mustHave: ['95', '98', 'diesel', 'pro', 'gas'] },
    { name: 'virsi', parse: parseVirsi, source: 'Virsi', mustHave: ['95', '98', 'diesel', 'gas'] },
    { name: 'viada', parse: parseViada, source: 'Viada', mustHave: ['95', '98', 'diesel', 'pro', 'gas'] },
];

describe.each(PROVIDERS)('parse $name fixture', ({ name, parse, source, mustHave }) => {
    const html = fixture(name, 'latest.html');
    const rows = parse(html);

    it('should_parse_at_least_one_priced_fuel', () => {
        // Structure-change canary: a redesign that yields 0 rows fails loudly here.
        expect(rows.length, `${name}: parser returned no rows — provider HTML may have changed`).toBeGreaterThan(0);
    });

    it('should_parse_every_expected_fuel_type_for_this_chain', () => {
        const ids = new Set(rows.map(idOf));
        for (const f of mustHave) {
            expect(ids.has(f), `${name}: expected fuel "${f}" missing from parsed output`).toBe(true);
        }
    });

    it('should_only_produce_prices_within_the_realistic_range', () => {
        for (const r of rows) {
            expect(r.price, `${name}/${r.type}: price ${r.price} out of realistic range`)
                .toBeGreaterThanOrEqual(MIN_REALISTIC_PRICE);
            expect(r.price).toBeLessThanOrEqual(MAX_REALISTIC_PRICE);
        }
    });

    it('should_extract_a_non_empty_location_for_every_row', () => {
        for (const r of rows) {
            expect(typeof r.location).toBe('string');
            expect(r.location.trim().length, `${name}/${r.type}: empty location`).toBeGreaterThan(0);
        }
    });

    if (source) {
        it('should_tag_every_row_with_the_correct_source', () => {
            for (const r of rows) expect(r.source).toBe(source);
        });
    }

    it('should_match_the_committed_expected_output_exactly', () => {
        // Regression lock against the frozen fixture. Refresh both files together
        // via `node scripts/refresh-fixtures.js` when the provider legitimately changes.
        expect(rows).toEqual(expected(name));
    });
});
