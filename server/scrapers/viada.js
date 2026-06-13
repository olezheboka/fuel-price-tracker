'use strict';

// Viada — https://www.viada.lv/zemakas-degvielas-cenas/
// Static HTML table: cell0 = <img src="…petrol_95ecto_new.png">, cell1 = "1.757 EUR",
// cell2 = "ADUS X : street, city, ADUS Y : street, city." (one entry per station).
//   95ecto -> 95   98 -> 98   d (not ecto) -> diesel
//   d_ecto -> pro (ECTO premium diesel)   GAZE -> gas (LPG)
//   95ectoplus (premium 95) and e85 are omitted.

const cheerio = require('cheerio');
const { openDb } = require('../db');
const { fetchHtml, parsePrice, dedupeLowest, insertPrices } = require('./normalize');

const URL = 'https://www.viada.lv/zemakas-degvielas-cenas/';
const SOURCE = 'Viada';

function toCanonical(imgSrc) {
    const s = (imgSrc || '').toLowerCase();
    if (s.includes('e85')) return null;
    if (s.includes('gaze')) return 'gas';              // Autogāze (LPG)
    if (s.includes('ectoplus')) return null;           // premium 95 — out of scope
    if (s.includes('d_ecto') || s.includes('decto')) return 'pro'; // ECTO premium diesel
    if (s.includes('95')) return '95';
    if (s.includes('98')) return '98';
    if (s.includes('petrol_d') || s.includes('_d_')) return 'diesel';
    return null;
}

async function scrapeViada(timestamp) {
    try {
        const html = await fetchHtml(URL);
        const $ = cheerio.load(html);
        const results = [];

        $('table tr').each((i, row) => {
            const cells = $(row).find('td');
            if (cells.length < 3) return;

            const imgSrc = $(cells[0]).find('img').attr('src') || '';
            const canonical = toCanonical(imgSrc);
            if (!canonical) return;

            const price = parsePrice($(cells[1]).text());
            if (isNaN(price)) return;

            // Split into one chip per station entry (each begins with "ADUS"/"DUS"),
            // without breaking the internal "street, city" commas. Drop the station
            // name prefix ("ADUS Liepāja 2 : ") and keep only "street, city".
            const addrText = $(cells[2]).text().replace(/\s+/g, ' ').replace(/\.\s*$/, '').trim();
            const parts = addrText
                .split(/,\s*(?=A?DUS\b)/)
                .map(s => s.trim().replace(/^A?DUS\b[^:]*:\s*/, ''))
                .filter(Boolean);
            const location = parts.join(' | ') || 'Rīga';

            results.push({ type: canonical, price, location, source: SOURCE });
        });

        const deduped = dedupeLowest(results);

        // D+ must always be the more expensive of Viada's two diesels. By image
        // name `d_ecto` (ECTO diesel) is mapped to `pro` above, but Viada
        // sometimes prices ECTO below regular `D`; in that case swap so D+ tracks
        // the pricier product. (Per product owner: D+ = premium = costlier.)
        const dRow = deduped.find((r) => r.type === 'diesel');
        const proRow = deduped.find((r) => r.type === 'pro');
        if (dRow && proRow && proRow.price < dRow.price) {
            dRow.type = 'pro';
            proRow.type = 'diesel';
        }

        if (deduped.length) {
            const db = await openDb();
            await insertPrices(db, deduped, timestamp);
        }
        console.log(`[SCRAPER] Viada: ${deduped.length} fuels.`);
        return deduped;
    } catch (e) {
        console.warn('[SCRAPER] Viada failed (non-fatal):', e.message);
        return [];
    }
}

module.exports = { scrapeViada };
