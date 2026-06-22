import { serializeForScript } from './edge-serialize.js';

// Run on the three canonical language homes, plus the bare `/` entry (which we
// redirect here rather than via a static vercel.json rule, so a returning
// visitor's `lang` cookie can send them to their remembered language instead of
// always defaulting to lv). The no-trailing-slash variants (/lv) are still
// 308'd to /lv/ by vercel.json, so by the time we run those paths are already
// canonical. Extend this list when language-prefixed landing pages (e.g.
// /lv/neste) are added.
export const config = {
  matcher: ['/', '/lv/', '/ru/', '/en/'],
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
// + freshness signal we want in the raw HTML.
function buildSeoBlock(prices, lang) {
  const L = LABELS[lang] || LABELS.lv;
  const rows = (Array.isArray(prices) ? prices : [])
    .filter((p) => p && typeof p.price === 'number')
    .sort((a, b) => String(a.source || '').localeCompare(String(b.source || '')) ||
      String(a.type || '').localeCompare(String(b.type || '')))
    .map((p) => `<tr><td>${escHtml(p.source || '')}</td><td>${escHtml(p.type || '')}</td><td>${p.price.toFixed(3)} €/l</td></tr>`)
    .join('');
  return `<div id="seo-prices"><h1>${escHtml(L.h1)}</h1>` +
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
    const seoBlock = buildSeoBlock(latestPrices, lang);
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
