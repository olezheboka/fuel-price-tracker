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

// Signatures of the price data last persisted to Blob. We rewrite a blob only
// when its signature changes, so identical re-scrapes (the common case — prices
// move ~once/day) cost zero "advanced" Blob operations. Seeded on hydrate so the
// skip survives cold starts.
let lastLatestSig = null;
let lastHistorySig = null;

// Stable content fingerprints that EXCLUDE the volatile per-scrape timestamp, so
// two scrapes of identical prices compare equal even though their timestamps differ.
function sigLatest(latest) {
    return (latest || [])
        .map(r => `${r.source}|${r.type}|${r.location}|${r.price}`)
        .sort()
        .join('\n');
}
function sigHistory(history) {
    // dayKey buckets the daily-deduplicated rows by date, so intra-day timestamp
    // drift on the representative row doesn't register as a change.
    return (history || [])
        .map(r => `${String(r.timestamp).slice(0, 10)}|${r.source}|${r.type}|${r.price}`)
        .sort()
        .join('\n');
}

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

    // Skip blobs whose price content is unchanged. Each put() is a billable
    // "advanced" Blob operation; prices rarely change, so this avoids ~95% of writes.
    const newLatestSig = sigLatest(latest);
    const newHistorySig = sigHistory(history);
    const writeLatest = newLatestSig !== lastLatestSig;
    const writeHistory = newHistorySig !== lastHistorySig;

    if (!writeLatest && !writeHistory) {
        console.log('[SNAPSHOT] Blob unchanged; skipped writes.');
        return;
    }

    try {
        const { put } = require('@vercel/blob');
        // @vercel/blob v2 throws when overwriting an existing pathname unless
        // allowOverwrite is set. We intentionally rewrite the same two fixed
        // pathnames (addRandomSuffix: false), so this is required.
        const opts = {
            access: 'public',
            contentType: 'application/json',
            addRandomSuffix: false,
            allowOverwrite: true,
            cacheControlMaxAge: 3600,
            token,
        };
        const jobs = [];
        if (writeLatest) jobs.push(put('prices/latest.json', JSON.stringify(latest), opts));
        if (writeHistory) jobs.push(put('prices/history.json', JSON.stringify(history), opts));

        const [first] = await Promise.all(jobs);
        // Only advance signatures for blobs that actually succeeded, so a failed
        // write retries on the next scrape.
        if (writeLatest) lastLatestSig = newLatestSig;
        if (writeHistory) lastHistorySig = newHistorySig;
        console.log(
            `[SNAPSHOT] Blob updated (${[writeLatest && 'latest', writeHistory && 'history'].filter(Boolean).join(', ')}). ` +
            `URL prefix: ${first.url.split('/prices/')[0]}`
        );
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
        // Seed the skip signatures so this freshly-hydrated instance won't
        // redundantly rewrite blobs whose prices haven't changed.
        lastLatestSig = sigLatest(latest);
        lastHistorySig = sigHistory(history);
        console.log('[SNAPSHOT] Hydrated from Blob CDN.');
        return true;
    } catch (e) {
        console.warn('[SNAPSHOT] Blob hydration failed (non-fatal):', e.message);
        return false;
    }
}

module.exports = { writeSnapshot, hydrateFromBlob, getMemory, getMemoryAge, setMemory, touchMemory };
