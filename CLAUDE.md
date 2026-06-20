# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fuel Price Tracker — a full-stack web app that scrapes, stores, and visualizes fuel prices from Latvian gas stations across four chains (Neste, Circle K, Virši, Viada). All client views are multi-station: the prices view, the per-fuel charts, the Dynamics deltas, and the history table (which carries per-station Ø average + Min–Max footer rows; the old Neste-only "average price" cards were removed). Deployed on Vercel at https://neste-fuel-tracker.vercel.app.

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
    components/ui/   # Calendar, DatePicker, Popover, MultiSelect
server/              # Express backend (CommonJS)
  index.js           # API routes, CORS, rate limiting
  db.js              # Database abstraction (Postgres/SQLite/Mock)
  scraper.js         # Cheerio-based Neste scraper (extended w/ shared ts + source)
  scrapers/          # Multi-station: circlek.js, virsi.js, viada.js,
                     #   normalize.js (helpers), index.js (scrapeAll orchestrator)
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

All optional, used for deep linking and state sharing. Every param is **omitted when at its default** so a fresh visit's URL is bare — only non-default state appears:
```
?lang=ru&discounts=off&h_preset=30&stations=Neste,CircleK&fuels=95,diesel&br_start=2026-04-01&br_end=2026-05-15
```
- `lang` — UI language (`en`, `lv`, `ru`); **omitted when `en`** (the default). Always persisted to localStorage regardless.
- `discounts` — chart discount-shading toggle; default is **on**, so the param appears **only as `discounts=off`** when toggled off.
- `h_preset` — history period preset (`7`, `30`, `90`); **default `7`** (omitted from the URL when `7`); mutually exclusive with `h_start`/`h_end`
- `h_start`, `h_end` — custom history date range (`YYYY-MM-DD`); only present when no preset is active
- `br_start`, `br_end` — chart **timeline range slider** (Brush) window as Riga-local dates (`YYYY-MM-DD`); **omitted when the window is the default** (last 30 days / full range). Persisted as dates, not array indices, so a shared link restores the same visible window even after new hourly data shifts indices. On load they map back to the nearest indices (min span 7 days). The chart is day-granularity only — the old Days/Weeks/Months switcher (and its `period` param) were removed; this slider is the only chart range control.
- `stations` — CSV station filter (`Neste`, `CircleK`, `Virsi`, `Viada`); omitted when all selected. ONE global filter driving the prices view AND all of analytics (chart, Dynamics, history table).
- `fuels` — CSV fuel-group filter (`95`, `98`, `diesel`, `pro`, `gas`); omitted when all selected. Same global scope as `stations`.
- `afuel` — CSV of the fuel types shown in the Analytics card (`95`, `98`, `diesel`, `pro`, `gas`); **omitted when all available fuels are selected** (the default) or when only one fuel is available (control hidden).
Graph, Dynamics, and Price History live in ONE merged "Analytics" card. Its header carries a **multi-select fuel dropdown** (the shared `MultiSelect` component, label `t('fuel_filter')` = "Топливо", `allLabel` "Все") letting you show one, several, or all fuel types across all three subsections at once — checkboxes + "Select all" + per-row "Only", no color dots. Options come from `analyticsFuelList` (= `analyticsFuels`: the global `fuels` filter ∩ what the selected stations sell); the control is hidden when ≤1 fuel remains. State is `analyticsFuelSelection` (raw Set, defaults to all, never empty); what's actually shown is `effectiveAnalyticsFuels` = the selection ∩ available, falling back to all available if that intersection is empty (so the view is never blank — derived in render, no setState-in-effect). All three subsections filter their groups by `effectiveAnalyticsFuels`. The top "cheapest prices" cards are unaffected and still show all globally-selected fuels. `HistoryTable` renders card-less (its parent provides the card); its "Price History" subsection header holds the date-range picker plus a `7`/`30`/`90`-day preset segmented control (default 7).

State priority: URL params > localStorage > hardcoded defaults. (The old `fuel` single-fuel param for the Dynamics section was removed — Dynamics now follows the global `stations`/`fuels` filters.)

## Fuel Types & Stations

Canonical fuel groups: 95, 98, Diesel, Pro Diesel, Gas (LPG) — colors green-500, cyan-500, gray-900, yellow-500, violet-500. Display labels are codes shown the same in all 3 languages: `95`, `98`, `D`, `D+`; gas is localized (`Газ`/`Gāze`/`LPG`). Pro Diesel (`D+`) is premium diesel — **Virši doesn't sell it**; Gas is **LPG / autogāze** (per-liter) — **Neste doesn't sell it**. `STATION_FUEL_SUPPORT` in `App.jsx` encodes per-station availability and drives both the fuel filter options and an `effectiveSelectedFuels` intersection, so a group disappears when no selected station sells it (selecting only Neste hides Gas; only Virši hides D+). Discount indicator color: `#44D62C`.

Prices are grouped by fuel type across four stations, each with a brand color used for its row label and filter dot: Neste `#073C87`, Circle K `#EE2E25`, Virši `#613DC1`, Viada `#D81438`. Each station scraper normalizes its native fuel names to a canonical id (`95`/`98`/`diesel`/`pro`/`gas`) in `server/scrapers/normalize.js` conventions; `pro` maps from Circle K `Dmiles+`, Neste `Pro Diesel`, and for Viada the **more expensive of its two diesels** (`d_ecto` and `petrol_d` are swapped post-scrape in `viada.js` so D+ always tracks the pricier diesel, since Viada sometimes prices its ECTO diesel below regular D); `gas` maps from Circle K `Autogāze`, Virši `lpg`, Viada `GAZE`. Types outside the five canonical groups (CNG/E85/AdBlue/XTL/premium-95) are omitted. Neste rows store the full fuel name (`Neste Futura 95`); other stations store the canonical id directly. The client maps both to a group via `fuelGroupId()` in `App.jsx`.

## Architecture Notes

- **Scraper** fetches `neste.lv/lv/content/degvielas-cenas`, parses with Cheerio, uses fuzzy matching for fuel names, handles `\u00A0` non-breaking spaces
- **Multi-station**: `scrapeAll()` (`server/scrapers/index.js`) runs all four station scrapers in PARALLEL via `Promise.allSettled` (one failure never breaks the others) with ONE shared timestamp, so `/api/prices/latest` (`WHERE timestamp = MAX(...)`) returns every station from the same cycle. Rows are tagged with a `fuel_prices.source` column (default `'Neste'`, added via idempotent migration in `db.js`).
- **History is multi-station**: `/api/prices/history` returns ALL stations; `deduplicateHistory` buckets by `(Riga-date, source, type)`. Client consumers (all in `App.jsx`): `chartData` builds per-`${fuelId}__${source}` series for the per-fuel charts (`FuelTrendChart`); `allDaysMulti`/`tableFuelGroups` drive the per-fuel history table (station columns, cheapest-of-day highlighted); `insightsGroups` drives the Dynamics deltas (`InsightsPanel.jsx`). `tableFuelGroups` also computes per-station Ø/min/max stats over the whole filtered period for the history-table footer (lowest average outlined in green); the old Neste-only "average price" cards are gone. Discount-day detection stays Neste-based (`allDaysData`, filtered `source==='Neste'`, also feeds the date-picker's available dates). New chains began scraping recently, so their charts/deltas are sparse (em dashes / short lines) until history accumulates.
- **Cron**: Vercel triggers `/api/scrape` hourly; scrape endpoint has 5-minute debounce (no auth)
- **Data flow**: scrapeAll → DB insert (per source) → `/api/prices/latest` (current, all stations) + `/api/prices/history` (all stations; chart filters to Neste client-side, Dynamics uses per-station)
- **Timezone**: All dates normalized to Europe/Riga via `Intl.toLocaleString()` and `getRigaDateParts()` helper — critical for correct price grouping
- **Auto-refresh**: Client polls every 15 minutes; compares prices to show change notifications
- **Vercel config**: Security headers (X-Frame-Options DENY, Permissions-Policy), API routes have `no-store, max-age=0`
- **Performance**: Edge Middleware (`middleware.js`) inlines `latest.json` from Vercel Blob directly into the HTML as `window.__INITIAL_PRICES__` for instant first paint (LCP/FCP optimization).
