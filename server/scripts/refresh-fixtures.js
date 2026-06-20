'use strict';

// Refresh the committed parser fixtures from the live provider sites.
//
//   node scripts/refresh-fixtures.js            # all providers
//   node scripts/refresh-fixtures.js circlek    # one provider
//
// For each provider it writes two files under test/fixtures/<provider>/:
//   latest.html   — the raw page, frozen so the parsing test is deterministic
//   expected.json — parseX(latest.html), the known-good output the test locks
//
// Run this when a provider legitimately changes its layout (and the nightly
// live health check has flagged drift). Review the expected.json diff in the PR
// so a real regression can't sneak in disguised as a "fixture refresh".

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const { parseCircleK } = require('../scrapers/circlek');
const { parseVirsi } = require('../scrapers/virsi');
const { parseViada } = require('../scrapers/viada');
const { parseNestePrices } = require('../scraper');

const UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const PROVIDERS = {
    neste: { url: 'https://www.neste.lv/lv/content/degvielas-cenas', parse: parseNestePrices },
    circlek: { url: 'https://www.circlek.lv/degviela-miles/degvielas-cenas', parse: parseCircleK },
    virsi: { url: 'https://www.virsi.lv/lv/privatpersonam/degviela/degvielas-un-elektrouzlades-cenas', parse: parseVirsi },
    viada: { url: 'https://www.viada.lv/zemakas-degvielas-cenas/', parse: parseViada },
};

const FIXTURE_ROOT = path.join(__dirname, '..', 'test', 'fixtures');

async function refresh(name) {
    const { url, parse } = PROVIDERS[name];
    const { data } = await axios.get(url, { headers: { 'User-Agent': UA }, timeout: 15000 });
    const html = String(data);
    const rows = parse(html);
    if (!rows.length) throw new Error(`${name}: parser returned 0 rows — refusing to write an empty fixture`);

    const dir = path.join(FIXTURE_ROOT, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'latest.html'), html);
    fs.writeFileSync(path.join(dir, 'expected.json'), JSON.stringify(rows, null, 2) + '\n');
    console.log(`${name}: ${rows.length} rows  (${html.length} bytes)`);
}

(async () => {
    const only = process.argv[2];
    const names = only ? [only] : Object.keys(PROVIDERS);
    for (const name of names) {
        if (!PROVIDERS[name]) { console.error(`unknown provider: ${name}`); process.exitCode = 1; continue; }
        try {
            await refresh(name);
        } catch (e) {
            console.error(`${name}: FAILED — ${e.message}`);
            process.exitCode = 1;
        }
    }
})();
