'use strict';

// Circle K — https://www.circlek.lv/degviela-miles/degvielas-cenas
// Static HTML table: rows of  Fuel | "1.817 EUR" | comma-separated addresses.
//   95miles  -> 95     98miles+ -> 98
//   Dmiles   -> diesel  Dmiles+ -> pro   Autogāze -> gas (LPG)
//   "miles+ XTL" (renewable diesel) is omitted.

const cheerio = require('cheerio');
const { openDb } = require('../db');
const { fetchHtml, parsePrice, dedupeLowest, insertPrices } = require('./normalize');

const URL = 'https://www.circlek.lv/degviela-miles/degvielas-cenas';
const SOURCE = 'CircleK';

function toCanonical(rawName) {
    const n = rawName.toLowerCase().replace(/ /g, ' ').replace(/\s+/g, '');
    if (n.includes('xtl')) return null;                  // renewable diesel — out of scope
    if (n.includes('autog') || n.includes('gāze') || n.includes('gaze')) return 'gas'; // Autogāze (LPG)
    if (n.startsWith('95')) return '95';
    if (n.startsWith('98')) return '98';
    if (n.startsWith('d')) return n.includes('+') ? 'pro' : 'diesel'; // Dmiles+ -> premium diesel
    return null;
}

async function scrapeCircleK(timestamp) {
    try {
        const html = await fetchHtml(URL);
        const $ = cheerio.load(html);
        const results = [];

        $('table tr').each((i, row) => {
            const cells = $(row).find('td');
            if (cells.length < 3) return;

            const name = $(cells[0]).text().replace(/\s+/g, ' ').trim();
            const canonical = toCanonical(name);
            if (!canonical) return;

            const price = parsePrice($(cells[1]).text());
            if (isNaN(price)) return;

            const addrText = $(cells[2]).text().replace(/\s+/g, ' ').trim();
            const location = addrText.split(',').map(s => s.trim()).filter(Boolean).join(' | ') || 'Rīga';

            results.push({ type: canonical, price, location, source: SOURCE });
        });

        const deduped = dedupeLowest(results);
        if (deduped.length) {
            const db = await openDb();
            await insertPrices(db, deduped, timestamp);
        }
        console.log(`[SCRAPER] CircleK: ${deduped.length} fuels.`);
        return deduped;
    } catch (e) {
        console.warn('[SCRAPER] CircleK failed (non-fatal):', e.message);
        return [];
    }
}

module.exports = { scrapeCircleK };
