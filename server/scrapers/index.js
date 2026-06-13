'use strict';

// Multi-station scrape orchestrator.
//
// All four sources are fetched in PARALLEL and share ONE timestamp so the
// latest-price query (WHERE timestamp = MAX(...)) returns every station from the
// same cycle. Promise.allSettled means one failing source never breaks the rest
// (and each scraper already try/catches to [] internally — belt and suspenders).

const { scrapePrices } = require('../scraper'); // Neste (extended, not rewritten)
const { scrapeCircleK } = require('./circlek');
const { scrapeVirsi } = require('./virsi');
const { scrapeViada } = require('./viada');

const SOURCES = ['Neste', 'CircleK', 'Virsi', 'Viada'];

async function scrapeAll() {
    const timestamp = new Date().toISOString();

    const settled = await Promise.allSettled([
        scrapePrices(timestamp),
        scrapeCircleK(timestamp),
        scrapeVirsi(timestamp),
        scrapeViada(timestamp),
    ]);

    const results = [];
    settled.forEach((s, i) => {
        if (s.status === 'fulfilled' && Array.isArray(s.value)) {
            results.push(...s.value);
        } else if (s.status === 'rejected') {
            console.warn(`[SCRAPER] ${SOURCES[i]} rejected (non-fatal):`, s.reason && s.reason.message);
        }
    });

    console.log(`[SCRAPER] scrapeAll complete: ${results.length} rows across ${SOURCES.length} sources.`);
    return results;
}

module.exports = { scrapeAll };
