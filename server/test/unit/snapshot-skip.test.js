import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Module from 'module';

// writeSnapshot() rewrites a Blob only when its price content changes, so that
// identical re-scrapes (the common case) cost zero billable "advanced" Blob
// operations. These tests pin that skip behaviour.
//
// snapshot.js does a lazy CommonJS `require('@vercel/blob')` inside the function;
// vi.mock doesn't reach that nested native require, so we patch Module._load to
// stub it and record every put() pathname into a shared array.
const calls = [];
const realLoad = Module._load;

function installBlobStub() {
    Module._load = function (request, ...rest) {
        if (request === '@vercel/blob') {
            return {
                put: async (path) => {
                    calls.push(path);
                    return { url: `https://store.public.blob.vercel-storage.com/${path}` };
                },
            };
        }
        return realLoad.call(this, request, ...rest);
    };
}

const row = (price, ts) => ({ source: 'Neste', type: '95', location: 'Riga', price, timestamp: ts });

describe('writeSnapshot content-aware Blob skipping', () => {
    let writeSnapshot, hydrateFromBlob;

    beforeEach(async () => {
        installBlobStub();
        // Fresh module state (signatures reset to null) per test.
        vi.resetModules();
        process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
        delete process.env.BLOB_URL_PREFIX;
        calls.length = 0;
        ({ writeSnapshot, hydrateFromBlob } = await import('../../snapshot.js'));
    });

    afterEach(() => {
        Module._load = realLoad;
    });

    it('should_write_both_blobs_on_first_snapshot', async () => {
        await writeSnapshot([row(1.5, 't1')], [row(1.5, 't1')]);
        expect([...calls].sort()).toEqual(['prices/history.json', 'prices/latest.json']);
    });

    it('should_skip_both_when_only_the_timestamp_changed', async () => {
        await writeSnapshot([row(1.5, 't1')], [row(1.5, '2026-06-21T08:00:00Z')]);
        calls.length = 0;
        // Same prices, later timestamp (same Riga day) — must not rewrite.
        await writeSnapshot([row(1.5, 't2')], [row(1.5, '2026-06-21T09:00:00Z')]);
        expect(calls).toEqual([]);
    });

    it('should_rewrite_when_a_price_changes', async () => {
        await writeSnapshot([row(1.5, 't1')], [row(1.5, '2026-06-21T08:00:00Z')]);
        calls.length = 0;
        await writeSnapshot([row(1.6, 't2')], [row(1.6, '2026-06-21T09:00:00Z')]);
        expect([...calls].sort()).toEqual(['prices/history.json', 'prices/latest.json']);
    });

    it('should_write_only_latest_when_history_day_bucket_is_unchanged', async () => {
        const history = [row(1.5, '2026-06-21T08:00:00Z')];
        await writeSnapshot([row(1.5, 't1')], history);
        calls.length = 0;
        // latest price moves, but the dedup-by-day history value is identical.
        await writeSnapshot([row(1.7, 't2')], history);
        expect(calls).toEqual(['prices/latest.json']);
    });

    it('should_not_touch_blob_when_no_token_is_configured', async () => {
        delete process.env.BLOB_READ_WRITE_TOKEN;
        vi.resetModules();
        const mod = await import('../../snapshot.js');
        await mod.writeSnapshot([row(1.5, 't1')], [row(1.5, 't1')]);
        expect(calls).toEqual([]);
        // Memory is still populated for warm-instance serving.
        expect(mod.getMemory().latest).toHaveLength(1);
    });

    it('should_seed_signatures_on_hydrate_so_an_unchanged_first_write_skips', async () => {
        process.env.BLOB_URL_PREFIX = 'https://store.public.blob.vercel-storage.com';
        global.fetch = vi.fn(async () => ({ ok: true, json: async () => [row(1.5, '2026-06-21T08:00:00Z')] }));

        await hydrateFromBlob();
        calls.length = 0;
        // Identical prices to what was hydrated — a fresh instance must not rewrite.
        await writeSnapshot([row(1.5, 't2')], [row(1.5, '2026-06-21T09:00:00Z')]);
        expect(calls).toEqual([]);
    });
});
