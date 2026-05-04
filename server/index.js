require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb, openDb } = require('./db');
const { scrapePrices } = require('./scraper');
const { writeSnapshot, hydrateFromBlob, getMemory } = require('./snapshot');

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
    'https://neste-fuel-tracker.vercel.app',
    'https://neste-fuel-tracker-olezhebokas-projects.vercel.app',
];
if (!IS_PRODUCTION) {
    ALLOWED_ORIGINS.push('http://localhost:5173', 'http://localhost:3000');
}

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. cron, server-to-server, curl)
        if (!origin || ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET'],
}));

app.use(express.json());

// --- Security: Basic rate limiting (in-memory, per-instance) ---
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per minute per IP

const rateLimiter = (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
    const now = Date.now();

    if (!rateLimitMap.has(ip)) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return next();
    }

    const entry = rateLimitMap.get(ip);
    if (now > entry.resetAt) {
        entry.count = 1;
        entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
        return next();
    }

    entry.count++;
    if (entry.count > RATE_LIMIT_MAX) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
};

app.use('/api', rateLimiter);

// Periodic cleanup of stale rate limit entries (every 5 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
        if (now > entry.resetAt) rateLimitMap.delete(ip);
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
        try {
            if (!IS_PRODUCTION) console.log('[Server] Initializing DB...');
            await initDb();
            dbReady = true;
            if (!IS_PRODUCTION) console.log('[Server] Database initialized');
            return { success: true };
        } catch (e) {
            console.error('[Server] Failed to initialize DB:', e.message);
            initPromise = null; // Allow retry
            throw e;
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

// Keep the latest entry per (Riga-date, fuel-type) so the client receives
// ~1 row/day/fuel instead of ~24 hourly duplicates.
// Input rows must be sorted ASC by timestamp (later entry wins via Map overwrite).
function deduplicateHistory(rows) {
    const seen = new Map();
    for (const row of rows) {
        const key = `${toRigaDateKey(row.timestamp)}::${row.type}`;
        seen.set(key, row); // later (ASC) overwrites earlier
    }
    return Array.from(seen.values()).sort((a, b) => {
        const ta = a.timestamp instanceof Date ? a.timestamp.toISOString() : String(a.timestamp);
        const tb = b.timestamp instanceof Date ? b.timestamp.toISOString() : String(b.timestamp);
        return ta < tb ? -1 : 1;
    });
}

// Query DB for the current snapshot data and persist it to memory + Blob.
// Called after every successful scrape.
async function updateSnapshot() {
    try {
        const db = await openDb();

        const latest = await db.all(`
            SELECT type, price, location, timestamp
            FROM fuel_prices
            WHERE timestamp = (SELECT MAX(timestamp) FROM fuel_prices)
        `);

        const cutoff = new Date();
        cutoff.setFullYear(cutoff.getFullYear() - 1);
        const raw = await db.all(
            'SELECT type, price, location, timestamp FROM fuel_prices WHERE timestamp > ? ORDER BY timestamp ASC',
            [cutoff.toISOString()]
        );
        const history = deduplicateHistory(raw);

        await writeSnapshot(
            latest.map(p => ({ ...p, location: cleanLocation(p.location) })),
            history.map(p => ({ ...p, location: cleanLocation(p.location) }))
        );
        console.log(`[API] Snapshot updated: ${latest.length} latest, ${history.length} history rows.`);
    } catch (e) {
        console.error('[API] updateSnapshot failed:', e.message);
    }
}

// Middleware to ensure DB is ready
const ensureDb = async (req, res, next) => {
    if (!dbReady) {
        try {
            await initializeDatabase();
        } catch (e) {
            console.error('[Server] DB init failed during request:', e.message);
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
        // 1. Memory / Blob snapshot (warm instances: <1ms; cold with Blob: ~50ms)
        let snap = getMemory();
        if (!snap) { await hydratePromise; snap = getMemory(); }

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
            SELECT type, price, location, timestamp
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

// Get history — returns deduplicated daily rows (~1 per day/fuel, not hourly)
app.get('/api/prices/history', async (req, res) => {
    try {
        const { type } = req.query;

        // 1. Memory / Blob snapshot
        let snap = getMemory();
        if (!snap) { await hydratePromise; snap = getMemory(); }

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

        let query = 'SELECT type, price, location, timestamp FROM fuel_prices WHERE timestamp > ?';
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

// Scrape endpoint — now uses a 5 minute debounce instead of auth to allow UI refresh
let lastScrapeTime = 0;
const SCRAPE_DEBOUNCE_MS = 5 * 60 * 1000;

app.get('/api/scrape', async (req, res) => {
    try {
        const now = Date.now();
        if (now - lastScrapeTime < SCRAPE_DEBOUNCE_MS) {
            if (!IS_PRODUCTION) console.log('Scrape skipped (debounced)');
            return res.json({ status: 'ok', count: 0, debounced: true });
        }

        if (!IS_PRODUCTION) console.log('Scrape triggered');
        const results = await scrapePrices();
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

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', dbReady });
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
