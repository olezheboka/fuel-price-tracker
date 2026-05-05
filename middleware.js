import { next } from '@vercel/edge';

export const config = {
  matcher: '/',
};

export default async function middleware(request) {
  const url = new URL(request.url);

  // 1. Only intercept GET / (avoiding loops and non-page requests)
  if (request.method !== 'GET' || url.searchParams.has('_middleware_skip')) {
    return;
  }

  const blobUrl = process.env.BLOB_URL_PREFIX;
  if (!blobUrl) {
    console.warn('[Middleware] BLOB_URL_PREFIX not set, skipping injection');
    return;
  }

  try {
    // 2. Fetch latest prices from Blob CDN (warm, <10ms)
    // We add a cache-buster or just rely on the public URL which is usually fresh enough
    // or use the internal put() if we had the token, but fetch is fine for Edge.
    const pricesPromise = fetch(`${blobUrl}/prices/latest.json`, {
      headers: { 'Cache-Control': 'no-cache' }
    }).then(r => r.ok ? r.json() : null).catch(() => null);

    // 3. Fetch the original HTML content from the origin
    // We append a query param to bypass the middleware loop
    const bypassUrl = new URL(request.url);
    bypassUrl.searchParams.set('_middleware_skip', '1');
    const htmlPromise = fetch(bypassUrl.toString());

    const [latestPrices, htmlResponse] = await Promise.all([pricesPromise, htmlPromise]);

    if (!latestPrices || !htmlResponse.ok) {
      return; // Fallback to normal flow
    }

    let html = await htmlResponse.text();

    // 4. Inject the data
    const injection = `<script>window.__INITIAL_PRICES__ = ${JSON.stringify(latestPrices)};</script>`;
    const marker = '<!-- __INITIAL_PRICES_INJECTED_HERE__ -->';
    
    if (html.includes(marker)) {
      html = html.replace(marker, injection);
    } else {
      html = html.replace('</head>', `${injection}\n</head>`);
    }

    // 5. Return the modified HTML with original headers (like CSP, etc.)
    return new Response(html, {
      headers: {
        ...Object.fromEntries(htmlResponse.headers),
        'content-type': 'text/html; charset=utf-8',
        'x-middleware-injected': '1'
      }
    });
  } catch (error) {
    console.error('[Middleware] Error during injection:', error);
    return; // Fallback to normal flow
  }
}
