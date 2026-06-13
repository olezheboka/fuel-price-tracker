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

// Same headers / 8s timeout as the Neste scraper.
async function fetchHtml(url) {
    const { data } = await axios.get(url, { headers: REQUEST_HEADERS, timeout: 8000 });
    return data;
}

// Parse a price string like "1.817 EUR" or "1,754" into a float, or NaN.
function parsePrice(raw) {
    return parseFloat(String(raw).replace(/[^0-9.,]/g, '').replace(',', '.'));
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

module.exports = { fetchHtml, parsePrice, dedupeLowest, insertPrices, SCRAPER_USER_AGENT };
