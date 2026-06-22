// Single source of truth for per-language SEO metadata, consumed at build time by
// scripts/prerender.mjs to stamp each language document (/lv/, /ru/, /en/) with a
// localized <title>, meta description, <html lang>, self-canonical and reciprocal
// hreflang. Plain ESM so the Node prerender step can import it directly.

export const SITE_ORIGIN = 'https://cenometrs.lv';

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
