// Post-build step: turn the single Vite output (dist/index.html) into one
// separately-indexable document per language at dist/<lang>/index.html, each with
// a localized <title>/description, correct <html lang>, a self-referencing
// canonical and reciprocal hreflang (x-default → lv). The price-injection marker
// is preserved so the edge middleware can still inline live prices per page.
//
// Why a shell-templating step instead of full SSG: the app is a small SPA and the
// visible prices are injected at the edge from Blob; we only need correct,
// crawlable <head> per URL — not a build-time React render. Cheap, no framework.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_ORIGIN, LANGS, DEFAULT_LANG, META, HREFLANG, langPath } from '../src/lib/seo-meta.js';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, '..', 'dist');
const templatePath = resolve(distDir, 'index.html');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Reciprocal hreflang block shared by every language document (each lists all
// languages plus x-default). Self-referencing alternate is included by design.
const hreflangBlock = [
  ...LANGS.map((l) => `    <link rel="alternate" hreflang="${HREFLANG[l]}" href="${SITE_ORIGIN}${langPath(l)}" />`),
  `    <link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}${langPath(DEFAULT_LANG)}" />`,
].join('\n');

function renderHead(html, lang) {
  const meta = META[lang];
  const canonical = `${SITE_ORIGIN}${langPath(lang)}`;

  const headExtras = [
    `    <link rel="canonical" href="${canonical}" />`,
    hreflangBlock,
    `    <meta property="og:title" content="${esc(meta.title)}" />`,
    `    <meta property="og:description" content="${esc(meta.description)}" />`,
    `    <meta property="og:url" content="${canonical}" />`,
    `    <meta property="og:locale" content="${lang}" />`,
    `    <meta property="og:type" content="website" />`,
  ].join('\n');

  return html
    .replace(/<html[^>]*>/, `<html lang="${meta.htmlLang}">`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(meta.title)}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/, `<meta name="description" content="${esc(meta.description)}" />`)
    .replace('</head>', `${headExtras}\n  </head>`);
}

async function main() {
  let template;
  try {
    template = await readFile(templatePath, 'utf8');
  } catch {
    console.error(`[prerender] ${templatePath} not found — run "vite build" first.`);
    process.exit(1);
  }

  if (!/<meta\s+name="description"[^>]*>/.test(template)) {
    console.warn('[prerender] No <meta name="description"> in template; descriptions will be missing.');
  }

  for (const lang of LANGS) {
    const out = renderHead(template, lang);
    const dir = resolve(distDir, lang);
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, 'index.html'), out, 'utf8');
    console.log(`[prerender] wrote dist/${lang}/index.html`);
  }

  await writeFile(resolve(distDir, 'sitemap.xml'), buildSitemap(), 'utf8');
  console.log('[prerender] wrote dist/sitemap.xml');
}

// Each <url> must list every alternate (including itself and x-default), per
// Google's hreflang-in-sitemap rules. Generated from LANGS so it extends cleanly
// when provider/fuel landing pages are added.
function buildSitemap() {
  const alternates = [
    ...LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${HREFLANG[l]}" href="${SITE_ORIGIN}${langPath(l)}"/>`),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}${langPath(DEFAULT_LANG)}"/>`,
  ].join('\n');

  const urls = LANGS.map((l) => `  <url>
    <loc>${SITE_ORIGIN}${langPath(l)}</loc>
${alternates}
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

main();
