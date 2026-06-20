'use strict';

// Nightly LIVE parser health check. Fetches each provider's real page and runs
// the same structural assertions as the offline fixture tests: >0 rows, every
// expected fuel present, prices within the realistic range, non-empty locations.
//
// Exits non-zero (and prints a per-provider report) if any provider fails, so the
// nightly GitHub Action can flag a site redesign before it silently drops data.
// This is intentionally NOT part of PR CI — live fetches must never gate merges.

const axios = require('axios');
const { parseCircleK } = require('../scrapers/circlek');
const { parseVirsi } = require('../scrapers/virsi');
const { parseViada } = require('../scrapers/viada');
const { parseNestePrices } = require('../scraper');
const { MIN_REALISTIC_PRICE, MAX_REALISTIC_PRICE } = require('../scrapers/normalize');

const UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const NESTE_NAME_TO_ID = {
    'Neste Futura 95': '95', 'Neste Futura 98': '98',
    'Neste Futura D': 'diesel', 'Neste Pro Diesel': 'pro',
};
const idOf = (r) => NESTE_NAME_TO_ID[r.type] || r.type;

const PROVIDERS = [
    { name: 'Neste', url: 'https://www.neste.lv/lv/content/degvielas-cenas', parse: parseNestePrices, mustHave: ['95', '98', 'diesel', 'pro'] },
    { name: 'CircleK', url: 'https://www.circlek.lv/degviela-miles/degvielas-cenas', parse: parseCircleK, mustHave: ['95', '98', 'diesel', 'pro', 'gas'] },
    { name: 'Virsi', url: 'https://www.virsi.lv/lv/privatpersonam/degviela/degvielas-un-elektrouzlades-cenas', parse: parseVirsi, mustHave: ['95', '98', 'diesel', 'gas'] },
    { name: 'Viada', url: 'https://www.viada.lv/zemakas-degvielas-cenas/', parse: parseViada, mustHave: ['95', '98', 'diesel', 'pro', 'gas'] },
];

// Fetch with a couple of retries so a transient hiccup doesn't read as a failure.
async function fetchWithRetry(url, tries = 3) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
        try {
            const { data } = await axios.get(url, { headers: { 'User-Agent': UA }, timeout: 15000 });
            return String(data);
        } catch (e) {
            lastErr = e;
            await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        }
    }
    throw lastErr;
}

async function check(p) {
    const problems = [];
    let rows = [];
    try {
        const html = await fetchWithRetry(p.url);
        rows = p.parse(html);
    } catch (e) {
        return { name: p.name, ok: false, problems: [`fetch failed: ${e.message}`], count: 0 };
    }
    if (rows.length === 0) problems.push('parser returned 0 rows (HTML structure may have changed)');
    const ids = new Set(rows.map(idOf));
    for (const f of p.mustHave) if (!ids.has(f)) problems.push(`missing expected fuel "${f}"`);
    for (const r of rows) {
        if (!(r.price >= MIN_REALISTIC_PRICE && r.price <= MAX_REALISTIC_PRICE)) {
            problems.push(`price out of range for ${r.type}: ${r.price}`);
        }
        if (!r.location || !String(r.location).trim()) problems.push(`empty location for ${r.type}`);
    }
    return { name: p.name, ok: problems.length === 0, problems, count: rows.length };
}

(async () => {
    const results = await Promise.all(PROVIDERS.map(check));
    let failed = false;
    for (const r of results) {
        if (r.ok) {
            console.log(`✓ ${r.name}: ${r.count} fuels OK`);
        } else {
            failed = true;
            console.error(`✗ ${r.name}: ${r.count} fuels`);
            for (const pr of r.problems) console.error(`    - ${pr}`);
        }
    }
    if (failed) {
        console.error('\nParser health check FAILED — a provider site likely changed.');
        process.exit(1);
    }
    console.log('\nAll providers healthy.');
})();
