'use strict';

// Virši — https://www.virsi.lv/lv/privatpersonam/degviela/degvielas-un-elektrouzlades-cenas
// Static HTML cards: <div class="price-card" data-type="95e">
//   <p class="price"><span>95E</span><span>1.877</span></p>
//   <p class="address">Brīvības gatve 297, RĪga, LV-1006</p>
//   95e -> 95   98e -> 98   dd -> diesel   lpg -> gas (LPG/autogāze)
//   Virši has no premium diesel ('pro'). cng is per-kg natural gas;
//   adblue/ccs2/chademo are omitted.

const cheerio = require('cheerio');
const { openDb } = require('../db');
const { fetchHtml, parsePrice, dedupeLowest, insertPrices } = require('./normalize');

const URL = 'https://www.virsi.lv/lv/privatpersonam/degviela/degvielas-un-elektrouzlades-cenas';
const SOURCE = 'Virsi';

const TYPE_MAP = { '95e': '95', '98e': '98', dd: 'diesel', lpg: 'gas' };

async function scrapeVirsi(timestamp) {
    try {
        const html = await fetchHtml(URL);
        const $ = cheerio.load(html);
        const results = [];

        $('.price-card').each((i, el) => {
            const dataType = ($(el).attr('data-type') || '').toLowerCase().trim();
            const canonical = TYPE_MAP[dataType];
            if (!canonical) return;

            // Price is the second <span> inside p.price; the first is the label.
            const price = parsePrice($(el).find('.price span').eq(1).text());
            if (isNaN(price)) return;

            // Single station address — keep as one chip (don't split on commas,
            // which would break "street, city"). Drop the trailing postal code
            // ("…, LV-1006") so only street + city remain.
            const location = $(el).find('.address').text()
                .replace(/\s+/g, ' ')
                .replace(/,?\s*LV-\d{4}\s*$/i, '')
                .trim() || 'Rīga';

            results.push({ type: canonical, price, location, source: SOURCE });
        });

        const deduped = dedupeLowest(results);
        if (deduped.length) {
            const db = await openDb();
            await insertPrices(db, deduped, timestamp);
        }
        console.log(`[SCRAPER] Virsi: ${deduped.length} fuels.`);
        return deduped;
    } catch (e) {
        console.warn('[SCRAPER] Virsi failed (non-fatal):', e.message);
        return [];
    }
}

module.exports = { scrapeVirsi };
