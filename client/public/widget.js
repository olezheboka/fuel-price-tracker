/* cenometrs.lv — embeddable fuel-price widget.
 *
 * Embed on any site with:
 *   <div class="cenometrs-widget" data-lang="lv" data-layout="card" data-size="md"></div>
 *   <script async src="https://www.cenometrs.lv/widget.js"></script>
 *
 * Attributes (all optional):
 *   data-lang   lv | ru | en           (default lv)
 *   data-layout card | strip | compact (default card)
 *   data-size   sm | md | lg           (default md)
 *   data-theme  light | dark           (default light)
 *   data-fuels  csv subset, e.g. "diesel,95" (default all)
 *
 * Renders the cheapest current price per fuel and links back to cenometrs.lv.
 * Vanilla, dependency-free, self-contained. Talks only to cenometrs.lv, so the
 * API origin is hardcoded (the widget runs on third-party domains).
 */
(function () {
  'use strict';

  var ORIGIN = 'https://www.cenometrs.lv';
  var CACHE_KEY = 'cenometrs_widget_v1';
  var CACHE_TTL = 5 * 60 * 1000; // 5 min — data changes hourly; be polite to the API.

  var I18N = {
    lv: { title: 'Degvielas cenas Latvijā', cta: 'Visas cenas', updated: 'Atjaunots', gas: 'Gāze', fuel: 'Degviela', from: 'no' },
    ru: { title: 'Цены на топливо в Латвии', cta: 'Все цены', updated: 'Обновлено', gas: 'Газ', fuel: 'Топливо', from: 'от' },
    en: { title: 'Fuel prices in Latvia', cta: 'All prices', updated: 'Updated', gas: 'LPG', fuel: 'Fuel', from: 'from' },
  };
  var FUEL_CODE = { '95': '95', '98': '98', diesel: 'D', pro: 'D+' };
  var SCALE = { sm: 0.86, md: 1, lg: 1.18 };

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

  function codeOf(f, t) { return FUEL_CODE[f.id] || t.gas; }

  function fmtUpdated(data, t) {
    if (!data || !data.updated) return '';
    try {
      var d = new Date(data.updated), p = function (n) { return ('0' + n).slice(-2); };
      return t.updated + ' ' + p(d.getDate()) + '.' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    } catch { return ''; }
  }

  var FONT = 'ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif';

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

  // --- Layouts ----------------------------------------------------------------

  function renderCard(el, data, lang, c, s, fuels, t, href) {
    var px = function (n) { return Math.round(n * s); };
    var rows = fuels.map(function (f) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:' + px(7) + 'px ' + px(10) + 'px;border-radius:10px;background:' + c.card + ';">' +
        '<span style="font:700 ' + px(12) + 'px/1 ' + FONT + ';min-width:' + px(30) + 'px;color:' + c.text + ';">' + esc(codeOf(f, t)) + '</span>' +
        '<span style="flex:1;font:500 ' + px(12) + 'px/1.2 ' + FONT + ';color:' + c.muted + ';">' + esc(f.stationLabel) + '</span>' +
        '<span style="font:700 ' + px(14) + 'px/1 ' + FONT + ';font-variant-numeric:tabular-nums;color:' + c.text + ';">' + f.price.toFixed(3) + ' €</span>' +
        '</div>';
    }).join('');
    var updated = fmtUpdated(data, t);
    el.innerHTML =
      '<div style="box-sizing:border-box;width:100%;max-width:' + px(360) + 'px;padding:' + px(14) + 'px;border:1px solid ' + c.border + ';border-radius:16px;background:' + c.bg + ';font-family:' + FONT + ';">' +
        '<a href="' + href + '" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:7px;text-decoration:none;margin-bottom:' + px(10) + 'px;">' +
          '<span style="width:' + px(9) + 'px;height:' + px(9) + 'px;border-radius:50%;background:' + c.accent + ';box-shadow:0 0 8px ' + c.accent + ';"></span>' +
          '<span style="font:800 ' + px(14) + 'px/1.2 ' + FONT + ';color:' + c.text + ';">' + esc(t.title) + '</span>' +
        '</a>' +
        '<div style="display:flex;flex-direction:column;gap:5px;">' + rows + '</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:' + px(11) + 'px;">' +
          (updated ? '<span style="font:500 ' + px(10) + 'px/1 ' + FONT + ';color:' + c.muted + ';">' + esc(updated) + '</span>' : '<span></span>') +
          '<a href="' + href + '" target="_blank" rel="noopener" style="font:700 ' + px(11) + 'px/1 ' + FONT + ';color:' + c.accent + ';text-decoration:none;white-space:nowrap;">' + esc(t.cta) + ' →</a>' +
        '</div>' +
      '</div>';
  }

  function renderStrip(el, data, lang, c, s, fuels, t, href) {
    var px = function (n) { return Math.round(n * s); };
    var chips = fuels.map(function (f) {
      return '<span style="display:inline-flex;align-items:center;gap:6px;padding:' + px(6) + 'px ' + px(11) + 'px;border-radius:9999px;background:' + c.card + ';white-space:nowrap;">' +
        '<span style="font:700 ' + px(11) + 'px/1 ' + FONT + ';color:' + c.muted + ';">' + esc(codeOf(f, t)) + '</span>' +
        '<span style="font:800 ' + px(13) + 'px/1 ' + FONT + ';font-variant-numeric:tabular-nums;color:' + c.text + ';">' + f.price.toFixed(3) + ' €</span>' +
        '</span>';
    }).join('');
    el.innerHTML =
      '<div style="box-sizing:border-box;width:100%;max-width:' + px(720) + 'px;display:flex;flex-wrap:wrap;align-items:center;gap:' + px(8) + 'px ' + px(12) + 'px;padding:' + px(10) + 'px ' + px(14) + 'px;border:1px solid ' + c.border + ';border-radius:14px;background:' + c.bg + ';font-family:' + FONT + ';">' +
        '<a href="' + href + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:7px;text-decoration:none;margin-right:auto;">' +
          '<span style="width:' + px(8) + 'px;height:' + px(8) + 'px;border-radius:50%;background:' + c.accent + ';box-shadow:0 0 8px ' + c.accent + ';"></span>' +
          '<span style="font:800 ' + px(13) + 'px/1.2 ' + FONT + ';color:' + c.text + ';">' + esc(t.title) + '</span>' +
        '</a>' +
        chips +
        '<a href="' + href + '" target="_blank" rel="noopener" style="font:700 ' + px(11) + 'px/1 ' + FONT + ';color:' + c.accent + ';text-decoration:none;white-space:nowrap;">' + esc(t.cta) + ' →</a>' +
      '</div>';
  }

  function renderCompact(el, data, lang, c, s, fuels, t, href) {
    var px = function (n) { return Math.round(n * s); };
    var cheapest = fuels.reduce(function (m, f) { return (!m || f.price < m.price) ? f : m; }, null);
    if (!cheapest) { return; }
    var label = fuels.length === 1
      ? esc(codeOf(cheapest, t)) + ' ' + cheapest.price.toFixed(3) + ' €'
      : esc(t.fuel) + ' ' + esc(t.from) + ' ' + cheapest.price.toFixed(3) + ' €';
    el.innerHTML =
      '<a href="' + href + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:' + px(7) + 'px;padding:' + px(7) + 'px ' + px(13) + 'px;border:1px solid ' + c.border + ';border-radius:9999px;background:' + c.bg + ';text-decoration:none;font-family:' + FONT + ';">' +
        '<span style="width:' + px(8) + 'px;height:' + px(8) + 'px;border-radius:50%;background:' + c.accent + ';box-shadow:0 0 8px ' + c.accent + ';"></span>' +
        '<span style="font:700 ' + px(13) + 'px/1 ' + FONT + ';color:' + c.text + ';font-variant-numeric:tabular-nums;">' + label + '</span>' +
        '<span style="font:700 ' + px(13) + 'px/1 ' + FONT + ';color:' + c.accent + ';">→</span>' +
      '</a>';
  }

  var LAYOUTS = { card: renderCard, strip: renderStrip, compact: renderCompact };

  function render(el, data, lang) {
    var fuels = fuelsOf(el, data);
    if (!fuels.length) { return; }
    var layout = LAYOUTS[attr(el, 'layout', 'card')] || renderCard;
    var s = SCALE[attr(el, 'size', 'md')] || 1;
    layout(el, data, lang, theme(el), s, fuels, I18N[lang], ORIGIN + '/' + lang + '/');
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
