import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Guards the invariant getFreshSnapshot()'s warm-path early-return relies on:
// memory is "confirmed" only when it holds DB-sourced data, NOT when it was just
// hydrated from the Blob. A Blob hydrate that reported confirmed would let a cold
// instance (every instance right after a deploy) serve the lagging Blob timestamp
// for its first ~60s instead of validating against the DB — the recurring
// "prices updated time is stale only after a deploy" bug.

describe('snapshot memory confirmation', () => {
    let snap;

    beforeEach(async () => {
        vi.resetModules();
        delete process.env.BLOB_READ_WRITE_TOKEN;
        snap = await import('../../snapshot.js');
    });

    afterEach(() => {
        vi.useRealTimers();
        delete global.fetch;
    });

    const row = (ts) => ({ source: 'Neste', type: '95', location: 'Riga', price: 1.5, timestamp: ts });

    it('should_mark_memory_confirmed_for_db_sourced_writes_by_default', () => {
        snap.setMemory([row('t1')], [row('t1')]);
        expect(snap.isMemoryConfirmed()).toBe(true);
    });

    it('should_mark_memory_unconfirmed_when_explicitly_set_false', () => {
        snap.setMemory([row('t1')], [row('t1')], false);
        expect(snap.isMemoryConfirmed()).toBe(false);
    });

    it('should_confirm_memory_on_touch_after_a_db_probe', () => {
        snap.setMemory([row('t1')], [row('t1')], false);
        expect(snap.isMemoryConfirmed()).toBe(false);
        snap.touchMemory();
        expect(snap.isMemoryConfirmed()).toBe(true);
    });

    it('should_leave_blob_hydrated_memory_unconfirmed', async () => {
        process.env.BLOB_URL_PREFIX = 'https://store.public.blob.vercel-storage.com';
        global.fetch = vi.fn(async () => ({ ok: true, json: async () => [row('2026-06-25T06:00:00Z')] }));

        const hydrated = await snap.hydrateFromBlob();

        expect(hydrated).toBe(true);
        expect(snap.getMemory()).not.toBeNull();
        // The hydrate populated memory but it must NOT be treated as DB-confirmed.
        expect(snap.isMemoryConfirmed()).toBe(false);
    });
});
