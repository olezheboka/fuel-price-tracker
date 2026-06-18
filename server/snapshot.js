'use strict';

// ---------------------------------------------------------------------------
// Snapshot module — in-memory cache + optional Vercel Blob persistence
//
// Warm instances: serve from memLatest / memHistory in <1ms (no DB hit).
// Cold instances: fetch from Blob CDN (~50ms) if BLOB_URL_PREFIX is set,
//   then populate memory for subsequent requests on the same instance.
//
// BLOB_URL_PREFIX env var should be set to:
//   https://<your-store-id>.public.blob.vercel-storage.com
// (obtained after the first successful writeSnapshot() in production)
// ---------------------------------------------------------------------------

let memLatest = null;   // [{ type, price, location, timestamp }, ...]
let memHistory = null;  // deduplicated daily rows — same shape, ~1 row/day/fuel
let memWrittenAt = 0;   // ms epoch of the last setMemory() — drives TTL revalidation

function setMemory(latest, history) {
    memLatest = latest;
    memHistory = history;
    memWrittenAt = Date.now();
}

function getMemory() {
    if (!memLatest || !memHistory) return null;
    return { latest: memLatest, history: memHistory };
}

// Extend the TTL without touching the data — used after a cheap freshness probe
// confirms the in-memory snapshot still matches the DB, so we skip the full
// (history) recompute until the next TTL window.
function touchMemory() {
    if (memLatest && memHistory) memWrittenAt = Date.now();
}

// Age (ms) of the current in-memory snapshot. Infinity when empty. Used by the
// request path to revalidate a WARM instance's snapshot against the DB — without
// this, a warm Lambda keeps serving the snapshot it cached at cold-start/scrape
// time forever, so after an hourly scrape on another instance its /history (and
// /latest) silently lag by a full cycle until the instance is recycled.
function getMemoryAge() {
    return memWrittenAt ? Date.now() - memWrittenAt : Infinity;
}

// ---------------------------------------------------------------------------
// Write to memory + Vercel Blob (non-blocking; Blob write is fire-and-forget)
// ---------------------------------------------------------------------------
async function writeSnapshot(latest, history) {
    setMemory(latest, history);

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return; // Blob not configured — memory-only

    try {
        const { put } = require('@vercel/blob');
        const [lr, hr] = await Promise.all([
            put('prices/latest.json', JSON.stringify(latest), {
                access: 'public',
                contentType: 'application/json',
                addRandomSuffix: false,
                cacheControlMaxAge: 3600,
                token,
            }),
            put('prices/history.json', JSON.stringify(history), {
                access: 'public',
                contentType: 'application/json',
                addRandomSuffix: false,
                cacheControlMaxAge: 3600,
                token,
            }),
        ]);
        console.log(`[SNAPSHOT] Blob updated. URL prefix: ${lr.url.split('/prices/')[0]}`);
    } catch (e) {
        console.warn('[SNAPSHOT] Blob write failed (non-fatal):', e.message, e.cause || '');
    }
}

// ---------------------------------------------------------------------------
// Hydrate memory from Blob CDN on cold start.
// Call this at module init; await it in the first request handler.
// ---------------------------------------------------------------------------
async function hydrateFromBlob() {
    const prefix = process.env.BLOB_URL_PREFIX;
    if (!prefix || getMemory()) return false;

    try {
        const [lr, hr] = await Promise.all([
            fetch(`${prefix}/prices/latest.json`),
            fetch(`${prefix}/prices/history.json`),
        ]);

        if (!lr.ok || !hr.ok) {
            console.warn('[SNAPSHOT] Blob CDN returned non-200; falling back to DB.');
            return false;
        }

        const [latest, history] = await Promise.all([lr.json(), hr.json()]);
        setMemory(latest, history);
        console.log('[SNAPSHOT] Hydrated from Blob CDN.');
        return true;
    } catch (e) {
        console.warn('[SNAPSHOT] Blob hydration failed (non-fatal):', e.message);
        return false;
    }
}

module.exports = { writeSnapshot, hydrateFromBlob, getMemory, getMemoryAge, setMemory, touchMemory };
