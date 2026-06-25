require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb, openDb } = require('./db');
const { scrapeAll } = require('./scrapers');
const { writeSnapshot, hydrateFromBlob, getMemory, getMemoryAge, isMemoryConfirmed, setMemory, touchMemory } = require('./snapshot');

// Sanitize location strings that may contain MSO/CDATA artifacts from Neste's website
function cleanLocation(loc) {
    if (!loc || typeof loc !== 'string') return loc;
    return loc
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\*[^*]*/g, '')
        .replace(/\*\//g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s*\|\s*/g, ' | ')
        .replace(/\s+/g, ' ')
        .trim();
}

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

if (!IS_PRODUCTION) {
    console.log('[Server] Startup... Environment:', process.env.NODE_ENV);
}

// --- Security: CORS whitelist ---
const ALLOWED_ORIGINS = [
    'https://cenometrs.lv',
    'https://www.cenometrs.lv',
    'https://neste-fuel-tracker.vercel.app',
    'https://neste-fuel-tracker-olezhebokas-projects.vercel.app',
];
if (!IS_PRODUCTION) {
    ALLOWED_ORIGINS.push('http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000');
}

app.use(cors({
    origin: (origin, cb) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        return cb(new Error('CORS blocked'));
    },
    credentials: true,
}));

app.use(express.json());

// --- Security: Basic rate limiting (in-memory, per-instance) ---
// Best-effort only — on Vercel serverless each warm instance has its own Map,
// so the real per-IP ceiling is higher than the constants below. For strict
// limits we'd need a shared store (Vercel KV / Upstash).
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

const getClientIp = (req) => {
    // x-forwarded-for can be a chain ("client, proxy1, proxy2"); use the first hop.
    const xff = req.headers['x-forwarded-for'];
    return (typeof xff === 'string' ? xff.split(',')[0].trim() : null) || req.ip || 'unknown';
};

const makeRateLimiter = (max, keyPrefix = 'g') => (req, res, next) => {
    const key = `${keyPrefix}:${getClientIp(req)}`;
    const now = Date.now();

    const entry = rateLimitMap.get(key);
    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return next();
    }

    entry.count++;
    if (entry.count > max) {
        if (entry.count === max + 1) {
            console.warn(`[Security] Rate limit exceeded (${keyPrefix}) for ${getClientIp(req)} on ${req.method} ${req.path}`);
        }
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
};

// Health check must be exempt from rate limiting so uptime monitors don't get 429'd.
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', dbReady });
});

// General API limit: 60 req/min/IP.
app.use('/api', makeRateLimiter(60, 'g'));

// Stricter limit on /api/scrape — it triggers an outbound HTTP and DB writes.
// Auth (CRON_SECRET) gates real work, but this caps unauthenticated 401 spam.
app.use('/api/scrape', makeRateLimiter(5, 's'));

// Periodic cleanup of stale rate limit entries (every 5 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap) {
        if (now > entry.resetAt) rateLimitMap.delete(key);
    }
}, 5 * 60 * 1000);

// Initialize DB and start server logic (Serverless compatible)
let dbReady = false;
let initPromise = null;

// Initialize DB safely
async function initializeDatabase() {
    if (dbReady) return { success: true };
    if (initPromise) return initPromise;

    initPromise = (async () => {
        // Cold serverless instances (every instance right after a deploy) race a
        // cold / over-subscribed Prisma Postgres, so the first connect can
        // transiently time out. Retry a few times before giving up so a single
        // page load doesn't 503 — that 503 is what made /api/prices/latest fail
        // and the client fall back to the stale Blob "prices updated" time, but
        // only right after each deploy (warm instances reconnect instantly).
        const ATTEMPTS = 3;
        for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
            try {
                if (!IS_PRODUCTION) console.log('[Server] Initializing DB...');
                await initDb();
                dbReady = true;
                if (!IS_PRODUCTION) console.log('[Server] Database initialized');
                return { success: true };
            } catch (e) {
                console.error(`[Server] DB init attempt ${attempt}/${ATTEMPTS} failed:`, e.message);
                if (attempt === ATTEMPTS) {
                    initPromise = null; // Allow a fresh attempt on the next request
                    throw e;
                }
                await new Promise(r => setTimeout(r, 500 * attempt));
            }
        }
    })();
    return initPromise;
}

// Kick off DB init at module load so the cold-start cost is paid during
// function boot rather than during the first user-visible request.
initializeDatabase().catch(() => { /* surfaced again via ensureDb on request */ });

// Kick off Blob hydration in parallel with DB init (non-blocking).
// Resolves to true if memory was populated from CDN, false otherwise.
const hydratePromise = hydrateFromBlob().catch(() => false);

// ---------------------------------------------------------------------------
// Helpers for deduplication and snapshot refresh
// ---------------------------------------------------------------------------

// Convert a timestamp (Date object or ISO string) to a 'YYYY-MM-DD' key in
// Europe/Riga timezone, matching the client's toYMD() / getRigaParts() logic.
const rigaDateFormatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Riga',
    year: 'numeric', month: '2-digit', day: '2-digit',
});

function toRigaDateKey(timestamp) {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    return rigaDateFormatter.format(date); // 'YYYY-MM-DD'
}

// Mirror the client's discount-marker regexes (DISCOUNT_MARKER_RE and
// EXTERNAL_DISCOUNT_RE in client/src/App.jsx). The broad regex matches both
// the static prices-page "visās stacijās" text and the scraper-injected
// "samazināta cena" external-confirmation marker; the external regex matches
// only the latter. The client treats them differently — external confirmation
// flags the day regardless of price drop, while the broad marker requires a
// ≥4¢ heuristic — so the dedup must preserve a row carrying EACH kind.
const DISCOUNT_MARKER_RE = /vis[āa]s[\s\S]*stacij[āa]s|samazin[āa]ta\s+cena/i;
const EXTERNAL_DISCOUNT_RE = /samazin[āa]ta\s+cena/i;
const hasBroadMarker = (loc) => !!loc && DISCOUNT_MARKER_RE.test(loc);
const hasExternalMarker = (loc) => !!loc && EXTERNAL_DISCOUNT_RE.test(loc);

// Within each (Riga-date, fuel-type) bucket, keep distinct change points:
// the first scrape, every price change, and the first scrape carrying each
// kind of discount marker. Stable non-discount days still collapse to 1 row;
// discount and change days keep 2-3 rows so the chart tooltip can show
// intra-day history and the chart can still highlight discount days.
function deduplicateHistory(rows) {
    const toIso = (t) => (t instanceof Date ? t.toISOString() : String(t));
    const sorted = [...rows].sort((a, b) => (toIso(a.timestamp) < toIso(b.timestamp) ? -1 : 1));
    const bucketState = new Map(); // key -> { lastRow, broadSeen, externalSeen }
    const kept = [];
    for (const row of sorted) {
        const key = `${toRigaDateKey(row.timestamp)}::${row.source || 'Neste'}::${row.type}`;
        const state = bucketState.get(key);
        const rowBroad = hasBroadMarker(row.location);
        const rowExternal = hasExternalMarker(row.location);
        const priceChanged = !state || Math.abs(row.price - state.lastRow.price) > 0.0001;
        const broadAppeared = !!state && !state.broadSeen && rowBroad;
        const externalAppeared = !!state && !state.externalSeen && rowExternal;
        if (!state || priceChanged || broadAppeared || externalAppeared) {
            kept.push(row);
            bucketState.set(key, {
                lastRow: row,
                broadSeen: (state ? state.broadSeen : false) || rowBroad,
                externalSeen: (state ? state.externalSeen : false) || rowExternal,
            });
        }
    }
    return kept;
}

// Read the current snapshot (latest + deduplicated history) straight from the DB,
// which is the source of truth. Shared by updateSnapshot() (post-scrape: also
// persists to Blob) and getFreshSnapshot() (TTL revalidation: memory-only).
async function computeSnapshotFromDb() {
    const db = await openDb();

    const latest = await db.all(`
        SELECT type, price, location, source, timestamp
        FROM fuel_prices
        WHERE timestamp = (SELECT MAX(timestamp) FROM fuel_prices)
    `);

    // History now covers ALL stations (per-station Dynamics). The chart keeps
    // itself Neste-only client-side by keying off Neste fuel-type names.
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const raw = await db.all(
        'SELECT type, price, location, source, timestamp FROM fuel_prices WHERE timestamp > ? ORDER BY timestamp ASC',
        [cutoff.toISOString()]
    );
    const history = deduplicateHistory(raw);

    return {
        latest: latest.map(p => ({ ...p, location: cleanLocation(p.location) })),
        history: history.map(p => ({ ...p, location: cleanLocation(p.location) })),
    };
}

// Query DB for the current snapshot data and persist it to memory + Blob.
// Called after every successful scrape.
async function updateSnapshot() {
    try {
        const { latest, history } = await computeSnapshotFromDb();
        await writeSnapshot(latest, history);
        console.log(`[API] Snapshot updated: ${latest.length} latest, ${history.length} history rows.`);
    } catch (e) {
        console.error('[API] updateSnapshot failed:', e.message);
    }
}

// How long a warm instance may serve its in-memory snapshot before revalidating
// against the DB. Well under the hourly scrape cadence so a scrape handled by ANY
// instance propagates to every other warm instance within this window — fixing the
// bug where /latest and /history (load-balanced to different instances) disagreed.
// Kept short because revalidation is a cheap MAX(timestamp) probe, not a recompute.
const SNAPSHOT_TTL_MS = 60 * 1000;

// Epoch ms of a timestamp that may be a Date, a Postgres value, or an ISO string.
function tsToMs(t) {
    if (t == null) return NaN;
    return t instanceof Date ? t.getTime() : new Date(t).getTime();
}

// The latest scrape time the DB knows about — a tiny indexed query that serves as
// the snapshot's version. Cheaper by ~1000x than recomputing the full history.
async function latestDbTimestampMs() {
    const db = await openDb();
    const row = await db.get('SELECT MAX(timestamp) AS max_ts FROM fuel_prices');
    return tsToMs(row && row.max_ts);
}

// Return a snapshot that is fresh to within SNAPSHOT_TTL_MS. Hot path: serve warm
// memory (<1ms). On cold start: hydrate from Blob. Once the TTL lapses: probe the
// DB's MAX(timestamp) and only do the full recompute when a new scrape has landed;
// otherwise just extend the TTL. Falls back to any existing snapshot on DB error,
// since stale data beats a failed request.
async function getFreshSnapshot() {
    let snap = getMemory();
    // Warm path: serve cached memory only if it's DB-confirmed AND within the TTL.
    // A freshly Blob-hydrated cold instance has snap != null with age ~0 but
    // memConfirmed=false, so it falls through to the DB probe below instead of
    // serving the lagging Blob — the fix for "stale timestamp only after deploy".
    if (snap && isMemoryConfirmed() && getMemoryAge() < SNAPSHOT_TTL_MS) return snap;

    // Cold start: hydrate from Blob so we have a baseline (and a fallback if the
    // DB is unreachable below) — but DO NOT return it on the freshly-set memory
    // age. The Blob trails the DB (it's only rewritten on price change / every
    // LATEST_MAX_AGE_MS, and is itself CDN-cached), so trusting a just-hydrated
    // Blob here served a stale "prices updated" timestamp for the first request
    // on every cold instance. That surfaced right after each deploy — when ALL
    // instances are cold at once — as a frozen date that "fixed itself" later
    // once instances warmed. Fall through to the DB probe so a cold instance is
    // DB-accurate from its very first request.
    if (!snap) {
        await hydratePromise;
        snap = getMemory();
    }

    try {
        // Cheap freshness probe: if the DB hasn't scraped anything newer than what
        // we already hold, the snapshot is still correct — just reset its TTL.
        if (snap && snap.latest && snap.latest.length > 0) {
            const dbMs = await latestDbTimestampMs();
            const memMs = tsToMs(snap.latest[0].timestamp);
            if (Number.isFinite(dbMs) && dbMs === memMs) {
                touchMemory();
                return snap;
            }
        }

        const { latest, history } = await computeSnapshotFromDb();
        setMemory(latest, history);
        return getMemory();
    } catch (e) {
        console.error('[API] getFreshSnapshot DB refresh failed:', e.message);
        return snap; // last-resort stale snapshot beats failing the request
    }
}

// Middleware to ensure DB is ready
const ensureDb = async (req, res, next) => {
    if (!dbReady) {
        try {
            await initializeDatabase();
        } catch (e) {
            console.error('[Server] DB init failed during request:', e.message);
            // Defense in depth: if a hydrated/in-memory snapshot exists (from the
            // Blob), let the request through so read routes serve THAT via
            // getFreshSnapshot's fallback, instead of blanking the page with a 503
            // on a transient cold-start DB hiccup. Writes surface their own errors
            // downstream. With no snapshot to fall back on, 503 as before.
            if (getMemory()) return next();
            return res.status(503).json({ error: 'Service temporarily unavailable' });
        }
    }
    next();
};


// --- Debug routes: Development only ---
if (!IS_PRODUCTION) {
    app.get('/debug', (req, res) => {
        res.json({ message: 'Debug endpoint (dev only)', url: req.url });
    });

    app.get('/api/debug', async (req, res) => {
        try {
            let count = null;
            let dbType = 'Unknown';
            let dbError = null;

            try {
                const dbPromise = openDb();
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('DB Connection Timeout (2s)')), 2000)
                );
                const db = await Promise.race([dbPromise, timeoutPromise]);
                dbType = process.env.POSTGRES_URL ? 'Postgres' : 'SQLite';

                try {
                    const cRow = await db.get('SELECT count(*) as c FROM fuel_prices');
                    count = cRow ? cRow.c : 0;
                } catch (err) {
                    if (err.message.includes('does not exist')) {
                        count = 'Table Missing';
                    } else {
                        throw err;
                    }
                }
            } catch (e) {
                dbError = e.message;
            }

            res.json({
                status: 'ok',
                dbReady,
                totalRows: count,
                dbType,
                dbError
            });
        } catch (e) {
            res.status(500).json({ error: 'Debug error' });
        }
    });

    // Manual init — dev only
    app.get('/api/init', async (req, res) => {
        console.log('[Debug] Manual /api/init triggered');
        const result = await initializeDatabase();
        res.json(result);
    });
}

app.use('/api', ensureDb);

// --- API Endpoints ---

// Get latest prices
app.get('/api/prices/latest', async (req, res) => {
    try {
        // 1. Memory / Blob snapshot (warm: <1ms; cold w/ Blob: ~50ms; stale: DB refresh)
        const snap = await getFreshSnapshot();

        if (snap) {
            const prices = snap.latest;
            if (prices.length > 0) {
                const lastModified = new Date(prices[0].timestamp).toUTCString();
                res.set('Last-Modified', lastModified);
                if (req.headers['if-modified-since'] === lastModified) return res.status(304).end();
            }
            return res.json(prices);
        }

        // 2. DB fallback (cold start without Blob, or before first scrape)
        const db = await openDb();
        const prices = await db.all(`
            SELECT type, price, location, source, timestamp
            FROM fuel_prices
            WHERE timestamp = (SELECT MAX(timestamp) FROM fuel_prices)
        `);

        if (prices.length > 0) {
            const lastModified = new Date(prices[0].timestamp).toUTCString();
            res.set('Last-Modified', lastModified);
            if (req.headers['if-modified-since'] === lastModified) return res.status(304).end();
        }

        res.json(prices.length === 0 ? [] : prices.map(p => ({ ...p, location: cleanLocation(p.location) })));
    } catch (error) {
        console.error('[API] /prices/latest error:', error.message);
        res.status(500).json({ error: 'Failed to fetch latest prices' });
    }
});

const VALID_FUEL_TYPES = new Set([
    'Neste Futura 95',
    'Neste Futura 98',
    'Neste Futura D',
    'Neste Pro Diesel',
]);

// Get history — returns deduplicated daily rows (~1 per day/fuel, not hourly)
app.get('/api/prices/history', async (req, res) => {
    try {
        const { type } = req.query;
        if (type !== undefined && (typeof type !== 'string' || !VALID_FUEL_TYPES.has(type))) {
            return res.status(400).json({ error: 'Invalid fuel type' });
        }

        // 1. Memory / Blob snapshot (revalidated against DB once stale)
        const snap = await getFreshSnapshot();

        if (snap) {
            let history = snap.history;
            if (type) history = history.filter(p => p.type === type);
            if (history.length > 0) {
                const lastModified = new Date(history[history.length - 1].timestamp).toUTCString();
                res.set('Last-Modified', lastModified);
                if (req.headers['if-modified-since'] === lastModified) return res.status(304).end();
            }
            return res.json(history);
        }

        // 2. DB fallback — deduplicate to one row per (Riga-date, fuel) and
        //    limit to the last 365 days so the query stays fast.
        const db = await openDb();

        const cutoff = new Date();
        cutoff.setFullYear(cutoff.getFullYear() - 1);

        // History now covers all stations; chart stays Neste-only client-side.
        let query = 'SELECT type, price, location, source, timestamp FROM fuel_prices WHERE timestamp > ?';
        const params = [cutoff.toISOString()];
        if (type) { query += ' AND type = ?'; params.push(type); }
        query += ' ORDER BY timestamp ASC';

        const raw = await db.all(query, params);
        const data = deduplicateHistory(raw);

        if (data.length > 0) {
            const lastModified = new Date(data[data.length - 1].timestamp).toUTCString();
            res.set('Last-Modified', lastModified);
            if (req.headers['if-modified-since'] === lastModified) return res.status(304).end();
        }

        res.json(data.map(p => ({ ...p, location: cleanLocation(p.location) })));
    } catch (error) {
        console.error('[API] /prices/history error:', error.message);
        res.status(500).json({ error: 'Failed to fetch price history' });
    }
});

// Scrape endpoint — protected by CRON_SECRET (Vercel cron sends this automatically).
// 5-minute debounce remains as a safety net against rapid re-triggers.
let lastScrapeTime = 0;
const SCRAPE_DEBOUNCE_MS = 5 * 60 * 1000;

app.get('/api/scrape', async (req, res) => {
    try {
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret) {
            const auth = req.headers.authorization || '';
            if (auth !== `Bearer ${cronSecret}`) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
        } else if (IS_PRODUCTION) {
            console.error('[API] /api/scrape called but CRON_SECRET is not configured');
            return res.status(503).json({ error: 'Scrape endpoint not configured' });
        }

        const now = Date.now();
        if (now - lastScrapeTime < SCRAPE_DEBOUNCE_MS) {
            if (!IS_PRODUCTION) console.log('Scrape skipped (debounced)');
            return res.json({ status: 'ok', count: 0, debounced: true });
        }

        if (!IS_PRODUCTION) console.log('Scrape triggered');
        const results = await scrapeAll();
        lastScrapeTime = Date.now();

        // Refresh memory + Blob snapshot after every successful scrape.
        // Await it so the serverless function doesn't terminate before Blob write completes.
        if (results.length > 0) {
            await updateSnapshot();
        }

        res.json({ status: 'ok', count: results.length });
    } catch (error) {
        console.error('Scrape failed:', error.message);
        res.status(500).json({ error: 'Scrape failed' });
    }
});

// Public manual-refresh trigger for the browser "Refresh" button.
// Unlike /api/scrape (cron-only, gated by CRON_SECRET), this is callable from the
// client. Abuse is bounded by three layers:
//   (1) the general /api limiter (60/min/IP) + a stricter per-IP limiter below;
//   (2) a PERSISTENT freshness gate based on the snapshot timestamp — because the
//       snapshot is Blob-backed, this debounce holds across serverless instances,
//       unlike the in-memory lastScrapeTime, which each warm instance resets.
// If the current data is younger than the window we skip the outbound scrape and
// just report that nothing was done, so the button never hammers neste.lv.
const MANUAL_REFRESH_DEBOUNCE_MS = 5 * 60 * 1000;

app.use('/api/refresh', makeRateLimiter(5, 'r'));

app.get('/api/refresh', async (req, res) => {
    try {
        const snap = await getFreshSnapshot();

        const latest = snap?.latest;
        if (latest && latest.length > 0) {
            const ageMs = Date.now() - new Date(latest[0].timestamp).getTime();
            if (ageMs >= 0 && ageMs < MANUAL_REFRESH_DEBOUNCE_MS) {
                if (!IS_PRODUCTION) console.log('[API] /api/refresh debounced (data is fresh)');
                return res.json({ status: 'ok', scraped: false, debounced: true });
            }
        }

        if (!IS_PRODUCTION) console.log('[API] /api/refresh triggered scrape');
        const results = await scrapeAll();
        lastScrapeTime = Date.now();
        if (results.length > 0) {
            await updateSnapshot();
        }
        res.json({ status: 'ok', scraped: results.length > 0, count: results.length });
    } catch (error) {
        console.error('[API] /api/refresh failed:', error.message);
        res.status(500).json({ error: 'Refresh failed' });
    }
});

// Catch-all for unhandled API routes (must be last)
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
