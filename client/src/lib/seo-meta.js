// Single source of truth for per-language SEO metadata, consumed at build time by
// scripts/prerender.mjs to stamp each language document (/lv/, /ru/, /en/) and each
// provider/fuel landing page (/lv/neste/, /lv/diesel/, ...) with a localized
// <title>, meta description, <html lang>, self-canonical and reciprocal hreflang.
// Plain ESM so the Node prerender step can import it directly; also imported by
// the client bundle (pageFromPath) so there's one definition of the slug set.

// Vercel's domain settings redirect the apex (cenometrs.lv) to www, so www is the
// final, 200-status host — canonical/hreflang/sitemap must point there directly
// to avoid a redirect hop on every crawled URL.
export const SITE_ORIGIN = 'https://www.cenometrs.lv';

// Order matters only for sitemap/hreflang listing; lv is the primary market and
// the x-default target.
export const LANGS = ['lv', 'ru', 'en'];
export const DEFAULT_LANG = 'lv';

export const META = {
  lv: {
    htmlLang: 'lv',
    title: 'Degvielas cenas Latvijā šodien — Neste, Circle K, Virši, Viada | cenometrs.lv',
    description:
      'Salīdzini degvielas cenas Latvijā: 95, 98, dīzelis, D+ un gāze. Aktuālās un vēsturiskās cenas no Neste, Circle K, Virši un Viada — atjaunots katru stundu.',
  },
  ru: {
    htmlLang: 'ru',
    title: 'Цены на топливо в Латвии сегодня — Neste, Circle K, Virši, Viada | cenometrs.lv',
    description:
      'Сравните цены на топливо в Латвии: 95, 98, дизель, D+ и газ. Актуальные и исторические цены сетей Neste, Circle K, Virši и Viada — обновляется ежечасно.',
  },
  en: {
    htmlLang: 'en',
    title: 'Fuel Prices in Latvia Today — Neste, Circle K, Virši, Viada | cenometrs.lv',
    description:
      'Compare fuel prices in Latvia: petrol 95, 98, diesel, premium diesel and LPG. Current and historical prices from Neste, Circle K, Virši and Viada — updated hourly.',
  },
};

// hreflang code per language. Latvian/Russian use bare language codes (also catch
// the diaspora); en likewise. x-default → lv is added separately by the consumer.
export const HREFLANG = { lv: 'lv', ru: 'ru', en: 'en' };

// Path for a language's canonical home, e.g. '/lv/'.
export const langPath = (lang) => `/${lang}/`;

// Path for a provider/fuel landing page, e.g. '/lv/neste/'.
export const pagePath = (lang, slug) => `/${lang}/${slug}/`;

// Provider/fuel landing pages (P1). `filterId` is the value seeded into the
// existing global station/fuel filter (STATION_ORDER / FUEL_GROUP_IDS in
// lib/fuel.js) when a visitor lands on that page directly. Slugs are
// language-invariant by design — same URL across lv/ru/en avoids translating
// slugs and the duplicate-content/collision risk that comes with it.
export const PAGES = [
  { slug: 'neste', kind: 'station', filterId: 'Neste' },
  { slug: 'circle-k', kind: 'station', filterId: 'CircleK' },
  { slug: 'virsi', kind: 'station', filterId: 'Virsi' },
  { slug: 'viada', kind: 'station', filterId: 'Viada' },
  { slug: '95', kind: 'fuel', filterId: '95' },
  { slug: '98', kind: 'fuel', filterId: '98' },
  { slug: 'diesel', kind: 'fuel', filterId: 'diesel' },
  { slug: 'pro', kind: 'fuel', filterId: 'pro' },
  { slug: 'gas', kind: 'fuel', filterId: 'gas' },
];

// title/description go in <head>; h1/intro render as visible, crawlable body
// copy (h1 also reused by middleware.js for the pre-hydration SEO price block).
export const PAGE_META = {
  neste: {
    lv: {
      title: 'Neste degvielas cenas Latvijā šodien | cenometrs.lv',
      description: 'Šodienas Neste degvielas cenas Latvijā: 95, 98, dīzelis un Pro dīzelis. Cenas atjauninātas katru stundu, pieejama cenu vēsture un dinamika.',
      h1: 'Neste degvielas cenas Latvijā šodien',
      intro: 'Salīdzini Neste degvielas cenas visā Latvijā — 95, 98, dīzelis un Pro dīzelis ar stundas precizitāti, kā arī cenu izmaiņas pēdējās dienās un nedēļās.',
    },
    ru: {
      title: 'Цены на топливо Neste в Латвии сегодня | cenometrs.lv',
      description: 'Актуальные цены на топливо Neste в Латвии: 95, 98, дизель и Про дизель. Обновление каждый час, доступна история цен.',
      h1: 'Цены на топливо Neste в Латвии сегодня',
      intro: 'Сравните цены на топливо сети Neste по всей Латвии — 95, 98, дизель и Про дизель — с обновлением каждый час и историей изменений цен.',
    },
    en: {
      title: 'Neste Fuel Prices in Latvia Today | cenometrs.lv',
      description: 'Current Neste fuel prices in Latvia: petrol 95, 98, diesel and Pro Diesel. Updated hourly, with full price history.',
      h1: 'Neste Fuel Prices in Latvia Today',
      intro: 'Compare Neste fuel prices across Latvia — petrol 95, 98, diesel and Pro Diesel — updated hourly, with historical trends.',
    },
  },
  'circle-k': {
    lv: {
      title: 'Circle K degvielas cenas Latvijā šodien | cenometrs.lv',
      description: 'Šodienas Circle K degvielas cenas Latvijā: 95, 98, dīzelis, Dmiles+ un autogāze. Cenas atjauninātas katru stundu.',
      h1: 'Circle K degvielas cenas Latvijā šodien',
      intro: 'Salīdzini Circle K degvielas cenas visā Latvijā — 95, 98, dīzelis, Dmiles+ un autogāze — ar cenu vēsturi un dinamiku.',
    },
    ru: {
      title: 'Цены на топливо Circle K в Латвии сегодня | cenometrs.lv',
      description: 'Актуальные цены на топливо Circle K в Латвии: 95, 98, дизель, Dmiles+ и автогаз. Обновление каждый час.',
      h1: 'Цены на топливо Circle K в Латвии сегодня',
      intro: 'Сравните цены на топливо сети Circle K по всей Латвии — 95, 98, дизель, Dmiles+ и автогаз — с историей изменений цен.',
    },
    en: {
      title: 'Circle K Fuel Prices in Latvia Today | cenometrs.lv',
      description: 'Current Circle K fuel prices in Latvia: petrol 95, 98, diesel, Dmiles+ and LPG. Updated hourly.',
      h1: 'Circle K Fuel Prices in Latvia Today',
      intro: 'Compare Circle K fuel prices across Latvia — petrol 95, 98, diesel, Dmiles+ and LPG — with historical trends.',
    },
  },
  virsi: {
    lv: {
      title: 'Virši degvielas cenas Latvijā šodien | cenometrs.lv',
      description: 'Šodienas Virši degvielas cenas Latvijā: 95, 98, dīzelis un autogāze. Cenas atjauninātas katru stundu.',
      h1: 'Virši degvielas cenas Latvijā šodien',
      intro: 'Salīdzini Virši degvielas cenas visā Latvijā — 95, 98, dīzelis un autogāze — ar cenu vēsturi un dinamiku.',
    },
    ru: {
      title: 'Цены на топливо Virši в Латвии сегодня | cenometrs.lv',
      description: 'Актуальные цены на топливо Virši в Латвии: 95, 98, дизель и автогаз. Обновление каждый час.',
      h1: 'Цены на топливо Virši в Латвии сегодня',
      intro: 'Сравните цены на топливо сети Virši по всей Латвии — 95, 98, дизель и автогаз — с историей изменений цен.',
    },
    en: {
      title: 'Virši Fuel Prices in Latvia Today | cenometrs.lv',
      description: 'Current Virši fuel prices in Latvia: petrol 95, 98, diesel and LPG. Updated hourly.',
      h1: 'Virši Fuel Prices in Latvia Today',
      intro: 'Compare Virši fuel prices across Latvia — petrol 95, 98, diesel and LPG — with historical trends.',
    },
  },
  viada: {
    lv: {
      title: 'Viada degvielas cenas Latvijā šodien | cenometrs.lv',
      description: 'Šodienas Viada degvielas cenas Latvijā: 95, 98, dīzelis, D+ un autogāze. Cenas atjauninātas katru stundu.',
      h1: 'Viada degvielas cenas Latvijā šodien',
      intro: 'Salīdzini Viada degvielas cenas visā Latvijā — 95, 98, dīzelis, D+ un autogāze — ar cenu vēsturi un dinamiku.',
    },
    ru: {
      title: 'Цены на топливо Viada в Латвии сегодня | cenometrs.lv',
      description: 'Актуальные цены на топливо Viada в Латвии: 95, 98, дизель, D+ и автогаз. Обновление каждый час.',
      h1: 'Цены на топливо Viada в Латвии сегодня',
      intro: 'Сравните цены на топливо сети Viada по всей Латвии — 95, 98, дизель, D+ и автогаз — с историей изменений цен.',
    },
    en: {
      title: 'Viada Fuel Prices in Latvia Today | cenometrs.lv',
      description: 'Current Viada fuel prices in Latvia: petrol 95, 98, diesel, D+ and LPG. Updated hourly.',
      h1: 'Viada Fuel Prices in Latvia Today',
      intro: 'Compare Viada fuel prices across Latvia — petrol 95, 98, diesel, D+ and LPG — with historical trends.',
    },
  },
  95: {
    lv: {
      title: '95 benzīna cena Latvijā šodien | cenometrs.lv',
      description: 'Šodienas 95 benzīna cenas Neste, Circle K, Virši un Viada degvielas uzpildes stacijās Latvijā. Atjaunots katru stundu.',
      h1: '95 benzīna cena Latvijā šodien',
      intro: 'Salīdzini 95 benzīna cenas Neste, Circle K, Virši un Viada stacijās visā Latvijā — ar cenu vēsturi un dinamiku.',
    },
    ru: {
      title: 'Цена бензина 95 в Латвии сегодня | cenometrs.lv',
      description: 'Актуальные цены на бензин 95 на АЗС Neste, Circle K, Virši и Viada в Латвии. Обновление каждый час.',
      h1: 'Цена бензина 95 в Латвии сегодня',
      intro: 'Сравните цены на бензин 95 на АЗС Neste, Circle K, Virši и Viada по всей Латвии — с историей изменений цен.',
    },
    en: {
      title: 'Petrol 95 Price in Latvia Today | cenometrs.lv',
      description: 'Current 95 petrol prices at Neste, Circle K, Virši and Viada stations in Latvia. Updated hourly.',
      h1: 'Petrol 95 Price in Latvia Today',
      intro: 'Compare 95 petrol prices at Neste, Circle K, Virši and Viada stations across Latvia — with historical trends.',
    },
  },
  98: {
    lv: {
      title: '98 benzīna cena Latvijā šodien | cenometrs.lv',
      description: 'Šodienas 98 benzīna cenas Neste, Circle K, Virši un Viada degvielas uzpildes stacijās Latvijā. Atjaunots katru stundu.',
      h1: '98 benzīna cena Latvijā šodien',
      intro: 'Salīdzini 98 benzīna cenas Neste, Circle K, Virši un Viada stacijās visā Latvijā — ar cenu vēsturi un dinamiku.',
    },
    ru: {
      title: 'Цена бензина 98 в Латвии сегодня | cenometrs.lv',
      description: 'Актуальные цены на бензин 98 на АЗС Neste, Circle K, Virši и Viada в Латвии. Обновление каждый час.',
      h1: 'Цена бензина 98 в Латвии сегодня',
      intro: 'Сравните цены на бензин 98 на АЗС Neste, Circle K, Virši и Viada по всей Латвии — с историей изменений цен.',
    },
    en: {
      title: 'Petrol 98 Price in Latvia Today | cenometrs.lv',
      description: 'Current 98 petrol prices at Neste, Circle K, Virši and Viada stations in Latvia. Updated hourly.',
      h1: 'Petrol 98 Price in Latvia Today',
      intro: 'Compare 98 petrol prices at Neste, Circle K, Virši and Viada stations across Latvia — with historical trends.',
    },
  },
  diesel: {
    lv: {
      title: 'Dīzeļa cena Latvijā šodien | cenometrs.lv',
      description: 'Šodienas dīzeļdegvielas cenas Neste, Circle K, Virši un Viada stacijās Latvijā. Atjaunots katru stundu.',
      h1: 'Dīzeļa cena Latvijā šodien',
      intro: 'Salīdzini dīzeļdegvielas cenas Neste, Circle K, Virši un Viada stacijās visā Latvijā — ar cenu vēsturi un dinamiku.',
    },
    ru: {
      title: 'Цена дизеля в Латвии сегодня | cenometrs.lv',
      description: 'Актуальные цены на дизельное топливо на АЗС Neste, Circle K, Virši и Viada в Латвии. Обновление каждый час.',
      h1: 'Цена дизеля в Латвии сегодня',
      intro: 'Сравните цены на дизельное топливо на АЗС Neste, Circle K, Virši и Viada по всей Латвии — с историей изменений цен.',
    },
    en: {
      title: 'Diesel Price in Latvia Today | cenometrs.lv',
      description: 'Current diesel fuel prices at Neste, Circle K, Virši and Viada stations in Latvia. Updated hourly.',
      h1: 'Diesel Price in Latvia Today',
      intro: 'Compare diesel prices at Neste, Circle K, Virši and Viada stations across Latvia — with historical trends.',
    },
  },
  pro: {
    lv: {
      title: 'Pro dīzeļa (D+) cena Latvijā šodien | cenometrs.lv',
      description: 'Šodienas prēmijas dīzeļa (D+) cenas Neste, Circle K un Viada stacijās Latvijā. Atjaunots katru stundu.',
      h1: 'Pro dīzeļa (D+) cena Latvijā šodien',
      intro: 'Salīdzini prēmijas dīzeļdegvielas (D+) cenas Neste, Circle K un Viada stacijās visā Latvijā — ar cenu vēsturi un dinamiku.',
    },
    ru: {
      title: 'Цена дизеля Pro (D+) в Латвии сегодня | cenometrs.lv',
      description: 'Актуальные цены на премиальный дизель (D+) на АЗС Neste, Circle K и Viada в Латвии. Обновление каждый час.',
      h1: 'Цена дизеля Pro (D+) в Латвии сегодня',
      intro: 'Сравните цены на премиальный дизель (D+) на АЗС Neste, Circle K и Viada по всей Латвии — с историей изменений цен.',
    },
    en: {
      title: 'Pro Diesel (D+) Price in Latvia Today | cenometrs.lv',
      description: 'Current premium diesel (D+) prices at Neste, Circle K and Viada stations in Latvia. Updated hourly.',
      h1: 'Pro Diesel (D+) Price in Latvia Today',
      intro: 'Compare premium diesel (D+) prices at Neste, Circle K and Viada stations across Latvia — with historical trends.',
    },
  },
  gas: {
    lv: {
      title: 'Autogāzes (LPG) cena Latvijā šodien | cenometrs.lv',
      description: 'Šodienas autogāzes (LPG) cenas Circle K, Virši un Viada stacijās Latvijā. Atjaunots katru stundu.',
      h1: 'Autogāzes (LPG) cena Latvijā šodien',
      intro: 'Salīdzini autogāzes (LPG) cenas Circle K, Virši un Viada stacijās visā Latvijā — ar cenu vēsturi un dinamiku.',
    },
    ru: {
      title: 'Цена автогаза (LPG) в Латвии сегодня | cenometrs.lv',
      description: 'Актуальные цены на автогаз (LPG) на АЗС Circle K, Virši и Viada в Латвии. Обновление каждый час.',
      h1: 'Цена автогаза (LPG) в Латвии сегодня',
      intro: 'Сравните цены на автогаз (LPG) на АЗС Circle K, Virši и Viada по всей Латвии — с историей изменений цен.',
    },
    en: {
      title: 'LPG (Autogas) Price in Latvia Today | cenometrs.lv',
      description: 'Current LPG / autogas prices at Circle K, Virši and Viada stations in Latvia. Updated hourly.',
      h1: 'LPG (Autogas) Price in Latvia Today',
      intro: 'Compare LPG / autogas prices at Circle K, Virši and Viada stations across Latvia — with historical trends.',
    },
  },
};

// Find the page descriptor for a path's slug segment (the one after /<lang>/),
// or null when the path is a plain language home or doesn't match a known page.
export const pageFromPath = (pathname = window.location.pathname) => {
  const slug = pathname.split('/').filter(Boolean)[1];
  return PAGES.find((p) => p.slug === slug) || null;
};
