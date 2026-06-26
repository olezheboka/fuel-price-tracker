// Post-build step: turn the single Vite output (dist/index.html) into one
// separately-indexable document per language at dist/<lang>/index.html, plus one
// per provider/fuel landing page at dist/<lang>/<slug>/index.html — each with a
// localized <title>/description, correct <html lang>, a self-referencing
// canonical and reciprocal hreflang (x-default → lv). The price-injection marker
// is preserved so the edge middleware can still inline live prices per page.
//
// Why a shell-templating step instead of full SSG: the app is a small SPA and the
// visible prices are injected at the edge from Blob; we only need correct,
// crawlable <head> (+ a short intro paragraph for page docs) per URL — not a
// build-time React render. Cheap, no framework.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_ORIGIN, LANGS, DEFAULT_LANG, META, HREFLANG, langPath, PAGES, PAGE_META, pagePath, SITE_NAME, OG_IMAGE, STATION_NAMES, FAQ } from '../src/lib/seo-meta.js';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, '..', 'dist');
const templatePath = resolve(distDir, 'index.html');

// Build date stamped into <lastmod> (plain Node, real Date is fine here). Deploys
// are frequent and prices change hourly, so a fresh build date is an honest
// freshness signal for crawlers.
const BUILD_DATE = new Date().toISOString().slice(0, 10);

// Visible FAQ section heading + localized "Home" breadcrumb label. Kept local
// (not pulled from the heavy client i18n bundle) so the build step stays light.
const FAQ_HEADING = { lv: 'Biežāk uzdotie jautājumi', ru: 'Часто задаваемые вопросы', en: 'Frequently asked questions' };
const HOME_CRUMB = { lv: 'Sākums', ru: 'Главная', en: 'Home' };
const DATASET_NAME = { lv: 'Degvielas cenas Latvijā', ru: 'Цены на топливо в Латвии', en: 'Fuel prices in Latvia' };

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// JSON-LD payloads are serialized with JSON.stringify and dropped inside a
// <script type="application/ld+json"> block. Only `<` can break out of that
// context, so escape it (mirrors edge-serialize.js for the price script).
const jsonLdScript = (obj) =>
  `    <script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

// Organization + WebSite, referenced by @id from the other home graphs.
const orgNode = () => ({
  '@type': 'Organization',
  '@id': `${SITE_ORIGIN}/#org`,
  name: SITE_NAME,
  url: `${SITE_ORIGIN}/`,
  logo: OG_IMAGE,
});

const webSiteNode = (lang) => ({
  '@type': 'WebSite',
  '@id': `${SITE_ORIGIN}/#website`,
  url: `${SITE_ORIGIN}/`,
  name: SITE_NAME,
  inLanguage: lang,
  publisher: { '@id': `${SITE_ORIGIN}/#org` },
});

// Describes the hourly price dataset itself (surfaces in Google Dataset Search).
// Only honest, verifiable fields — no fabricated prices/coverage that could read
// as structured-data spam.
const datasetNode = (lang, canonical, description) => ({
  '@type': 'Dataset',
  name: DATASET_NAME[lang],
  description,
  url: canonical,
  inLanguage: lang,
  isAccessibleForFree: true,
  creator: { '@id': `${SITE_ORIGIN}/#org` },
  keywords: [...STATION_NAMES, '95', '98', 'diesel', 'D+', 'LPG'],
  variableMeasured: ['95', '98', 'Diesel', 'D+ (Pro Diesel)', 'LPG'],
});

const faqNode = (lang) => ({
  '@type': 'FAQPage',
  mainEntity: FAQ[lang].map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
});

// Home › <page> trail for landing pages.
const breadcrumbNode = (lang, pageH1, canonical) => ({
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: HOME_CRUMB[lang], item: `${SITE_ORIGIN}${langPath(lang)}` },
    { '@type': 'ListItem', position: 2, name: pageH1, item: canonical },
  ],
});

// Static, crawlable FAQ block injected at __PAGE_FAQ__ (homes only). React removes
// `#seo-faq` on mount (main.jsx) and renders its own styled accordion, so this
// exists purely for crawlers that don't run JS well (Yandex/Bing) — and it matches
// the FAQPage JSON-LD exactly, as Google requires.
const faqStyle = 'max-width:1024px;margin:8px auto 24px;padding:0 16px;font:15px/1.6 Inter,system-ui,sans-serif;color:#334155;';
function buildFaqHtml(lang) {
  const items = FAQ[lang]
    .map(({ q, a }) => `<h3 style="font-size:16px;font-weight:700;color:#0f172a;margin:16px 0 4px;">${esc(q)}</h3><p style="margin:0;">${esc(a)}</p>`)
    .join('');
  return `<section id="seo-faq" style="${faqStyle}"><h2 style="font-size:18px;font-weight:800;color:#0f172a;margin:0 0 8px;">${esc(FAQ_HEADING[lang])}</h2>${items}</section>`;
}

// Build the reciprocal hreflang block for one document: every language's URL for
// the SAME resource (home or the same landing page), plus x-default → lv's.
// pathFor(lang) returns that language's path for this resource.
function hreflangBlock(pathFor) {
  return [
    ...LANGS.map((l) => `    <link rel="alternate" hreflang="${HREFLANG[l]}" href="${SITE_ORIGIN}${pathFor(l)}" />`),
    `    <link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}${pathFor(DEFAULT_LANG)}" />`,
  ].join('\n');
}

// meta = { htmlLang, title, description }; pathFor = lang => path for this resource
// (langPath for homes, pagePath(.., slug) for landing pages); intro = optional
// visible body copy (landing pages only — homes get '' and the marker is stripped);
// jsonLd = array of objects emitted as <script type="application/ld+json"> blocks;
// faqHtml = optional static crawlable FAQ injected at __PAGE_FAQ__ (homes only).
function renderDoc(html, { htmlLang, title, description, pathFor, intro, jsonLd = [], faqHtml = '' }) {
  const canonical = `${SITE_ORIGIN}${pathFor(htmlLang)}`;
  // og:locale:alternate for the OTHER languages of this same resource.
  const altLocales = LANGS.filter((l) => l !== htmlLang)
    .map((l) => `    <meta property="og:locale:alternate" content="${l}" />`)
    .join('\n');

  const headExtras = [
    `    <link rel="canonical" href="${canonical}" />`,
    hreflangBlock(pathFor),
    `    <meta property="og:title" content="${esc(title)}" />`,
    `    <meta property="og:description" content="${esc(description)}" />`,
    `    <meta property="og:url" content="${canonical}" />`,
    `    <meta property="og:locale" content="${htmlLang}" />`,
    altLocales,
    `    <meta property="og:type" content="website" />`,
    `    <meta name="twitter:title" content="${esc(title)}" />`,
    `    <meta name="twitter:description" content="${esc(description)}" />`,
    ...jsonLd.map(jsonLdScript),
  ].join('\n');

  const introMarker = '<!-- __PAGE_INTRO__ -->';
  const introStyle = 'max-width:720px;margin:1rem auto 0;padding:0 1rem;font:15px/1.5 Inter,system-ui,sans-serif;color:#475569;text-align:center;';
  const introHtml = intro ? `<p id="seo-intro" style="${introStyle}">${esc(intro)}</p>` : '';

  return html
    .replace(/<html[^>]*>/, `<html lang="${htmlLang}">`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/, `<meta name="description" content="${esc(description)}" />`)
    .replace('</head>', `${headExtras}\n  </head>`)
    .replace(introMarker, introHtml)
    .replace('<!-- __PAGE_FAQ__ -->', faqHtml);
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
    const canonical = `${SITE_ORIGIN}${langPath(lang)}`;
    const out = renderDoc(template, {
      htmlLang: lang,
      title: META[lang].title,
      description: META[lang].description,
      pathFor: langPath,
      // Home intro is crawler-only (React drops #seo-intro on the home, see
      // main.jsx), so it adds keyword copy without changing the live dashboard.
      intro: META[lang].homeIntro,
      jsonLd: [{
        '@context': 'https://schema.org',
        '@graph': [orgNode(), webSiteNode(lang), datasetNode(lang, canonical, META[lang].description), faqNode(lang)],
      }],
      faqHtml: buildFaqHtml(lang),
    });
    const dir = resolve(distDir, lang);
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, 'index.html'), out, 'utf8');
    console.log(`[prerender] wrote dist/${lang}/index.html`);
  }

  for (const page of PAGES) {
    for (const lang of LANGS) {
      const meta = PAGE_META[page.slug][lang];
      const canonical = `${SITE_ORIGIN}${pagePath(lang, page.slug)}`;
      const out = renderDoc(template, {
        htmlLang: lang,
        title: meta.title,
        description: meta.description,
        intro: meta.intro,
        pathFor: (l) => pagePath(l, page.slug),
        jsonLd: [{
          '@context': 'https://schema.org',
          '@graph': [orgNode(), breadcrumbNode(lang, meta.h1, canonical)],
        }],
      });
      const dir = resolve(distDir, lang, page.slug);
      await mkdir(dir, { recursive: true });
      await writeFile(resolve(dir, 'index.html'), out, 'utf8');
      console.log(`[prerender] wrote dist/${lang}/${page.slug}/index.html`);
    }
  }

  await writeFile(resolve(distDir, 'sitemap.xml'), buildSitemap(), 'utf8');
  console.log('[prerender] wrote dist/sitemap.xml');
}

// Each <url> must list every alternate (including itself and x-default), per
// Google's hreflang-in-sitemap rules.
function buildSitemap() {
  const alternatesFor = (pathFor) => [
    ...LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${HREFLANG[l]}" href="${SITE_ORIGIN}${pathFor(l)}"/>`),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}${pathFor(DEFAULT_LANG)}"/>`,
  ].join('\n');

  const homeUrls = LANGS.map((l) => `  <url>
    <loc>${SITE_ORIGIN}${langPath(l)}</loc>
    <lastmod>${BUILD_DATE}</lastmod>
${alternatesFor(langPath)}
  </url>`);

  const pageUrls = PAGES.flatMap((page) => {
    const pathFor = (l) => pagePath(l, page.slug);
    return LANGS.map((l) => `  <url>
    <loc>${SITE_ORIGIN}${pathFor(l)}</loc>
    <lastmod>${BUILD_DATE}</lastmod>
${alternatesFor(pathFor)}
  </url>`);
  });

  // Single-page utility (the embeddable-widget page) — no language variants, so
  // no hreflang alternates. Indexing it lets it rank for "degvielas cenu logrīks"
  // and surfaces it to the webmasters who'd embed it (and link back).
  const widgetUrl = `  <url>
    <loc>${SITE_ORIGIN}/widget.html</loc>
    <lastmod>${BUILD_DATE}</lastmod>
  </url>`;

  const urls = [...homeUrls, ...pageUrls, widgetUrl].join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

main();
