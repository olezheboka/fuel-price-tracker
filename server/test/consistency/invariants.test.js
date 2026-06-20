import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIN_REALISTIC_PRICE, MAX_REALISTIC_PRICE } from '../../scrapers/normalize.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const load = (name) =>
    JSON.parse(fs.readFileSync(path.join(dir, '..', 'fixtures', name, 'expected.json'), 'utf8'));

// Treat the four committed fixtures as one scrape cycle and assert the
// cross-cutting data invariants the UI relies on. (Two of the brief's requested
// invariants — "station ids unique", "provider+station unique" — do not map to
// this model: there is no station entity, only chain-level price + a joined
// `location` string. The real per-cycle uniqueness invariant is (source, type).)
const NESTE_NAME_TO_ID = {
    'Neste Futura 95': '95', 'Neste Futura 98': '98',
    'Neste Futura D': 'diesel', 'Neste Pro Diesel': 'pro',
};

const cycle = [
    ...load('neste').map((r) => ({ ...r, source: 'Neste', id: NESTE_NAME_TO_ID[r.type] })),
    ...load('circlek').map((r) => ({ ...r, id: r.type })),
    ...load('virsi').map((r) => ({ ...r, id: r.type })),
    ...load('viada').map((r) => ({ ...r, id: r.type })),
];

describe('scrape-cycle data invariants', () => {
    it('should_have_only_non_negative_prices', () => {
        for (const r of cycle) expect(r.price).toBeGreaterThan(0);
    });

    it('should_keep_all_prices_within_realistic_limits', () => {
        for (const r of cycle) {
            expect(r.price).toBeGreaterThanOrEqual(MIN_REALISTIC_PRICE);
            expect(r.price).toBeLessThanOrEqual(MAX_REALISTIC_PRICE);
        }
    });

    it('should_have_unique_source_plus_type_per_cycle', () => {
        const keys = cycle.map((r) => `${r.source}__${r.id}`);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('should_price_premium_diesel_at_least_as_high_as_regular_diesel_per_chain', () => {
        const bySource = {};
        for (const r of cycle) (bySource[r.source] ??= {})[r.id] = r.price;
        for (const [source, fuels] of Object.entries(bySource)) {
            if (fuels.pro !== undefined && fuels.diesel !== undefined) {
                expect(fuels.pro, `${source}: D+ (${fuels.pro}) should be >= D (${fuels.diesel})`)
                    .toBeGreaterThanOrEqual(fuels.diesel);
            }
        }
    });

    it('should_have_a_non_empty_location_for_every_row', () => {
        for (const r of cycle) expect(r.location.trim().length).toBeGreaterThan(0);
    });
});
