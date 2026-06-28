'use strict';

// ---------------------------------------------------------------------------
// Shared helpers for the non-Neste station scrapers.
//
// Canonical fuel ids match the client FUEL_GROUPS so the UI groups across
// stations and URL/i18n stay consistent:
//   '95'  -> petrol 95
//   '98'  -> petrol 98
//   'diesel' -> regular diesel
//   'pro' -> premium diesel ("D+"; Virši doesn't sell it)
//   'gas' -> LPG / autogāze (per-liter; Neste doesn't sell it)
// Anything outside these five (CNG/E85/AdBlue/XTL/premium-95) is omitted by the
// per-station scrapers (return null from their toCanonical()).
// ---------------------------------------------------------------------------

const axios = require('axios');

const SCRAPER_USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const REQUEST_HEADERS = {
    'User-Agent': SCRAPER_USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
};

// Cap the buffered response so a compromised/MITM'd provider (or a misbehaving
// proxy) can't exhaust the serverless function's memory with a huge body. The
// largest real provider page is ~250 KB, so 10 MB is ~40x headroom — a genuine
// page is never rejected, but a hostile multi-hundred-MB body is. maxRedirects
// stays at the axios default of 5 (providers do apex→www / http→https hops).
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_REDIRECTS = 5;

// Same headers / 8s timeout as the Neste scraper, plus the shared response caps.
async function fetchHtml(url) {
    const { data } = await axios.get(url, {
        headers: REQUEST_HEADERS,
        timeout: 8000,
        maxContentLength: MAX_RESPONSE_BYTES,
        maxBodyLength: MAX_RESPONSE_BYTES,
        maxRedirects: MAX_REDIRECTS,
    });
    return data;
}

// Parse a price string like "1.817 EUR" or "1,754" into a float, or NaN.
function parsePrice(raw) {
    return parseFloat(String(raw).replace(/[^0-9.,]/g, '').replace(',', '.'));
}

// Realistic per-liter retail bounds (EUR) for Latvian fuel, generous on both
// ends so a genuine price swing never trips it but a parser glitch (0, NaN,
// €18.17 from a mis-split, a negative) is rejected before it reaches the DB/UI.
// Gas (LPG) sits at the low end (~0.6), premium diesel at the high end (~2.2).
const MIN_REALISTIC_PRICE = 0.3;
const MAX_REALISTIC_PRICE = 5.0;

// True when `price` is a finite number inside the realistic retail range.
// This is the single sanity gate for ingest — call it after parsePrice().
function validatePrice(price) {
    return (
        typeof price === 'number' &&
        Number.isFinite(price) &&
        price >= MIN_REALISTIC_PRICE &&
        price <= MAX_REALISTIC_PRICE
    );
}

// Collapse to one row per canonical fuel id, keeping the lowest price if a site
// happens to list the same fuel more than once.
function dedupeLowest(rows) {
    const m = new Map();
    for (const r of rows) {
        const ex = m.get(r.type);
        if (!ex || r.price < ex.price) m.set(r.type, r);
    }
    return [...m.values()];
}

// Insert normalized rows for one station. Every row in a scrape cycle shares
// `timestamp` so /api/prices/latest (WHERE timestamp = MAX(...)) returns all
// stations together. Each row: { type, price, location, source }.
async function insertPrices(db, rows, timestamp) {
    for (const r of rows) {
        await db.run(
            'INSERT INTO fuel_prices (type, price, location, source, timestamp) VALUES (?, ?, ?, ?, ?)',
            [r.type, r.price, r.location, r.source, timestamp]
        );
    }
}

module.exports = {
    fetchHtml,
    parsePrice,
    validatePrice,
    dedupeLowest,
    insertPrices,
    SCRAPER_USER_AGENT,
    MIN_REALISTIC_PRICE,
    MAX_REALISTIC_PRICE,
    MAX_RESPONSE_BYTES,
    MAX_REDIRECTS,
};
