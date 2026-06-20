import { describe, it, expect } from 'vitest';
import { collectSettled } from '../../scrapers/index.js';

// scrapeAll runs all four sources via Promise.allSettled and folds the results
// with collectSettled. The guarantee: one source failing (reject) or returning a
// non-array never breaks the cycle — survivors' rows are still aggregated.
const ok = (rows) => ({ status: 'fulfilled', value: rows });
const fail = (msg) => ({ status: 'rejected', reason: new Error(msg) });

describe('collectSettled (scrapeAll resilience)', () => {
    it('should_aggregate_rows_from_all_successful_sources', () => {
        const out = collectSettled([
            ok([{ source: 'Neste' }]),
            ok([{ source: 'CircleK' }, { source: 'CircleK' }]),
            ok([{ source: 'Virsi' }]),
            ok([{ source: 'Viada' }]),
        ]);
        expect(out).toHaveLength(5);
    });

    it('should_keep_other_sources_when_one_rejects', () => {
        const out = collectSettled([
            fail('Neste timeout'),
            ok([{ source: 'CircleK' }]),
            ok([]),
            ok([{ source: 'Viada' }]),
        ]);
        expect(out.map((r) => r.source).sort()).toEqual(['CircleK', 'Viada']);
    });

    it('should_return_empty_when_every_source_fails', () => {
        const out = collectSettled([fail('a'), fail('b'), fail('c'), fail('d')]);
        expect(out).toEqual([]);
    });

    it('should_skip_a_source_that_resolves_to_a_non_array', () => {
        const out = collectSettled([ok(null), ok([{ source: 'CircleK' }])]);
        expect(out).toEqual([{ source: 'CircleK' }]);
    });
});
