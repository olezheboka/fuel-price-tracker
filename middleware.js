import { serializeForScript } from './edge-serialize.js';
import { PAGES, PAGE_META, pageFromPath } from './client/src/lib/seo-meta.js';
import { fuelGroupId, stationKey } from './client/src/lib/fuel.js';

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
  lv: { h1: 'Degvielas cenas Latvijā šodien', station: 'DUS', fuel: 'Degviela', price: 'Cena' },
  ru: { h1: 'Цены на топливо в Латвии сегодня', station: 'АЗС', fuel: 'Топливо', price: 'Цена' },
  en: { h1: 'Fuel prices in Latvia today', station: 'Station', fuel: 'Fuel', price: 'Price' },
};

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

// Build a compact, crawlable table from the latest-prices array
// ([{ type, price, source, ... }]). Station + fuel + per-litre price = the keyword
// + freshness signal we want in the raw HTML. `page` (from pageFromPath), when
// present, narrows the rows to that one station/fuel and swaps in its own h1.
function buildSeoBlock(prices, lang, page) {
  const L = LABELS[lang] || LABELS.lv;
  const h1 = page ? PAGE_META[page.slug][lang].h1 : L.h1;
  let filtered = Array.isArray(prices) ? prices : [];
  if (page?.kind === 'station') filtered = filtered.filter((p) => stationKey(p) === page.filterId);
  if (page?.kind === 'fuel') filtered = filtered.filter((p) => fuelGroupId(p) === page.filterId);
  const rows = filtered
    .filter((p) => p && typeof p.price === 'number')
    .sort((a, b) => String(a.source || '').localeCompare(String(b.source || '')) ||
      String(a.type || '').localeCompare(String(b.type || '')))
    .map((p) => `<tr><td>${escHtml(p.source || '')}</td><td>${escHtml(p.type || '')}</td><td>${p.price.toFixed(3)} €/l</td></tr>`)
    .join('');
  return `<div id="seo-prices"><h1>${escHtml(h1)}</h1>` +
    `<table><thead><tr><th>${escHtml(L.station)}</th><th>${escHtml(L.fuel)}</th><th>${escHtml(L.price)}</th></tr></thead>` +
    `<tbody>${rows}</tbody></table></div>`;
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

    // 5. Return the modified HTML, preserving the origin's security headers.
    return new Response(html, {
      headers: {
        ...Object.fromEntries(htmlResponse.headers),
        'content-type': 'text/html; charset=utf-8',
        'x-middleware-injected': '1',
      },
    });
  } catch (error) {
    console.error('[Middleware] Error during injection:', error);
    return; // Fall back to normal flow.
  }
}
