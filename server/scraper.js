const axios = require('axios');
const cheerio = require('cheerio');
const { openDb } = require('./db');

const PRICES_URL = 'https://www.neste.lv/lv/content/degvielas-cenas';
const HOMEPAGE_URL = 'https://www.neste.lv/lv';
const INSTAGRAM_RSS = 'https://rsshub.app/instagram/user/neste_latvija';

// Canonical marker string written into the `location` column when the homepage
// carousel or the Neste Latvia Instagram account confirms a discount day.
// Picked up downstream by client/src/App.jsx DISCOUNT_MARKER_RE.
const DISCOUNT_MARKER = 'Visās Neste DUS degvielai samazināta cena (homepage)';

// The prices page itself replaces the per-station DUS address list with a single
// "price is equal across all stations" phrase on a unified-discount day. This is
// the most reliable first-party signal — but it can also appear on a normal day
// where every station happens to share a price, so we only treat it as a
// discount when it coincides with a real day-over-day price drop (see scrapePrices).
const UNIFIED_PRICE_RE = /vis[āa]s[\s\S]*stacij[āa]s[\s\S]*(cena\s+vien[āa]da|samazin)/i;

// Minimum day-over-day drop (€/L) on any single fuel to confirm a discount when
// only the unified-price text is present. Mirrors client MIN_DISCOUNT_DROP.
const MIN_DISCOUNT_DROP = 0.04;

const SCRAPER_USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FUEL_TYPES = [
    'Neste Futura 95',
    'Neste Futura 98',
    'Neste Futura D',
    'Neste Pro Diesel'
];

function getRigaDateParts(date) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Riga',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const [mo, da, ye] = formatter.format(date).split('/');
    return { year: parseInt(ye, 10), month: parseInt(mo, 10), day: parseInt(da, 10) };
}

// Detect the discount banner in the neste.lv homepage carousel. The banner
// includes today's date as "(DD.MM.)" alongside "samazināta cena" — we require
// the embedded date to match today (Riga) so a stale/cached banner cannot
// false-positive the next day. Returns false on any error.
async function detectHomepageDiscount() {
    try {
        const { data } = await axios.get(HOMEPAGE_URL, {
            headers: {
                'User-Agent': SCRAPER_USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            },
            timeout: 8000
        });
        const text = cheerio.load(data).text().replace(/\s+/g, ' ');
        // Relaxed: any "samazināta cena" mention on the homepage indicates a
        // discount banner. We don't require the strict "Šodien (DD.MM.)" wording
        // (it changes), but to guard against a stale/cached banner we require
        // today's Riga date (DD.MM) to appear somewhere in the page text.
        if (!/samazin[āa]ta\s+cena/i.test(text)) {
            const snippet = text.slice(0, 200).replace(/"/g, "'");
            console.log(`[SCRAPER] Homepage discount banner: not found. Page head: "${snippet}"`);
            return false;
        }
        const today = getRigaDateParts(new Date());
        const dd = String(today.day).padStart(2, '0');
        const mm = String(today.month).padStart(2, '0');
        const dateRe = new RegExp(`\\b${today.day}\\.\\s?${today.month}\\.|\\b${dd}\\.\\s?${mm}\\.`);
        const matches = dateRe.test(text);
        console.log(`[SCRAPER] Homepage discount banner: found, today's date (${dd}.${mm}) ${matches ? 'present' : 'absent (stale?)'}`);
        return matches;
    } catch (err) {
        console.warn('[SCRAPER] Homepage check failed (non-fatal):', err.message);
        return false;
    }
}

// Manual discount override via FORCE_DISCOUNT_TODAY env var. Accepts:
//   "1" / "true"  — always force discount marker
//   "YYYY-MM-DD"  — force only when that Riga date matches today
// Used as a safety valve when both auto-signals (homepage, Instagram) fail.
function detectManualDiscount() {
    const raw = (process.env.FORCE_DISCOUNT_TODAY || '').trim();
    if (!raw) return false;
    if (raw === '1' || raw.toLowerCase() === 'true') return true;
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return false;
    const today = getRigaDateParts(new Date());
    return parseInt(m[1], 10) === today.year
        && parseInt(m[2], 10) === today.month
        && parseInt(m[3], 10) === today.day;
}

// Detect a same-day discount post on @neste_latvija via RSSHub. We only count
// posts whose pubDate falls on today (Riga) and whose body mentions
// "samazināta" or "atlaide". Returns false on any error or proxy unavailability.
async function detectInstagramDiscount() {
    try {
        const { data } = await axios.get(INSTAGRAM_RSS, {
            headers: {
                'User-Agent': SCRAPER_USER_AGENT,
                'Accept': 'application/rss+xml, application/xml, text/xml, */*'
            },
            timeout: 5000
        });
        const items = [...String(data).matchAll(/<item>[\s\S]*?<\/item>/g)].slice(0, 3);
        const today = getRigaDateParts(new Date());
        for (const m of items) {
            const block = m[0];
            const pubMatch = block.match(/<pubDate>([^<]+)<\/pubDate>/);
            if (!pubMatch) continue;
            const posted = new Date(pubMatch[1]);
            if (Number.isNaN(posted.getTime())) continue;
            const postedRiga = getRigaDateParts(posted);
            if (postedRiga.year !== today.year || postedRiga.month !== today.month || postedRiga.day !== today.day) continue;
            const text = block.replace(/<[^>]+>/g, ' ');
            if (/samazin[āa]ta|atlaid/i.test(text)) {
                console.log('[SCRAPER] Instagram discount post detected for today.');
                return true;
            }
        }
        return false;
    } catch (err) {
        console.warn('[SCRAPER] Instagram check failed (non-fatal):', err.message);
        return false;
    }
}

/**
 * Scrape fuel prices and station addresses from the Neste prices page.
 * Each fuel type has:
 * - A lowest price for today
 * - A list of station addresses (DUS) where this price is valid
 */
async function scrapePrices() {
    try {
        console.log(`[SCRAPER] Fetching ${PRICES_URL}...`);
        const [pricesRes, homepageDiscount, instagramDiscount] = await Promise.all([
            axios.get(PRICES_URL, {
                headers: {
                    'User-Agent': SCRAPER_USER_AGENT,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5'
                },
                timeout: 8000 // 8 second timeout
            }),
            detectHomepageDiscount(),
            detectInstagramDiscount()
        ]);
        const { data } = pricesRes;
        const manualDiscount = detectManualDiscount();
        if (manualDiscount) console.log('[SCRAPER] Manual discount override active.');
        const externalDiscount = homepageDiscount || instagramDiscount || manualDiscount;

        console.log(`[SCRAPER] Page fetched. Length: ${data.length} chars.`);
        const $ = cheerio.load(data);
        const db = await openDb();

        const results = [];
        const timestamp = new Date().toISOString();

        // Debug: Log all tables found
        const tableCount = $('table').length;
        console.log(`[SCRAPER] Found ${tableCount} tables.`);

        // Parse the table - each row contains: Fuel Type | Price | DUS (addresses)
        const rows = $('table tbody tr, table tr');
        console.log(`[SCRAPER] Found ${rows.length} rows to parse.`);

        rows.each((i, row) => {
            const cells = $(row).find('td');
            // Log first row for debug
            if (i === 0) {
                console.log(`[SCRAPER] First row text: ${$(row).text().replace(/\s+/g, ' ').substring(0, 50)}...`);
            }

            if (cells.length >= 3) {
                // Clean up text - remove tabs, newlines, extra whitespace
                const fuelNameRaw = $(cells[0]).text().replace(/[\t\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
                const priceRaw = $(cells[1]).text().trim().replace(',', '.');
                // Strip MSO/CDATA artifacts that Neste injects (copy-pasted from Excel)
                const dusHtml = $(cells[2]).html() || '';
                const dusClean = dusHtml
                    .replace(/<!--[\s\S]*?-->/g, '')   // HTML comments
                    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '') // CDATA sections
                    .replace(/\/\*[\s\S]*?\*\//g, '')  // CSS comments
                    .replace(/\/\*[^*]*/g, '')         // unclosed CSS comment starts
                    .replace(/\*\//g, '')              // orphaned CSS comment ends
                    .replace(/<[^>]+>/g, ' ')           // remaining HTML tags
                    .replace(/&nbsp;/g, ' ')            // HTML entities
                    .replace(/[\t\n\r]+/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                const dusRaw = dusClean;

                // Match to known fuel types (handle non-breaking spaces)
                const fuelName = fuelNameRaw.replace(/\u00A0/g, ' ');
                const matchedFuel = FUEL_TYPES.find(f =>
                    fuelName.includes(f) || f.includes(fuelName)
                );

                if (matchedFuel) {
                    const price = parseFloat(priceRaw);
                    if (!isNaN(price)) {
                        // Parse DUS addresses - they are comma-separated
                        // Each address is a street name/number in Rīga
                        const addresses = dusRaw
                            .split(',')
                            .map(addr => addr.trim())
                            .filter(addr => addr.length > 0);

                        // Join with pipe separator for storage
                        const location = addresses.length > 0
                            ? addresses.join(' | ')
                            : 'Rīga';

                        console.log(`[SCRAPER] Matched: ${matchedFuel}: €${price.toFixed(3)}, ${addresses.length} DUS`);

                        results.push({
                            type: matchedFuel,
                            price,
                            location,
                            timestamp
                        });
                    } else {
                        console.warn(`[SCRAPER] Invalid price for ${matchedFuel}: ${priceRaw}`);
                    }
                } else {
                    // Debug unmatched rows that look like data
                    if (fuelNameRaw.length > 0 && priceRaw.length > 0) {
                        // console.log(`[SCRAPER] Unmatched row: ${fuelNameRaw}`);
                    }
                }
            }
        });

        if (results.length === 0) {
            console.warn("[SCRAPER] No fuel data found. Check the page structure.");
        }

        // First-party signal: the prices page itself collapses to the unified
        // "cena vienāda" text on a discount day. Confirm it with a real
        // day-over-day drop on any fuel (vs the last stored price) so a normal
        // day where stations merely share a price doesn't false-positive.
        const unifiedText = results.some(r => UNIFIED_PRICE_RE.test(r.location));
        let maxDrop = 0;
        if (unifiedText && results.length > 0) {
            for (const r of results) {
                const prev = await db.get(
                    'SELECT price FROM fuel_prices WHERE type = ? ORDER BY timestamp DESC LIMIT 1',
                    [r.type]
                );
                if (prev && typeof prev.price === 'number') {
                    maxDrop = Math.max(maxDrop, prev.price - r.price);
                }
            }
        }
        const pricesPageDiscount = unifiedText && maxDrop >= MIN_DISCOUNT_DROP - 0.001;
        const externalDiscountFinal = externalDiscount || pricesPageDiscount;
        console.log(`[SCRAPER] Discount signals: homepage=${homepageDiscount}, instagram=${instagramDiscount}, manual=${manualDiscount}, unifiedText=${unifiedText}, maxDrop=${maxDrop.toFixed(3)} => pricesPage=${pricesPageDiscount}`);

        // Override location with the canonical discount marker when any signal
        // confirms today is a discount day. The downstream client picks this up
        // via DISCOUNT_MARKER_RE / EXTERNAL_DISCOUNT_RE (authoritative — bypasses
        // the client-side price-drop heuristic).
        if (externalDiscountFinal && results.length > 0) {
            console.log(`[SCRAPER] Discount confirmed; marking ${results.length} rows.`);
            for (const r of results) {
                r.location = DISCOUNT_MARKER;
            }
        }

        // Save to database
        for (const res of results) {
            await db.run(
                'INSERT INTO fuel_prices (type, price, location, timestamp) VALUES (?, ?, ?, ?)',
                [res.type, res.price, res.location, res.timestamp]
            );
        }

        console.log(`[SCRAPER] Scrape complete. Found ${results.length} fuel types.`);
        return results;

    } catch (error) {
        console.error('[SCRAPER] Error:', error.message);
        if (error.response) {
            console.error('[SCRAPER] Response status:', error.response.status);
        }
        return [];
    }
}

module.exports = { scrapePrices };
