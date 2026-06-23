import { serializeForScript } from './edge-serialize.js';
import { PAGES, PAGE_META, pageFromPath } from './client/src/lib/seo-meta.js';
import { fuelGroupId, stationKey, STATIONS, FUEL_GROUPS } from './client/src/lib/fuel.js';

// Run on the three canonical language homes, the bare `/` entry (redirected here
// rather than via a static vercel.json rule, so a returning visitor's `lang`
// cookie can send them to their remembered language instead of always
// defaulting to lv), and every provider/fuel landing page (P1). The
// no-trailing-slash variants (/lv) are still 308'd to /lv/ by vercel.json, so by
// the time we run those paths are already canonical.
//
// Must stay a literal array — Vercel statically parses `config.matcher` to wire
// up routing middleware, so a computed expression here (e.g. built from PAGES)
// would silently fail to register, the same class of bug fixed for this file
// once already (see git history: migrating off legacy vercel.json builds/routes).
export const config = {
  matcher: [
    '/', '/lv/', '/ru/', '/en/',
    '/lv/neste/', '/lv/circle-k/', '/lv/virsi/', '/lv/viada/', '/lv/95/', '/lv/98/', '/lv/diesel/', '/lv/pro/', '/lv/gas/',
    '/ru/neste/', '/ru/circle-k/', '/ru/virsi/', '/ru/viada/', '/ru/95/', '/ru/98/', '/ru/diesel/', '/ru/pro/', '/ru/gas/',
    '/en/neste/', '/en/circle-k/', '/en/virsi/', '/en/viada/', '/en/95/', '/en/98/', '/en/diesel/', '/en/pro/', '/en/gas/',
  ],
};

export { serializeForScript };

// Localized labels for the static (pre-JS) price snapshot. React replaces #root on
// mount, so this exists purely so non-JS crawlers see today's numbers + station and
// fuel keywords, and to paint meaningful content immediately (LCP).
const LABELS = {
  lv: { h1: 'Degvielas cenas Latvijā šodien', gas: 'Gāze' },
  ru: { h1: 'Цены на топливо в Латвии сегодня', gas: 'Газ' },
  en: { h1: 'Fuel prices in Latvia today', gas: 'LPG' },
};

// id -> short display code, matching the app's fuel-label pills (App.jsx).
const FUEL_DISPLAY_ID = { diesel: 'D', pro: 'D+' };
const fuelDisplayLabel = (fuelId, lang) =>
  fuelId === 'gas' ? LABELS[lang].gas : FUEL_DISPLAY_ID[fuelId] || fuelId;

// Same cheapest-row highlight as App.jsx's CHEAPEST_COLOR.
const CHEAPEST_COLOR = '#16a34a';
const CARD_SHADOW = '0 1px 8px rgba(0,0,0,0.05),0 1px 2px rgba(0,0,0,0.03)';

const escHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function langFromPath(pathname) {
  const seg = pathname.split('/').filter(Boolean)[0];
  return LABELS[seg] ? seg : 'lv';
}

function getCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Build a crawlable price snapshot from the latest-prices array
// ([{ type, price, source, ... }]), styled inline to match the app's own card
// look (see FuelGroupBlock/StationRow in App.jsx) so the pre-hydration paint
// isn't a jarring "plain text table" flash — it already looks like the real UI.
// Station + fuel + per-litre price = the keyword + freshness signal we want in
// the raw HTML. `page` (from pageFromPath), when present, narrows the rows to
// that one station/fuel and swaps in its own h1.
function buildSeoBlock(prices, lang, page) {
  const L = LABELS[lang] || LABELS.lv;
  const h1 = page ? PAGE_META[page.slug][lang].h1 : L.h1;
  let filtered = Array.isArray(prices) ? prices : [];
  if (page?.kind === 'station') filtered = filtered.filter((p) => stationKey(p) === page.filterId);
  if (page?.kind === 'fuel') filtered = filtered.filter((p) => fuelGroupId(p) === page.filterId);
  filtered = filtered.filter((p) => p && typeof p.price === 'number');

  const byGroup = new Map();
  for (const p of filtered) {
    const id = fuelGroupId(p);
    if (!byGroup.has(id)) byGroup.set(id, []);
    byGroup.get(id).push(p);
  }

  const groupsHtml = FUEL_GROUPS.map((g) => g.id)
    .filter((id) => byGroup.has(id))
    .map((id) => {
      const rows = [...byGroup.get(id)].sort((a, b) => a.price - b.price);
      const rowsHtml = rows.map((p, i) => {
        const st = STATIONS[stationKey(p)] || { label: p.source || '', color: '#334155' };
        const cheapest = i === 0;
        const rowStyle = cheapest ? `background:${hexToRgba(CHEAPEST_COLOR, 0.09)};border-radius:10px;` : '';
        const priceStyle = cheapest
          ? `background:${CHEAPEST_COLOR};color:#fff;padding:2px 8px;border-radius:9999px;`
          : 'color:#0f172a;';
        return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;${rowStyle}">` +
          `<span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;color:${st.color}">${escHtml(st.label)}</span>` +
          `<span style="font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;${priceStyle}">${p.price.toFixed(3)} €/l</span>` +
          `</div>`;
      }).join('');
      return `<div style="background:#fff;border-radius:16px;padding:12px 14px;box-shadow:${CARD_SHADOW}">` +
        `<span style="display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:4px 10px;border-radius:8px;background:#f1f5f9;color:#334155;margin-bottom:6px;">${escHtml(fuelDisplayLabel(id, lang))}</span>` +
        rowsHtml +
        `</div>`;
    }).join('');

  return `<div id="seo-prices" style="max-width:840px;margin:0 auto;padding:16px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;">` +
    `<h1 style="font-size:20px;font-weight:800;color:#0f172a;text-align:center;margin:0 0 16px;">${escHtml(h1)}</h1>` +
    `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">${groupsHtml}</div>` +
    `</div>`;
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export default async function middleware(request) {
  const url = new URL(request.url);

  // 1. Only intercept GET, and avoid looping on the bypass fetch below.
  if (request.method !== 'GET' || url.searchParams.has('_middleware_skip')) {
    return;
  }

  // 1a. Bare `/` → redirect to the visitor's remembered language (cookie set by
  // the client whenever it resolves/changes language), falling back to lv for
  // first-time visitors and crawlers.
  if (url.pathname === '/') {
    const cookieLang = getCookie(request, 'lang');
    const lang = LABELS[cookieLang] ? cookieLang : 'lv';
    return Response.redirect(new URL(`/${lang}/`, url), 308);
  }

  const blobUrl = process.env.BLOB_URL_PREFIX;
  if (!blobUrl) {
    console.warn('[Middleware] BLOB_URL_PREFIX not set, skipping injection');
    return;
  }

  const lang = langFromPath(url.pathname);
  const page = pageFromPath(url.pathname);

  try {
    // 2. Latest prices from Blob CDN (warm, <10ms).
    const pricesPromise = fetch(`${blobUrl}/prices/latest.json`, {
      headers: { 'Cache-Control': 'no-cache' },
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

    // 3. The prerendered, language-specific HTML from origin (bypass this middleware).
    const bypassUrl = new URL(request.url);
    bypassUrl.searchParams.set('_middleware_skip', '1');
    const htmlPromise = fetch(bypassUrl.toString());

    const [latestPrices, htmlResponse] = await Promise.all([pricesPromise, htmlPromise]);

    if (!latestPrices || !htmlResponse.ok) {
      return; // Fall back to the static page as-is.
    }

    let html = await htmlResponse.text();

    // 4a. Inline the live prices for hydration (escaped against </script> breakouts).
    const safe = serializeForScript(latestPrices);
    const injection = `<script>window.__INITIAL_PRICES__ = ${safe};</script>`;
    const marker = '<!-- __INITIAL_PRICES_INJECTED_HERE__ -->';
    html = html.includes(marker)
      ? html.replace(marker, injection)
      : html.replace('</head>', `${injection}\n</head>`);

    // 4b. Inject the crawlable price snapshot into #root (React overwrites it on mount).
    const seoBlock = buildSeoBlock(latestPrices, lang, page);
    html = html.replace('<div id="root"></div>', `<div id="root">${seoBlock}</div>`);

    // 5. Return the modified HTML, preserving the origin's security headers but
    // overriding cache-control: the bypassed static asset's own header is
    // `public, max-age=0, must-revalidate`, which Vercel's edge treats as
    // stale-while-revalidate-able — each POP happily keeps serving its own
    // cached (Blob-snapshot-as-of-fetch-time) copy in the background while
    // "revalidating", so the injected prices can freeze for a long time even
    // though writeSnapshot() itself is rewriting the Blob on schedule. This is
    // a per-request, personalized injection (it just read the live Blob), so it
    // must never be cached by the CDN.
    return new Response(html, {
      headers: {
        ...Object.fromEntries(htmlResponse.headers),
        'content-type': 'text/html; charset=utf-8',
        'x-middleware-injected': '1',
        'cache-control': 'private, no-store, max-age=0, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[Middleware] Error during injection:', error);
    return; // Fall back to normal flow.
  }
}
