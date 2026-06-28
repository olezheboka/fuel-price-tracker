const path = require('path');

// Force the pg driver to interpret TIMESTAMP (without timezone) columns as UTC.
// Without this, pg parses naive timestamps using the Node process's local
// timezone — which on a developer machine in Europe/Riga shifts every record
// by 3 hours vs production (Vercel runs in UTC). Affects every consumer of
// /api/prices/history downstream.
try {
    const pgTypes = require('pg').types;
    // OID 1114 = TIMESTAMP WITHOUT TIME ZONE
    pgTypes.setTypeParser(1114, str => new Date(str + 'Z'));
} catch (_) {
    // pg may not be installed in dev when only sqlite/mock is in use.
}

// Helper to convert SQLite parameters (?) to Postgres parameters ($1, $2, ...)
function convertQueryToPg(sql) {
    let index = 1;
    return sql.replace(/\?/g, () => `$${index++}`);
}

class PostgresDatabase {
    constructor(pool) {
        this.pool = pool;
    }

    async exec(sql) {
        return this.pool.query(sql);
    }

    async get(sql, params = []) {
        const pgSql = convertQueryToPg(sql);
        const { rows } = await this.pool.query(pgSql, params);
        return rows[0];
    }

    async all(sql, params = []) {
        const pgSql = convertQueryToPg(sql);
        const { rows } = await this.pool.query(pgSql, params);
        return rows;
    }

    async run(sql, params = []) {
        const pgSql = convertQueryToPg(sql);
        await this.pool.query(pgSql, params);
        return { changes: 1 };
    }
}



class SQLiteDatabase {
    constructor(db) {
        this.db = db;
    }

    async exec(sql) {
        return this.db.exec(sql);
    }

    async get(sql, params = []) {
        return this.db.get(sql, params);
    }

    async all(sql, params = []) {
        return this.db.all(sql, params);
    }

    async run(sql, params = []) {
        return this.db.run(sql, params);
    }
}

// Mock Database for when Postgres is missing (avoids sqlite3 crashes)
// Mock Database for when Postgres is missing (avoids sqlite3 crashes)
class MockDatabase {
    constructor() {
        this.prices = [];
    }

    async exec(sql) {
        // Simple mock for table creation
        console.log('[MockDB] exec:', sql.substring(0, 50) + '...');
    }

    async get(sql, params) {
        // console.log('[MockDB] get:', sql, params);
        if (sql.includes('SELECT timestamp FROM fuel_prices ORDER BY id DESC LIMIT 1')) {
            return this.prices.length > 0 ? { timestamp: this.prices[this.prices.length - 1].timestamp } : undefined;
        }
        return null;
    }

    async all(sql, params) {
        // console.log('[MockDB] all:', sql, params);

        // Very basic query handling for specific app queries
        if (sql.includes('MAX(timestamp)') && sql.includes('FROM fuel_prices')) {
            if (this.prices.length === 0) return [];
            // Find latest timestamp
            const latest = this.prices[this.prices.length - 1].timestamp;
            // Return all items with that timestamp
            return this.prices.filter(p => p.timestamp === latest);
        }

        // Return all for history
        if (sql.includes('SELECT * FROM fuel_prices')) {
            // Sort by timestamp if requested
            if (sql.includes('ORDER BY timestamp ASC')) {
                return [...this.prices].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            }
            return this.prices;
        }

        return [];
    }

    async run(sql, params) {
        // console.log('[MockDB] run:', sql, params);
        if (sql.includes('INSERT INTO fuel_prices')) {
            // Params: [type, price, location, source, timestamp]
            const [type, price, location, source, timestamp] = params;
            this.prices.push({
                id: this.prices.length + 1,
                type,
                price,
                location,
                source: source || 'Neste',
                timestamp
            });
            // Keep memory check in bounds (last 1000 records)
            if (this.prices.length > 5000) {
                this.prices = this.prices.slice(-4000);
            }
        }
        return { changes: 1 };
    }
}

// Global instance to persist across HMR/warm starts
let dbInstance = null;

async function openDb() {
    if (dbInstance) return dbInstance;

    // 1. Production / Vercel with Postgres
    if (process.env.POSTGRES_URL) {
        const maskedUrl = process.env.POSTGRES_URL.replace(/:([^:@]+)@/, ':***@');
        console.log(`[DB] Connecting to Postgres... URL: ${maskedUrl}`);

        try {
            const { Pool } = require('pg');
            const pool = new Pool({
                connectionString: process.env.POSTGRES_URL,
                // Verify the server certificate (was rejectUnauthorized:false, which
                // encrypted but skipped cert/hostname checks — open to MITM). The
                // Prisma Postgres host (db.prisma.io) serves a publicly-trusted
                // Let's Encrypt cert that chains to Node's built-in roots, so full
                // verification works with no custom CA. Passing the ssl object
                // explicitly also pins this regardless of how the URL's sslmode is
                // interpreted across pg major versions.
                ssl: { rejectUnauthorized: true },
                // Serverless tuning. Every instance is cold right after a deploy and
                // they all race to connect at once; the previous max:3 over-subscribed
                // Prisma Postgres's connection budget (a connection storm), and the 10s
                // connect timeout was shorter than a cold Prisma Postgres takes to wake
                // — together that 503'd the first page load after each deploy. Fewer
                // connections per instance + a longer wake budget + faster idle release
                // (so a deploy storm drains quickly) make the cold connect reliable.
                max: 2,
                connectionTimeoutMillis: 20000,
                idleTimeoutMillis: 10000,
                keepAlive: true,
            });

            console.log('[DB] pg.Pool created.');
            dbInstance = new PostgresDatabase(pool);
            return dbInstance;
        } catch (e) {
            console.error('[DB] Failed to create pg pool:', e.message);
            throw e;
        }
    }

    // 2. Local SQLite Development
    console.log('[DB] No POSTGRES_URL found. Attempting to use Local SQLite Database.');

    try {
        const sqlite3 = require('sqlite3');
        const { open } = require('sqlite');

        const db = await open({
            filename: path.join(__dirname, 'fuel_prices.db'),
            driver: sqlite3.Database
        });

        console.log('[DB] SQLite connected successfully.');
        dbInstance = new SQLiteDatabase(db);
        return dbInstance;
    } catch (e) {
        console.warn('[DB] SQLite initialization failed. Falling back to Mock In-Memory DB (Data will not save).', e.message);
        dbInstance = new MockDatabase();
        return dbInstance;
    }
}

async function initDb() {
    const db = await openDb();

    // Check if we are using Postgres or Mock
    // Check if we are using Postgres, SQLite, or Mock
    const isPostgres = db instanceof PostgresDatabase;
    const isSQLite = db instanceof SQLiteDatabase;

    if (isPostgres) {
        // Postgres Schema
        await db.exec(`
            CREATE TABLE IF NOT EXISTS fuel_prices (
                id SERIAL PRIMARY KEY,
                type TEXT NOT NULL,
                price REAL NOT NULL,
                location TEXT,
                source TEXT NOT NULL DEFAULT 'Neste',
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // Migration for pre-existing tables (added with multi-station support).
        // Existing Neste-only rows default to source='Neste'.
        await db.exec(`ALTER TABLE fuel_prices ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'Neste';`);
    } else if (isSQLite) {
        // SQLite Schema
        await db.exec(`
            CREATE TABLE IF NOT EXISTS fuel_prices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                price REAL NOT NULL,
                location TEXT,
                source TEXT NOT NULL DEFAULT 'Neste',
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // SQLite lacks "ADD COLUMN IF NOT EXISTS"; ignore the duplicate-column
        // error when migrating a table that already has the column.
        try {
            await db.exec(`ALTER TABLE fuel_prices ADD COLUMN source TEXT NOT NULL DEFAULT 'Neste';`);
        } catch (e) {
            if (!/duplicate column/i.test(e.message)) throw e;
        }
        console.log('[DB] SQLite Table initialized');
    } else {
        console.log('[DB] Mock DB initialized (No table creation needed)');
    }

    console.log('Database initialized (' + (isPostgres ? 'Postgres' : 'Mock') + ')');
    return db;
}

module.exports = { openDb, initDb, convertQueryToPg };
