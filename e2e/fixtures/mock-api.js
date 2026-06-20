// Deterministic mock of the public API for E2E. Generates a current snapshot and
// ~14 days of daily history across all four chains, so the prices view, charts,
// dynamics and history table all have data — without a DB or network.

const STATION_FUELS = {
  Neste: ['95', '98', 'diesel', 'pro'],
  CircleK: ['95', '98', 'diesel', 'pro', 'gas'],
  Virsi: ['95', '98', 'diesel', 'gas'],
  Viada: ['95', '98', 'diesel', 'pro', 'gas'],
};

// Neste stores full product names; others store canonical ids.
const NESTE_NAME = { '95': 'Neste Futura 95', '98': 'Neste Futura 98', diesel: 'Neste Futura D', pro: 'Neste Pro Diesel' };
const BASE = { '95': 1.71, '98': 1.78, diesel: 1.69, pro: 1.81, gas: 0.89 };

const typeFor = (source, fuel) => (source === 'Neste' ? NESTE_NAME[fuel] : fuel);
const ADDR = 'Brīvības gatve 297, Rīga | Lubānas 64, Rīga';

function rowsAt(date, dayIndex) {
  const ts = date.toISOString();
  const rows = [];
  for (const [source, fuels] of Object.entries(STATION_FUELS)) {
    for (const fuel of fuels) {
      // Gentle per-day, per-station drift so charts have shape.
      const wobble = ((dayIndex % 5) - 2) * 0.004 + (source.length % 3) * 0.003;
      const price = Number((BASE[fuel] + wobble).toFixed(3));
      rows.push({ type: typeFor(source, fuel), price, location: ADDR, source, timestamp: ts });
    }
  }
  return rows;
}

export function buildHistory(days = 14, now = Date.UTC(2026, 5, 20, 9, 0, 0)) {
  const out = [];
  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(now - d * 24 * 60 * 60 * 1000);
    out.push(...rowsAt(date, days - 1 - d));
  }
  return out;
}

export function buildLatest(now = Date.UTC(2026, 5, 20, 9, 0, 0)) {
  return rowsAt(new Date(now), 13);
}

// Install route handlers on a Playwright page. Mocks every /api/** call and
// blocks third-party analytics so the run stays offline and console-clean.
export async function mockApi(page, { latest = buildLatest(), history = buildHistory() } = {}) {
  await page.route('**/posthog.com/**', (route) => route.abort());
  await page.route('**/i.posthog.com/**', (route) => route.abort());

  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('/api/prices/latest')) return json(latest);
    if (url.includes('/api/prices/history')) return json(history);
    if (url.includes('/api/refresh')) return json({ status: 'ok', scraped: false, debounced: true });
    if (url.includes('/api/health')) return json({ status: 'ok', dbReady: true });
    return json([]);
  });
}
