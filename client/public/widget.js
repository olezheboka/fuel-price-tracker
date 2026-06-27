/* cenometrs.lv — embeddable fuel-price widget.
 *
 * Embed on any site with:
 *   <div class="cenometrs-widget" data-lang="lv" data-size="medium"></div>
 *   <script async src="https://www.cenometrs.lv/widget.js"></script>
 *
 * Attributes (all optional):
 *   data-lang   lv | ru | en              (default lv)
 *   data-size   small | medium | large    (default medium) — iOS-style tiles:
 *                 small  = one featured fuel price (square)
 *                 medium = wide grid of fuel prices
 *                 large  = full per-fuel list
 *   data-theme  light | dark              (default light)
 *   data-fuels  csv subset, e.g. "diesel,95" (default all)
 *
 *   Legacy data-layout (card|strip|compact) is still accepted and mapped to
 *   large|medium|small for backward-compat with older embeds.
 *
 * Renders the cheapest current price per fuel and links back to cenometrs.lv.
 * The whole tile is one click target. Vanilla, dependency-free, self-contained.
 * Talks only to cenometrs.lv, so the API origin is hardcoded (the widget runs
 * on third-party domains).
 */
(function () {
  'use strict';

  var ORIGIN = 'https://www.cenometrs.lv';
  var CACHE_KEY = 'cenometrs_widget_v1';
  var CACHE_TTL = 5 * 60 * 1000; // 5 min — data changes every ~30 min; be polite to the API.

  // Full fuel names per language (no abbreviations) — mirrors the main app's
  // i18n.js fuel-name translations (client/src/i18n.js: 'Futura D', 'Pro Diesel').
  var I18N = {
    lv: { title: 'Lētākā degviela šodien', gas: 'Gāze', fuelNames: { '95': '95', '98': '98', diesel: 'Dīzelis', pro: 'Pro dīzelis' } },
    ru: { title: 'Дешёвое топливо сегодня', gas: 'Газ', fuelNames: { '95': '95', '98': '98', diesel: 'Дизель', pro: 'Про дизель' } },
    en: { title: 'Cheapest fuel today', gas: 'LPG', fuelNames: { '95': '95', '98': '98', diesel: 'Diesel', pro: 'Pro Diesel' } },
  };
  // Small tile features one fuel; prefer the everyday fuels (Diesel, then 95)
  // over the per-liter-cheapest, which is usually LPG.
  var FEATURE_PREF = ['diesel', '95', '98', 'pro', 'gas'];

  function attr(el, name, fallback) {
    var v = (el.getAttribute('data-' + name) || '').toLowerCase().trim();
    return v || fallback;
  }
  function langOf(el) { var l = attr(el, 'lang', 'lv'); return I18N[l] ? l : 'lv'; }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function theme(el) {
    return attr(el, 'theme', 'light') === 'dark'
      ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', muted: '#94a3b8', border: '#334155', accent: '#44D62C' }
      : { bg: '#ffffff', card: '#f8fafc', text: '#0f172a', muted: '#64748b', border: '#e2e8f0', accent: '#16a34a' };
  }

  function fuelsOf(el, data) {
    var only = (el.getAttribute('data-fuels') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var fuels = (data && data.fuels) || [];
    return only.length ? fuels.filter(function (f) { return only.indexOf(f.id) !== -1; }) : fuels;
  }

  function codeOf(f, t) { return t.fuelNames[f.id] || t.gas; }

  // Pick the single fuel the Small tile features.
  function featured(fuels) {
    if (fuels.length <= 1) return fuels[0];
    for (var i = 0; i < FEATURE_PREF.length; i++) {
      for (var j = 0; j < fuels.length; j++) {
        if (fuels[j].id === FEATURE_PREF[i]) return fuels[j];
      }
    }
    return fuels[0];
  }

  var FONT = 'ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif';

  // Subtle "cenometrs.lv" branding shown on every tile (#9). Doubles as the CTA.
  function brand(c, arrow) {
    return '<span style="font:600 11px/1 ' + FONT + ';color:' + c.muted + ';letter-spacing:.01em;">cenometrs.lv' +
      (arrow ? ' <span style="color:' + c.accent + ';">→</span>' : '') + '</span>';
  }

  // Price with a subtle per-liter unit (" €/l"); `unitPx` sizes the muted suffix.
  function priceHtml(f, c, unitPx) {
    return f.price.toFixed(3) +
      '<span style="font:700 ' + unitPx + 'px/1 ' + FONT + ';color:' + c.muted + ';"> €/l</span>';
  }

  // Measure real text width via Canvas so "does this address fit" is exact,
  // not a character-count guess — addresses vary wildly in length (10 to 30+
  // chars) and a guess either truncates real ones or wastes space being too
  // conservative. Falls back to "always fits" if Canvas is unavailable.
  var measureCtx;
  function textWidth(str, font) {
    try {
      if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
      measureCtx.font = font;
      return measureCtx.measureText(str).width;
    } catch { return 0; }
  }

  // Pick up to `k` addresses that measure within `maxWidth` at `font`, shortest
  // first — never returns one that would have to be truncated. A fuel with no
  // address short enough to fit (or no address at all, e.g. a discounted Neste
  // row that only carries a marker) simply shows none.
  function fittingAddresses(list, font, maxWidth, k) {
    var out = [];
    list.slice().sort(function (a, b) { return a.length - b.length; }).some(function (a) {
      if (textWidth(a, font) <= maxWidth) out.push(a);
      return out.length >= k;
    });
    return out;
  }

  // Render a pre-picked list of address lines, left-aligned flush with the row
  // above (no indent guessing — that's what caused Large's misalignment).
  function addrLines(list, c, px) {
    return list.map(function (a) {
      return '<div style="font:500 ' + px + 'px/1.3 ' + FONT + ';color:' + c.muted + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(a) + '</div>';
    }).join('');
  }

  // Max addresses to *attempt* per fuel — more when fewer fuels share the tile.
  // fittingAddresses() then trims this down to what actually fits.
  function addrCount(size, n) {
    if (size === 'small') return 3;
    if (size === 'large') return n <= 1 ? 5 : n === 2 ? 3 : n === 3 ? 2 : 1;
    return n <= 1 ? 3 : n === 2 ? 2 : 1;       // medium
  }

  function fetchPrices() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        var ca = JSON.parse(raw);
        if (ca && ca.t && Date.now() - ca.t < CACHE_TTL && ca.d) return Promise.resolve(ca.d);
      }
    } catch { /* storage may be unavailable */ }

    return fetch(ORIGIN + '/api/widget/prices', { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: d })); } catch { /* ignore */ }
        return d;
      })
      .catch(function () { return null; });
  }

  // --- Layouts (iOS-style tiles) ----------------------------------------------

  var TILE = 'box-sizing:border-box;max-width:100%;text-decoration:none;font-family:' + FONT + ';';

  function renderSmall(el, c, fuels, t, href) {
    var f = featured(fuels);
    if (!f) return;
    var addrFont = '500 11px ' + FONT;
    var addrs = fittingAddresses(f.addresses || [], addrFont, 140 /* 172 tile - 16px*2 padding */, addrCount('small', 1));
    el.innerHTML =
      '<a href="' + href + '" target="_blank" rel="noopener" style="' + TILE +
        'display:flex;flex-direction:column;width:172px;height:172px;padding:16px;border:1px solid ' + c.border + ';border-radius:22px;background:' + c.bg + ';">' +
        '<span style="font:600 11px/1.3 ' + FONT + ';color:' + c.muted + ';">' + esc(t.title) + '</span>' +
        '<div style="flex:1;display:flex;flex-direction:column;justify-content:center;">' +
          '<span style="font:800 32px/1 ' + FONT + ';font-variant-numeric:tabular-nums;letter-spacing:-.02em;color:' + c.text + ';">' +
            priceHtml(f, c, 17) + '</span>' +
          '<span style="margin-top:7px;font:700 12px/1 ' + FONT + ';color:' + c.text + ';">' + esc(codeOf(f, t)) +
            ' <span style="font-weight:500;color:' + c.muted + ';">· ' + esc(f.stationLabel) + '</span></span>' +
          addrLines(addrs, c, 11) +
        '</div>' +
        brand(c, true) +
      '</a>';
  }

  function renderMedium(el, c, fuels, t, href) {
    var k = addrCount('medium', fuels.length);
    var addrFont = '500 10px ' + FONT;
    var addrMaxWidth = 110; // 132 nominal cell width - 11px*2 padding
    var cells = fuels.map(function (f) {
      var addrs = fittingAddresses(f.addresses || [], addrFont, addrMaxWidth, k);
      return '<div style="flex:1 1 132px;min-width:128px;display:flex;flex-direction:column;gap:2px;padding:9px 11px;border-radius:13px;background:' + c.card + ';">' +
        '<span style="font:700 11px/1 ' + FONT + ';color:' + c.muted + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(codeOf(f, t)) + ' · ' + esc(f.stationLabel) + '</span>' +
        '<span style="font:800 16px/1 ' + FONT + ';font-variant-numeric:tabular-nums;color:' + c.text + ';">' + priceHtml(f, c, 11) + '</span>' +
        addrLines(addrs, c, 10) +
      '</div>';
    }).join('');
    el.innerHTML =
      '<a href="' + href + '" target="_blank" rel="noopener" style="' + TILE +
        'display:flex;flex-direction:column;gap:11px;width:360px;padding:16px 18px;border:1px solid ' + c.border + ';border-radius:22px;background:' + c.bg + ';">' +
        '<span style="font:800 15px/1.2 ' + FONT + ';color:' + c.text + ';">' + esc(t.title) + '</span>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;">' + cells + '</div>' +
        '<div style="display:flex;align-items:center;justify-content:flex-end;">' + brand(c, true) + '</div>' +
      '</a>';
  }

  function renderLarge(el, c, fuels, t, href) {
    var k = addrCount('large', fuels.length);
    var addrFont = '500 12px ' + FONT;
    var addrMaxWidth = 302; // 360 tile - 18px*2 tile padding - 11px*2 row padding
    // Row 1 mirrors Medium/Small's "code · station" treatment (grey, bold) so
    // all three sizes read consistently, with price on the right. Row 2+ is
    // just the addresses, flush-left — station already lives in row 1, so no
    // repeated brand text and nothing to keep aligned with an indent guess.
    var rows = fuels.map(function (f) {
      var addrs = fittingAddresses(f.addresses || [], addrFont, addrMaxWidth, k);
      return '<div style="display:flex;flex-direction:column;gap:2px;padding:8px 11px;border-radius:13px;background:' + c.card + ';">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<span style="flex:1;font:700 13px/1.2 ' + FONT + ';color:' + c.muted + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(codeOf(f, t)) + ' · ' + esc(f.stationLabel) + '</span>' +
          '<span style="font:800 15px/1 ' + FONT + ';font-variant-numeric:tabular-nums;color:' + c.text + ';">' + priceHtml(f, c, 11) + '</span>' +
        '</div>' +
        addrLines(addrs, c, 12) +
      '</div>';
    }).join('');
    el.innerHTML =
      '<a href="' + href + '" target="_blank" rel="noopener" style="' + TILE +
        'display:flex;flex-direction:column;gap:12px;width:360px;padding:18px;border:1px solid ' + c.border + ';border-radius:22px;background:' + c.bg + ';">' +
        '<span style="font:800 16px/1.2 ' + FONT + ';color:' + c.text + ';">' + esc(t.title) + '</span>' +
        '<div style="display:flex;flex-direction:column;gap:6px;">' + rows + '</div>' +
        '<div style="display:flex;align-items:center;justify-content:flex-end;">' + brand(c, true) + '</div>' +
      '</a>';
  }

  var LAYOUTS = { small: renderSmall, medium: renderMedium, large: renderLarge };
  var LEGACY = { compact: 'small', strip: 'medium', card: 'large' };

  function sizeOf(el) {
    var s = attr(el, 'size', '');
    if (LAYOUTS[s]) return s;
    var legacy = LEGACY[attr(el, 'layout', '')];
    return legacy || 'medium';
  }

  // Deep-link into the app pre-filtered to the fuels the tile actually shows, so
  // clicking lands on the same view. Mirrors the app's `fuels` CSV param, which
  // is omitted when all five groups are selected.
  function hrefFor(lang, ids) {
    var base = ORIGIN + '/' + lang + '/';
    return (ids.length && ids.length < 5) ? base + '?fuels=' + ids.join(',') : base;
  }

  function render(el, data, lang) {
    var fuels = fuelsOf(el, data);
    if (!fuels.length) { return; }
    var size = sizeOf(el);
    // Small shows one featured fuel; the others show the whole filtered set.
    var ids = size === 'small'
      ? (featured(fuels) ? [featured(fuels).id] : [])
      : fuels.map(function (f) { return f.id; });
    LAYOUTS[size](el, theme(el), fuels, I18N[lang], hrefFor(lang, ids));
  }

  function init() {
    var els = document.querySelectorAll('.cenometrs-widget');
    if (!els.length) return;
    fetchPrices().then(function (data) {
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (!(data && data.fuels && data.fuels.length)) continue; // keep static fallback <a> backlink
        render(el, data, langOf(el));
        el.setAttribute('data-cenometrs-done', '1');
      }
    });
  }

  // Exposed so the embed/preview page can re-render after option changes without
  // re-injecting the script. Harmless on third-party sites.
  window.cenometrsWidgetInit = init;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
