# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

Fuel Price Tracker — a full-stack web app that scrapes, stores, and visualizes fuel prices from Latvian gas stations across four chains (Neste, Circle K, Virši, Viada). Deployed on Vercel at https://neste-fuel-tracker.vercel.app.

## Tech Stack

- **Frontend**: React 19 + Vite, Tailwind CSS, Recharts, Framer Motion, i18next (EN/LV/RU)
- **Backend**: Express 5 (CommonJS), Cheerio scraper
- **Database**: PostgreSQL (production via Vercel Postgres), SQLite (local dev), MockDatabase fallback
- **Deployment**: Vercel (serverless functions + static build), hourly cron scrape

## Project Structure

```
client/              # React frontend (ES modules)
  src/
    App.jsx          # Main component (~1900 lines)
    InsightsPanel.jsx
    CustomTooltip.jsx
    i18n.js          # Inline translations for 3 languages
    components/ui/   # Calendar, DatePicker, Popover (Radix-based)
server/              # Express backend (CommonJS)
  index.js           # API routes, CORS, rate limiting
  db.js              # Database abstraction (Postgres/SQLite/Mock)
  scraper.js         # Cheerio-based price scraper
vercel.json          # Deployment config, routes, cron, security headers
```

## Commands

```bash
# Frontend dev
cd client && npm install && npm run dev    # Vite on port 5173

# Backend dev
cd server && npm install && node index.js  # Express on port 3000

# Frontend build
cd client && npm run build                 # Output: client/dist/

# Lint
cd client && npm run lint
```

There is no test suite.

## API Endpoints

- `GET /api/prices/latest` — current fuel prices
- `GET /api/prices/history?type=<fuel_type>` — historical data
- `GET /api/scrape` — trigger scrape (5min debounce)
- `GET /api/health` — health check

## Key Conventions

- **Module systems differ**: client uses ES modules, server uses CommonJS
- **Naming**: camelCase for variables/functions, PascalCase for React components
- **Styling**: Tailwind utility classes in JSX; clsx + tailwind-merge for conditional styles
- **Timezone**: All dates normalized to Europe/Riga
- **i18n**: Translations are inline in `client/src/i18n.js`, not separate files
- **Log prefixes**: `[Server]`, `[API]`, `[SCRAPER]`, `[DB]` in backend logs
- **No TypeScript** — project uses plain JavaScript throughout
- **Commit style**: conventional commits (`feat`, `fix`, `chore`, etc.)

## Database Fallback Chain

`server/db.js` tries databases in order: PostgreSQL → SQLite → MockDatabase (in-memory). Each level activates automatically if the previous fails. The abstraction converts SQLite `?` parameters to PostgreSQL `$1, $2` syntax via `convertQueryToPg()`. PostgreSQL uses connection pooling (max 3, 10s timeout, SSL). SQLite stores at `server/fuel_prices.db`. MockDatabase keeps last 4000 records in memory — useful when neither real DB is available but data won't persist.

## Environment Variables

Server expects `POSTGRES_URL` in `server/.env` for production database. SQLite is used as fallback for local development. `VERCEL` env var is set automatically in production.

## URL Parameter Schema

All optional, used for deep linking and state sharing:
```
?fuel=95&period=days&lang=en&discounts=on&h_preset=30&h_start=2026-01-01&h_end=2026-04-09
```
- `fuel` — single fuel shorthand for Dynamics section (`95`, `98`, `diesel`, `pro`)
- `period` — graph interval (`days`, `weeks`, `months`)
- `lang` — UI language (`en`, `lv`, `ru`)
- `discounts` — discount toggle, only in day view (`on`, `off`)
- `h_preset` — history period preset (`7`, `30`, `thisMonth`, `lastMonth`); mutually exclusive with `h_start`/`h_end`
- `h_start`, `h_end` — custom history date range (`YYYY-MM-DD`); only present when no preset is active

Fuel shorthand mapping: `95` → `Neste Futura 95`, `98` → `Neste Futura 98`, `diesel` → `Neste Futura D`, `pro` → `Neste Pro Diesel`. State priority: URL params > localStorage > hardcoded defaults.

## Fuel Types

95 (Futura), 98 (Futura), Diesel (Futura D), Pro Diesel — each with distinct color coding (green-500, cyan-500, gray-900, yellow-500). Premium badge shown only for 98 and Pro Diesel. Discount indicator color: `#44D62C`.

## Architecture Notes

- **Scraper** fetches `neste.lv/lv/content/degvielas-cenas`, parses with Cheerio, uses fuzzy matching for fuel names, handles `\u00A0` non-breaking spaces
- **Cron**: Vercel triggers `/api/scrape` hourly; scrape endpoint has 5-minute debounce (no auth)
- **Data flow**: Scraper → DB insert → `/api/prices/latest` (current) + `/api/prices/history` (aggregated by day/week/month)
- **Timezone**: All dates normalized to Europe/Riga via `Intl.toLocaleString()` and `getRigaDateParts()` helper — critical for correct price grouping
- **Auto-refresh**: Client polls every 15 minutes; compares prices to show change notifications
- **Vercel config**: Security headers (X-Frame-Options DENY, Permissions-Policy), API routes have `no-store, max-age=0`
- **Performance**: Edge Middleware (`middleware.js`) inlines `latest.json` from Vercel Blob directly into the HTML as `window.__INITIAL_PRICES__` for instant first paint (LCP/FCP optimization).
