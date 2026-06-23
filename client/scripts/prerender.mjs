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
import { SITE_ORIGIN, LANGS, DEFAULT_LANG, META, HREFLANG, langPath, PAGES, PAGE_META, pagePath } from '../src/lib/seo-meta.js';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, '..', 'dist');
const templatePath = resolve(distDir, 'index.html');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
// visible body copy (landing pages only — homes get '' and the marker is stripped).
function renderDoc(html, { htmlLang, title, description, pathFor, intro }) {
  const canonical = `${SITE_ORIGIN}${pathFor(htmlLang)}`;

  const headExtras = [
    `    <link rel="canonical" href="${canonical}" />`,
    hreflangBlock(pathFor),
    `    <meta property="og:title" content="${esc(title)}" />`,
    `    <meta property="og:description" content="${esc(description)}" />`,
    `    <meta property="og:url" content="${canonical}" />`,
    `    <meta property="og:locale" content="${htmlLang}" />`,
    `    <meta property="og:type" content="website" />`,
  ].join('\n');

  const introMarker = '<!-- __PAGE_INTRO__ -->';
  const introStyle = 'max-width:720px;margin:1rem auto 0;padding:0 1rem;font:15px/1.5 Inter,system-ui,sans-serif;color:#475569;text-align:center;';
  const introHtml = intro ? `<p id="seo-intro" style="${introStyle}">${esc(intro)}</p>` : '';

  return html
    .replace(/<html[^>]*>/, `<html lang="${htmlLang}">`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/, `<meta name="description" content="${esc(description)}" />`)
    .replace('</head>', `${headExtras}\n  </head>`)
    .replace(introMarker, introHtml);
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
    const out = renderDoc(template, { htmlLang: lang, ...META[lang], pathFor: langPath, intro: '' });
    const dir = resolve(distDir, lang);
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, 'index.html'), out, 'utf8');
    console.log(`[prerender] wrote dist/${lang}/index.html`);
  }

  for (const page of PAGES) {
    for (const lang of LANGS) {
      const meta = PAGE_META[page.slug][lang];
      const out = renderDoc(template, {
        htmlLang: lang,
        title: meta.title,
        description: meta.description,
        intro: meta.intro,
        pathFor: (l) => pagePath(l, page.slug),
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
${alternatesFor(langPath)}
  </url>`);

  const pageUrls = PAGES.flatMap((page) => {
    const pathFor = (l) => pagePath(l, page.slug);
    return LANGS.map((l) => `  <url>
    <loc>${SITE_ORIGIN}${pathFor(l)}</loc>
${alternatesFor(pathFor)}
  </url>`);
  });

  const urls = [...homeUrls, ...pageUrls].join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

main();
