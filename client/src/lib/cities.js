// Client-side city derivation for the global city filter.
//
// The scrapers store one row per (chain × fuel × timestamp): `price` is the
// chain's cheapest and `location` is a pipe-joined list of the addresses where
// that price applies. There is NO per-city price — the city filter is a
// "where is this price available" coverage filter, derived here from the
// address text already shipped to the client (no scraper/DB/API change).
//
// Neste/Circle K addresses are street-only ("A.Deglava 51a") and are all Rīga;
// Viada/Virši embed the city ("Zemnieku iela 58, Liepāja"). So: parse the token
// after the last comma, match it against the known-city dictionary, and fall
// back to Rīga when nothing is recognized — which is correct for the street-only
// chains.

// Normalize for matching: lowercase + strip diacritics so "Liepāja" / "liepaja"
// / "Liepaja" all collapse to the same key.
const normalize = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();

export const DEFAULT_CITY = 'Rīga';

// normalized name -> canonical Latvian display name. The ~20 largest LV towns
// the chains actually list; extend freely (matching is diacritics-insensitive).
const CITY_LIST = [
  'Rīga', 'Daugavpils', 'Liepāja', 'Jelgava', 'Jūrmala', 'Ventspils', 'Rēzekne',
  'Valmiera', 'Jēkabpils', 'Ogre', 'Tukums', 'Sigulda', 'Cēsis', 'Salaspils',
  'Kuldīga', 'Saldus', 'Bauska', 'Olaine', 'Ādaži', 'Mārupe', 'Talsi', 'Dobele',
  'Gulbene', 'Madona', 'Aizkraukle', 'Limbaži', 'Krāslava', 'Preiļi',
];
export const CITY_DICTIONARY = CITY_LIST.reduce((m, name) => {
  m[normalize(name)] = name;
  return m;
}, {});
// The known-city universe (used as the default "all" set for the filter).
export const ALL_CITY_IDS = CITY_LIST;

// URL slug for a city: ASCII, diacritics-stripped, lowercase ("Rīga" -> "riga",
// "Liepāja" -> "liepaja"). Used in the ?cities= param and the /<lang>/<slug>/
// city landing pages so URLs stay clean instead of percent-encoded ("Liep%C4%81ja").
export const citySlug = (name) => normalize(name);

// Reverse of citySlug: an ASCII slug back to its canonical Latvian name, or null
// for an unknown slug (so a hand-edited URL can't inject a bogus city).
export const cityFromSlug = (slug) => CITY_DICTIONARY[normalize(slug)] || null;

// City name in the case required by the "fuel prices in <city>" footer phrasing
// per language — LV locative (Rīgā), RU prepositional (Риге), EN nominative.
// Only the published city-page cities need entries; cityInflected() falls back to
// the canonical name for anything missing. (The filter dropdown uses the plain
// canonical name; only this sentence-form anchor text needs inflection.)
export const CITY_LOCALIZED = {
  'Rīga':    { lv: 'Rīgā',    ru: 'Риге',   en: 'Rīga' },
  'Liepāja': { lv: 'Liepājā', ru: 'Лиепае', en: 'Liepāja' },
};
export const cityInflected = (name, lang) => CITY_LOCALIZED[name]?.[lang] || name;

// Canonical city for a single address chip: the token after the last comma,
// matched against the dictionary; DEFAULT_CITY when unrecognized/street-only.
export const cityOfAddress = (addr) => {
  if (!addr) return DEFAULT_CITY;
  const parts = String(addr).split(',');
  const last = parts[parts.length - 1];
  return CITY_DICTIONARY[normalize(last)] || DEFAULT_CITY;
};

// The set of cities a price row covers. Empty location and the Neste discount
// marker ("same price everywhere") collapse to Rīga — those pages are Rīga-only.
export const citiesOf = (rec, isMarker = false) => {
  const loc = rec && rec.location;
  if (isMarker || !loc || !loc.trim()) return new Set([DEFAULT_CITY]);
  const cities = new Set();
  loc.split('|').forEach((chip) => {
    const c = chip.trim();
    if (c) cities.add(cityOfAddress(c));
  });
  return cities.size ? cities : new Set([DEFAULT_CITY]);
};

// True when two sets share at least one member.
export const setsIntersect = (a, b) => {
  for (const v of a) if (b.has(v)) return true;
  return false;
};
