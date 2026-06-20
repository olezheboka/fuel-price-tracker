import React, { useState, useEffect, useMemo, useCallback, useDeferredValue, lazy, Suspense } from 'react';
import "react-day-picker/src/style.css";
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea, LabelList, ErrorBar } from 'recharts';
import { useTranslation } from 'react-i18next';
// framer-motion removed
import { Calendar, RefreshCw, MapPin, Info, X, TrendingUp, TrendingDown, Minus, BarChart3, ChevronDown, ChevronUp, Copy, Check, Calculator, History, ChartSpline, Diff, Grid3X3, CircleGauge, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
const PriceChangeCards = lazy(() => import('./InsightsPanel'));
import { DateRangePicker } from './components/ui/DatePicker';
import MultiSelect from './components/ui/MultiSelect';
import ErrorBoundary from './ErrorBoundary';

const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:3000/api';
if (!import.meta.env.PROD) console.log('[DEBUG] API_BASE:', API_BASE);

const FUEL_COLORS = {
  'Neste Futura 95': '#22c55e', // green-500
  'Neste Futura 98': '#06b6d4', // cyan-500
  'Neste Futura D': '#111827',  // gray-900 (black)
  'Neste Pro Diesel': '#EAB308' // yellow-500
};

const DISCOUNT_COLOR = '#44D62C'; // Vibrant Pantone Green for discounts

// Matches all known discount marker phrasings: the prices-page text
// (e.g. "Visās stacijās cenas vienādas", "visās degvielas uzpildes stacijās
// cena vienāda", "Visās degvielas uzpildes stacijās") and the homepage-banner
// marker injected by server/scraper.js (contains "samazināta cena").
const DISCOUNT_MARKER_RE = /vis[āa]s[\s\S]*stacij[āa]s|samazin[āa]ta\s+cena/i;

// Matches ONLY the server-injected marker from scraper.js (homepage / Instagram
// / FORCE_DISCOUNT_TODAY override). The prices-page static text never uses
// "samazināta cena". When present, this is authoritative — bypass the
// heuristic price-drop gate, since external confirmation is independent of
// how many cents the price actually moved (e.g. a 3¢/L Privātkarte discount).
const EXTERNAL_DISCOUNT_RE = /samazin[āa]ta\s+cena/i;

const lngs = {
  lv: { nativeName: 'Latviešu', flag: '🇱🇻' },
  ru: { nativeName: 'Русский', flag: '🇷🇺' },
  en: { nativeName: 'English', flag: '🇬🇧' }
};

// --- Multi-station config -------------------------------------------------
// Station brand metadata. Key = the `source` value returned by the API.
const STATIONS = {
  Neste:   { label: 'Neste',    color: '#003C96' },
  CircleK: { label: 'Circle K', color: '#DA281C' },
  Virsi:   { label: 'Virši',    color: '#7C3AED' },
  Viada:   { label: 'Viada',    color: '#E08A00' },
};
const STATION_ORDER = ['Neste', 'CircleK', 'Virsi', 'Viada'];

// Which fuel groups each station sells. Neste has no gas/LPG; Virši has no
// premium diesel ('pro'). The rest sell all five groups.
const STATION_FUEL_SUPPORT = {
  Neste:   new Set(['95', '98', 'diesel', 'pro']),
  CircleK: new Set(['95', '98', 'diesel', 'pro', 'gas']),
  Virsi:   new Set(['95', '98', 'diesel', 'gas']),
  Viada:   new Set(['95', '98', 'diesel', 'pro', 'gas']),
};

// Canonical fuel groups. `id` matches the canonical fuel ids and the `type` value
// new stations store; colors mirror FUEL_COLORS; labelKey reuses existing i18n keys.
const FUEL_GROUPS = [
  { id: '95',     color: '#22c55e', labelKey: 'Futura 95' },
  { id: '98',     color: '#06b6d4', labelKey: 'Futura 98' },
  { id: 'diesel', color: '#111827', labelKey: 'Futura D' },
  { id: 'pro',    color: '#EAB308', labelKey: 'Pro Diesel' },
  { id: 'gas',    color: '#8b5cf6', labelKey: 'Gas' },
];
const FUEL_GROUP_IDS = FUEL_GROUPS.map((g) => g.id);

// Map a price record to its canonical fuel-group id. Neste rows carry full names
// ("Neste Futura 95"); new stations already store the canonical id ("95").
const NESTE_TYPE_TO_GROUP = {
  'Neste Futura 95': '95',
  'Neste Futura 98': '98',
  'Neste Futura D': 'diesel',
  'Neste Pro Diesel': 'pro',
};
const fuelGroupId = (rec) => NESTE_TYPE_TO_GROUP[rec.type] || rec.type;
const stationKey = (rec) => rec.source || 'Neste';

// Single accent used to mark the cheapest station in every fuel group. Green is
// the universal "best price / savings" signal — kept consistent across all fuels
// so the meaning reads instantly regardless of the group's own color.
const CHEAPEST_COLOR = '#16a34a'; // green-600

// Translate a #rrggbb color into an rgba() string so the cheapest-station row can
// be tinted/ringed in the accent color at a chosen opacity.
const hexToRgba = (hex, alpha) => {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Read a filter Set from URL param (CSV) → localStorage → default to "all".
const initFilterSet = (paramKey, lsKey, all) => {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get(paramKey) ?? localStorage.getItem(lsKey);
    if (raw) {
      const picked = raw.split(',').map((s) => s.trim()).filter((v) => all.includes(v));
      if (picked.length) return new Set(picked);
    }
  } catch { /* SSR / parsing guard */ }
  return new Set(all);
};

// Extract Riga timezone date components without double-parsing.
// Uses Intl to read year/month/day directly — immune to DST shifts.
const getRigaDateParts = (timestamp) => {
  const utcDate = new Date(timestamp);
  const tz = 'Europe/Riga';
  const year  = parseInt(utcDate.toLocaleString('en-US', { timeZone: tz, year: 'numeric' }));
  const month = parseInt(utcDate.toLocaleString('en-US', { timeZone: tz, month: 'numeric' }));
  const day   = parseInt(utcDate.toLocaleString('en-US', { timeZone: tz, day: 'numeric' }));
  return { year, month, day };
};

// Format a timestamp as a Riga-local YYYY-MM-DD string (for the brush URL params).
const fmtRigaYmd = (ts) => {
  const { year, month, day } = getRigaDateParts(ts);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

// Apple-style Segmented Control
const SegmentedControl = ({ options, value, onChange, className, size = 'default' }) => {
  const [styles, setStyles] = useState({ left: 0, width: 0, opacity: 0 });
  const buttonsRef = React.useRef([]);

  // Depend on a stable signature of the option VALUES, not the array identity.
  // Callers build `options` inline (a fresh array every render), so keying the
  // layout effect on the array itself made it re-run on every parent re-render;
  // combined with an unconditional setStyles that produced a new object each time,
  // a parent that re-renders rapidly (e.g. on language change) drove an infinite
  // render loop that crashed to the root error boundary.
  const optionsKey = options.map(o => o.value).join('|');

  React.useLayoutEffect(() => {
    const update = () => {
      const activeIndex = options.findIndex(opt => opt.value === value);
      if (activeIndex !== -1 && buttonsRef.current[activeIndex]) {
        const btn = buttonsRef.current[activeIndex];
        const next = { left: btn.offsetLeft, width: btn.offsetWidth, opacity: 1 };
        // Bail out when geometry is unchanged so setStyles can't re-trigger the
        // effect indefinitely — this is the loop's circuit breaker.
        setStyles(prev =>
          prev.left === next.left && prev.width === next.width && prev.opacity === next.opacity
            ? prev : next
        );
      } else {
        setStyles(prev => (prev.opacity === 0 ? prev : { ...prev, opacity: 0 }));
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, optionsKey]);

  return (
    <div className={twMerge("inline-flex bg-gray-100/80 p-1 rounded-xl relative", className)}>
      <div
        className="absolute top-1 bottom-1 bg-white rounded-lg shadow-sm transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          left: styles.left,
          width: styles.width,
          opacity: styles.opacity
        }}
      />
      {options.map((opt, idx) => (
        <button
          key={opt.value}
          ref={el => buttonsRef.current[idx] = el}
          onClick={() => onChange(opt.value)}
          className={clsx(
            "relative rounded-lg transition-all duration-200 z-10 flex items-center justify-center gap-1.5 whitespace-nowrap",
            size === 'small' ? "px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold" : "px-4 py-2 text-sm font-semibold",
            value === opt.value ? "text-gray-900" : "text-gray-500 hover:text-gray-700"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};

  // Language Dropdown Component
  const LanguageDropdown = ({ lngs, currentLng, onChange, compact = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = React.useRef(null);
 
    useEffect(() => {
      const handleClickOutside = (e) => {
        if (containerRef.current && !containerRef.current.contains(e.target)) {
          setIsOpen(false);
        }
      };
      if (isOpen) document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);
 
    return (
      <div className="relative" ref={containerRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={clsx(
            "flex items-center gap-2 px-3 bg-gray-100/80 hover:bg-gray-200/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 transition-all duration-200 text-sm font-semibold text-gray-900 border border-transparent active:scale-95 shadow-sm",
            compact ? "py-1.5 rounded-lg" : "py-2 rounded-xl"
          )}
        >
          <span>{lngs[currentLng].flag}</span>
          <span className="uppercase">{currentLng}</span>
          {isOpen ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
        </button>
 
        <div
          className={clsx(
            "absolute right-0 mt-2 w-40 bg-white/95 backdrop-blur-xl border border-gray-200/50 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] z-50 overflow-hidden p-1.5 transition-all duration-200 origin-top-right",
            isOpen ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 -translate-y-2 pointer-events-none"
          )}
        >
          {Object.keys(lngs).map((lng) => {
            const isActive = currentLng === lng;
            return (
              <button
                key={lng}
                onClick={() => {
                  onChange(lng);
                  setIsOpen(false);
                }}
                className={clsx(
                  "w-full flex items-center justify-between px-3 py-2.5 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 transition-all duration-200",
                  isActive ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">{lngs[lng].flag}</span>
                  <span className="text-sm font-semibold">{lngs[lng].nativeName}</span>
                </div>
                {isActive && <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

// Clean Card Component
const Card = ({ children, className }) => (
  <div className={twMerge("bg-white rounded-2xl p-5 shadow-[0_1px_8px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03)]", className)}>
    {children}
  </div>
);

const Skeleton = ({ className }) => (
  <div className={twMerge("animate-pulse rounded-md bg-gray-200", className)} />
);

const FuelCardSkeleton = () => (
  <div className="rounded-xl p-3 sm:p-4 border-l-4 border-l-gray-200 bg-[#FCFCFD] shadow-[0_2px_6px_rgba(0,0,0,0.06)] ring-1 ring-gray-100">
    <Skeleton className="h-3 w-12 mb-1" />
    <Skeleton className="h-6 w-20 mb-1.5" />
    <Skeleton className="h-3 w-28" />
  </div>
);

const ChartLoadingOverlay = () => (
  <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[2px] rounded z-10 pointer-events-none">
    <svg className="animate-spin w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  </div>
);

const InsightsSkeleton = () => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
    {[1, 2, 3, 4].map(i => (
      <div key={i} className="p-2.5 sm:p-4 rounded-xl bg-gray-50 flex flex-col items-center gap-2">
        <Skeleton className="h-3 w-8" />
        <Skeleton className="h-5 sm:h-6 w-16" />
        <Skeleton className="h-2.5 w-12" />
      </div>
    ))}
  </div>
);

const HistoryTableSkeleton = () => (
  <div className="rounded-xl border border-slate-200 overflow-hidden">
    <div className="py-2.5 px-4 bg-slate-50 border-b border-slate-200">
      <Skeleton className="h-4 w-48 mx-auto" />
    </div>
    <div className="p-1">
      {/* Header row */}
      <div className="flex items-center py-3 px-2 sm:px-4 border-b border-gray-100">
        <Skeleton className="h-3 w-10" />
        <div className="flex-1 flex justify-end gap-4 sm:gap-8">
          <Skeleton className="h-3 w-6" />
          <Skeleton className="h-3 w-6" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-10" />
        </div>
      </div>
      {/* Data rows */}
      {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
        <div key={i} className="flex items-center py-2.5 px-2 sm:px-4 border-b border-gray-50 last:border-b-0">
          <Skeleton className="h-3.5 w-16" />
          <div className="flex-1 flex justify-end gap-4 sm:gap-8">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-14" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

// Toast Notification Component - Apple Liquid Style

const Toast = ({ notification, onDismiss, onRetry, t }) => {
  const kind = notification?.kind;

  // Dynamic dwell time, scaled to how much there is to read: a no-change ping is
  // brief, a price-change toast grows with the number of changed rows, and an
  // error lingers so the user can reach Retry. Derived from the notification, so
  // its value only changes when the notification does (keeps the timer stable).
  const dwellMs = !notification ? 0
    : kind === 'error' ? 8000
    : kind === 'nochange' ? 3000
    : Math.min(11000, 4000 + (notification.groups || []).reduce((n, g) => n + g.items.length, 0) * 650);

  // Auto-dismiss. onDismiss is an inline closure recreated on every parent
  // re-render, so depending on it here restarted the timer on each re-render
  // (e.g. when justChecked flipped, or the 15-min poll fired) — the toast then
  // outlived its own progress bar. Hold it in a ref and arm the timer once per
  // notification so it counts down uninterrupted.
  const onDismissRef = React.useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; });
  useEffect(() => {
    if (!notification) return undefined;
    const timer = setTimeout(() => onDismissRef.current(), dwellMs);
    return () => clearTimeout(timer);
  }, [notification, dwellMs]);

  // Header icon: error → warning; changed → net direction (down = cheaper = green,
  // up = pricier = red, mixed = neutral); nochange → check.
  const dir = notification?.dir;
  const isError = kind === 'error';
  const isUp = kind === 'changed' && dir === 'up';
  const isDown = kind === 'changed' && dir === 'down';
  const iconBg = isError ? 'bg-amber-50' : isUp ? 'bg-red-50' : isDown ? 'bg-green-50' : 'bg-gray-100';
  const HeaderIcon = isError ? AlertTriangle : isUp ? TrendingUp : isDown ? TrendingDown : kind === 'nochange' ? Check : Info;
  const iconColor = isError ? 'text-amber-500' : isUp ? 'text-red-500' : isDown ? 'text-green-600' : 'text-gray-500';
  // Empty when idle so the always-mounted (hidden) toast shell exposes no stale
  // title to screen readers between notifications.
  const title = !notification ? '' : isError ? t('notification.error_title') : t('notification.prices_changed');

  return (
    <div
      className={clsx(
        "fixed top-[45vh] md:top-[130px] inset-x-0 mx-auto z-[100] max-w-sm w-[calc(100%-2rem)] sm:w-[92%] transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]",
        notification ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-8 scale-90 pointer-events-none"
      )}
    >
      <div className="bg-white/95 rounded-[22px] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] overflow-hidden border border-gray-200/60">
        <div className="p-3 sm:p-4">
          <div className="flex items-start gap-2.5 sm:gap-3">
            {/* Icon */}
            <div className={`flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center ${iconBg}`}>
              <HeaderIcon size={16} className={`${iconColor} sm:w-[18px] sm:h-[18px]`} strokeWidth={2.5} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-[14px] sm:text-[15px] font-semibold text-gray-900 leading-tight">{title}</p>

              {kind === 'changed' && (
                <div className="mt-2 space-y-2 max-h-[42vh] overflow-y-auto">
                  {notification.groups.map(g => (
                    <div key={g.source}>
                      <div className="text-[12px] sm:text-[13px] font-semibold leading-tight" style={{ color: g.color }}>
                        {g.label}
                      </div>
                      <div className="mt-0.5">
                        {g.items.map(it => {
                          const grp = FUEL_GROUPS.find(f => f.id === it.fuelId);
                          const down = it.diff < 0;
                          return (
                            <div key={it.fuelId} className="flex items-center gap-2 text-[12px] sm:text-[13px] py-0.5 pl-3">
                              <span className="text-gray-700">{t(grp?.labelKey || it.fuelId)}</span>
                              <span className={clsx("ml-auto font-semibold tabular-nums", down ? "text-green-600" : "text-red-500")}>
                                {down ? '↓' : '↑'}{Math.abs(it.diff * 100).toFixed(1)}¢
                              </span>
                              <span className="text-gray-400 tabular-nums w-[52px] text-right">€{it.newPrice.toFixed(3)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {kind === 'nochange' && (
                <p className="text-[12px] sm:text-[13px] text-gray-500 mt-0.5 leading-tight">{t('notification.no_changes')}</p>
              )}

              {kind === 'error' && (
                <>
                  <p className="text-[12px] sm:text-[13px] text-gray-500 mt-0.5 leading-tight">{t('notification.error_detail')}</p>
                  {onRetry && (
                    <button
                      onClick={() => { onDismiss(); onRetry(); }}
                      className="mt-2 inline-flex items-center gap-1.5 text-[12px] sm:text-[13px] font-semibold text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 active:scale-95 transition-all"
                    >
                      <RefreshCw size={13} strokeWidth={2.5} />
                      {t('retry')}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={onDismiss}
              className="flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
            >
              <X size={12} className="text-gray-500 sm:w-[14px] sm:h-[14px]" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <div
            className={clsx("h-full bg-gray-300 ease-linear", notification ? "w-full" : "w-0")}
            style={{ transitionProperty: 'width', transitionDuration: `${dwellMs}ms` }}
          />
        </div>
      </div>
    </div>
  );
};

// Chart Legend Component
const ChartLegend = ({ selectedFuel, fuelColors, t }) => {
  const fuelsToDisplay = selectedFuel === 'all'
    ? Object.keys(fuelColors)
    : [selectedFuel];

  return (
    <div className="flex flex-wrap justify-center gap-4 mt-6 pt-4 border-t border-gray-100">
      {fuelsToDisplay.map(fuel => (
        <div key={fuel} className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: fuelColors[fuel] }}
          />
          <span className="text-xs font-medium text-gray-600">
            {t(fuel.replace('Neste ', ''))}
          </span>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <div
          className="w-4 h-0.5 border-t border-dashed"
          style={{
            borderColor: selectedFuel === 'all' ? '#9ca3af' : fuelColors[selectedFuel]
          }}
        />
        <span className="text-xs font-medium text-gray-500 italic">
          Trend
        </span>
      </div>
    </div>
  );
};

// Copy-to-clipboard helper with fallback for non-secure contexts
const copyToClipboard = (text) => {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => {
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  }
  const ta = Object.assign(document.createElement('textarea'), { value: text });
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  return Promise.resolve();
};

const AddressChip = ({ addr, url, isMarker = false }) => {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();

  const handleCopy = (e) => {
    e.preventDefault();
    e.stopPropagation();
    copyToClipboard(addr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <span className={clsx("relative inline-flex items-center gap-0.5", isMarker && "basis-full min-w-0")}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-start text-gray-500 hover:text-blue-600 transition-colors min-w-0"
      >
        <MapPin size={10} className="text-green-500 shrink-0 mr-1 mt-0.5" />
        {/* Specific addresses must not wrap mid-word (#6); the "same price
            everywhere" marker is a long sentence and must wrap to fit the card. */}
        <span className={clsx("underline underline-offset-2", isMarker ? "whitespace-normal break-words" : "whitespace-nowrap")}>{addr}</span>
      </a>
      {/* Copy makes sense for a real address, not for the marker sentence. */}
      {!isMarker && <button
        onClick={handleCopy}
        className={clsx(
          "ml-1 p-0.5 rounded transition-all",
          copied
            ? "text-green-600"
            : "text-gray-300 hover:text-gray-600 active:scale-90"
        )}
        aria-label={`Copy ${addr}`}
      >
        {copied ? <Check size={10} /> : <Copy size={10} />}
      </button>}
      <span
        className={clsx(
          "absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[9px] font-medium px-2 py-0.5 rounded-md whitespace-nowrap pointer-events-none z-10 transition-all duration-200",
          copied ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
        )}
      >
        {t('copied')}
      </span>
    </span>
  );
};

// One station's price within a fuel group: colored brand name + inline
// address list (reusing AddressChip) + price. The cheapest row is highlighted.
const StationRow = ({ rec, isCheapest }) => {
  const { t } = useTranslation();
  const st = STATIONS[stationKey(rec)] || { label: stationKey(rec), color: '#6b7280' };

  // Neste discount days replace addresses with a "same price everywhere" marker.
  const isMarker = rec.location && (/vienād/i.test(rec.location) || DISCOUNT_MARKER_RE.test(rec.location));
  let addressList = [];
  if (isMarker) {
    addressList = [t('all_stations_same_price')];
  } else if (rec.location && rec.location.trim().length > 0) {
    addressList = rec.location.split(/\|/).map((s) => s.trim()).filter((s) => s.length > 0);
  }

  return (
    <div
      className={clsx(
        'flex items-start justify-between gap-3 rounded-xl px-2.5 sm:px-3 transition-colors',
        isCheapest ? 'py-2.5' : 'py-2 hover:bg-gray-50'
      )}
      style={isCheapest ? {
        backgroundColor: hexToRgba(CHEAPEST_COLOR, 0.09),
        boxShadow: `inset 0 0 0 1.5px ${hexToRgba(CHEAPEST_COLOR, 0.45)}`,
      } : undefined}
    >
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wide" style={{ color: st.color }}>
          {st.label}
        </span>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500 font-medium min-w-0">
          {addressList.length > 0 ? (
            addressList.map((addr, i) => {
              const url = isMarker
                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${st.label}, Rīga, Latvia`)}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${st.label} ${addr}, Latvia`)}`;
              return <AddressChip key={i} addr={addr} url={url} isMarker={isMarker} />;
            })
          ) : (
            <span className="text-gray-400 italic">{t('location')}</span>
          )}
        </div>
      </div>
      <div className="shrink-0 flex items-baseline gap-1 leading-tight">
        <span
          className={clsx(
            'tabular-nums tracking-tight',
            isCheapest
              ? 'text-sm sm:text-base font-bold text-white rounded-md px-1.5 py-0.5 inline-block'
              : 'text-sm sm:text-base font-bold text-gray-900'
          )}
          style={isCheapest ? { backgroundColor: CHEAPEST_COLOR } : undefined}
        >
          €{rec.price.toFixed(3)}
        </span>
        <span className="text-[10px] text-gray-400 font-medium">/ {t('liter_short')}</span>
      </div>
    </div>
  );
};

// A fuel-type group: colored accent + label + cheapest price headline, then one
// StationRow per station sorted cheapest-first.
const FuelGroupBlock = ({ group, rows }) => {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl bg-white p-3 sm:p-4 shadow-[0_1px_8px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="mb-2 px-1">
        <span className="inline-block text-[11px] sm:text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-gray-100 text-gray-700">
          {t(group.labelKey)}
        </span>
      </div>
      <div className="space-y-0.5">
        {rows.map((rec, i) => (
          <StationRow key={`${stationKey(rec)}-${rec.type}`} rec={rec} isCheapest={i === 0} />
        ))}
      </div>
    </div>
  );
};

// Tooltip for the per-fuel station charts: date + each station's price (sorted
// cheapest first). payload dataKeys are `${fuelId}__${source}`.
const StationChartTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const date = payload[0]?.payload?.date;
  const dateStr = date
    ? new Date(date).toLocaleDateString('lv-LV', { timeZone: 'Europe/Riga', day: '2-digit', month: '2-digit', year: '2-digit' })
    : '';
  // Keep numeric rows for known stations only (excludes the pills overlay line,
  // which keys off a synthetic `${id}__${src}_min` dataKey), de-duped by dataKey.
  const seen = new Set();
  const rows = payload
    .filter(p => typeof p.value === 'number' && STATIONS[String(p.dataKey).split('__')[1]])
    .filter(p => { const k = String(p.dataKey); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.value - b.value);
  if (!rows.length) return null;
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString('lv-LV', { timeZone: 'Europe/Riga', hour: '2-digit', minute: '2-digit', hour12: false });
  return (
    <div className="rounded-lg bg-white/95 backdrop-blur shadow-lg ring-1 ring-gray-100 px-3 py-2 text-xs">
      <div className="font-semibold text-gray-400 mb-1 tabular-nums">{dateStr}</div>
      {rows.map(p => {
        const src = String(p.dataKey).split('__')[1];
        const st = STATIONS[src] || { label: src, color: p.stroke };
        const history = p.payload[`${p.dataKey}_history`] || [];
        const showHistory = history.length > 1; // only when the price moved within the day
        return (
          <div key={p.dataKey} className="py-0.5">
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: st.color }} />
                <span className="font-medium text-gray-700">{st.label}</span>
              </span>
              <span className="font-bold tabular-nums text-gray-900">€{p.value.toFixed(3)}</span>
            </div>
            {showHistory && (
              <div className="mt-0.5 ml-3.5 pl-2 border-l border-gray-200 space-y-0.5">
                {history.map((h, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 text-[10px] text-gray-400">
                    <span className="tabular-nums">{fmtTime(h.timestamp)}</span>
                    <span className="font-medium tabular-nums text-gray-500">€{h.price.toFixed(3)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// One fuel's mini line chart: a line per station, end dots, discount shading.
// Shares the global brush window (visibleData) and period/discount settings.
// End-of-line price pills. Rendered via a <LabelList> inside the chart's last
// (transparent) <Line> so they paint ON TOP of every station line and dot — the
// same layering the old single-chart badges had (recharts <Customized> renders
// under the graphical items, which buried them). Each pill is collision-resolved
// vertically and linked to its datapoint by a thin dashed leader, visually
// distinct from the solid graph lines.
const PILL_HEIGHT = 24;
const PLOT_TOP = 14; // matches LineChart top margin
const PLOT_BOTTOM = 148; // chart height (150) − bottom margin (2)

// Build the vertically collision-resolved pill stack for the final datapoint.
// Each item keeps its true datapoint y plus a labelY (pill center) after overlap
// resolution; the whole stack is shifted as a unit to stay inside the plot box.
function buildEndPillStack(activeSrcs, lastPoint, groupId, toY) {
  const items = activeSrcs
    .map((src) => {
      const price = lastPoint[`${groupId}__${src}`];
      const y = toY(price);
      return {
        src,
        price,
        color: (STATIONS[src] || {}).color || '#6b7280',
        label: (STATIONS[src] || {}).label || src,
        y,
        labelY: y,
      };
    })
    // Drop any pill whose geometry isn't finite — a degenerate domain mid-drag
    // could otherwise produce NaN coordinates and (downstream) an empty-stack read.
    .filter((it) => typeof it.price === 'number' && Number.isFinite(it.y));
  // Nothing to stack — bail before the items[0] reads below would throw.
  if (items.length === 0) return [];
  items.sort((a, b) => a.y - b.y);
  const GAP = PILL_HEIGHT + 6; // a little breathing room between stacked chips
  const top = PLOT_TOP + PILL_HEIGHT / 2;
  const bottom = PLOT_BOTTOM - PILL_HEIGHT / 2;
  for (let iter = 0; iter < 50; iter++) {
    let changed = false;
    for (let i = 0; i < items.length - 1; i++) {
      const a = items[i];
      const b = items[i + 1];
      const overlap = GAP - (b.labelY - a.labelY);
      if (overlap > 0) {
        a.labelY -= overlap / 2;
        b.labelY += overlap / 2;
        changed = true;
      }
    }
    if (!changed) break;
  }
  const first = items[0].labelY;
  const last = items[items.length - 1].labelY;
  let shift = 0;
  if (last - first > bottom - top) shift = top - first; // taller than box → anchor top
  else if (first < top) shift = top - first;
  else if (last > bottom) shift = bottom - last;
  items.forEach((it) => {
    it.labelY += shift;
  });
  return items;
}

// A single end-of-line price pill: white rounded chip with bold € price + the
// station name. A dashed leader connects it to its datapoint whenever the pill
// has been displaced from it (which, given the horizontal offset, is always).
function EndPricePill({ item, dpX }) {
  // Guard against non-finite geometry during a rapid brush drag (transient
  // degenerate domain → NaN). Skip the pill rather than emit NaN SVG attributes.
  if (!item || !Number.isFinite(item.price) || !Number.isFinite(dpX) ||
      !Number.isFinite(item.y) || !Number.isFinite(item.labelY)) {
    return null;
  }
  const priceText = `€${item.price.toFixed(3)}`;
  const pillWidth = priceText.length * 7 + 12;
  const pillX = dpX - pillWidth - 14;
  const rightX = pillX + pillWidth + 2;
  const dist = Math.hypot(dpX - rightX, item.y - item.labelY);
  return (
    <g>
      {dist > 6 && (
        <line
          x1={dpX}
          y1={item.y}
          x2={rightX}
          y2={item.labelY}
          stroke={item.color}
          strokeWidth={1}
          strokeDasharray="2 2"
          opacity={1}
        />
      )}
      <g transform={`translate(${pillX}, ${item.labelY - PILL_HEIGHT / 2})`}>
        <rect
          width={pillWidth}
          height={PILL_HEIGHT}
          rx={8}
          fill="#ffffff"
          stroke="#e5e7eb"
          strokeWidth={1}
        />
        <text
          x={pillWidth / 2}
          y={PILL_HEIGHT / 2 - 4}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11}
          fontWeight={700}
          fill={item.color}
        >
          {priceText}
        </text>
        <text
          x={pillWidth / 2}
          y={PILL_HEIGHT / 2 + 8}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={9}
          fontWeight={500}
          fill={item.color}
          opacity={1}
        >
          {item.label}
        </text>
      </g>
    </g>
  );
}

const FuelTrendChart = ({ group, visibleData, chartDataFinal, graphInterval, showDiscounts, t, isActiveChart }) => {
  // Defensive: a brush window can transiently slice to an empty set while state
  // settles. Recharts dislikes an empty/degenerate-domain chart, so render a
  // neutral placeholder rather than risk a throw that blanks the panel.
  const safeData = Array.isArray(visibleData) ? visibleData : [];
  // Only render stations that actually have a numeric value WITHIN the visible
  // window. `group.stations` is derived from the full dataset, so in a historical
  // window (e.g. before the non-Neste chains began scraping) it would otherwise
  // render empty all-null <Line>/<ErrorBar> series plus a pills overlay keyed off
  // them — degenerate input Recharts has to mount/unmount as the brush window
  // crosses the sparse boundary during a fast drag. Scoping to the visible window
  // removes that whole class of churn (the multi-provider regression).
  const visibleStations = group.stations.filter((s) =>
    safeData.some((d) => typeof d[`${group.id}__${s}`] === 'number'));
  let dMin = Infinity, dMax = -Infinity, hasVals = false;
  safeData.forEach(d => visibleStations.forEach(s => {
    const v = d[`${group.id}__${s}`];
    if (typeof v === 'number') { hasVals = true; if (v < dMin) dMin = v; if (v > dMax) dMax = v; }
  }));
  if (!safeData.length) {
    return (
      <div>
        <div className="mb-1">
          <span className="inline-block text-[11px] sm:text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-gray-100 text-gray-700">
            {t(group.labelKey)}
          </span>
        </div>
        <div className="h-[140px] w-full" />
      </div>
    );
  }
  if (!hasVals) { dMin = 0; dMax = 1; }

  // Y-axis spans the full period: min price at bottom, max price at top.
  // A small 5 % pad on each side keeps dots from touching the chart edges.
  const periodRange = dMax - dMin;
  const pad = Math.max(periodRange * 0.05, 0.005);
  const domainLow = dMin - pad;
  const domainHigh = dMax + pad;

  // Price-pill geometry for the final datapoint. toY mirrors the (explicit,
  // linear) YAxis domain → pixel mapping so pills line up with the real dots.
  const lastPoint = visibleData[visibleData.length - 1] || {};
  const activeSrcs = visibleStations.filter((s) => typeof lastPoint[`${group.id}__${s}`] === 'number');
  const anchorSrc = activeSrcs[0];
  const domainMin = domainLow;
  const domainSpan = domainHigh - domainLow;
  const toY = (price) => PLOT_TOP + (PLOT_BOTTOM - PLOT_TOP) * (1 - (price - domainMin) / domainSpan);
  const lastIndex = visibleData.length - 1;

  return (
    <div>
      <div className="mb-1">
        <span className="inline-block text-[11px] sm:text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-gray-100 text-gray-700">
          {t(group.labelKey)}
        </span>
      </div>
      <div className="h-[150px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={visibleData} margin={{ top: 14, right: 18, left: 8, bottom: 2 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
            <XAxis dataKey="date" type="number" domain={['dataMin', 'dataMax']} hide />
            <YAxis domain={[domainLow, domainHigh]} hide />
            <Tooltip content={<StationChartTooltip />} cursor={{ stroke: '#9ca3af', strokeWidth: 1, strokeDasharray: '5 5' }} wrapperStyle={{ zIndex: 20, display: isActiveChart === false ? 'none' : undefined }} />
            {graphInterval === 'days' && (() => {
              // Clamp each discount band to the visible window's date range. Without
              // this, the band for the LAST point (e.g. today's discount) extends to
              // point.date + ½·gap — past the axis max — and Recharts' ReferenceArea
              // (ifOverflow="discard" by default) drops the whole band, so the most
              // recent discount day never highlighted even though mid-chart ones did.
              const visMin = visibleData[0]?.date;
              const visMax = visibleData[visibleData.length - 1]?.date;
              return chartDataFinal.reduce((areas, point, i, arr) => {
                if (!point.isDiscount) return areas;
                const avgGap = arr.length > 1 ? (arr[arr.length - 1].date - arr[0].date) / (arr.length - 1) : 0;
                const prevDate = i > 0 ? arr[i - 1].date : point.date - avgGap;
                const nextDate = i < arr.length - 1 ? arr[i + 1].date : point.date + avgGap;
                let x1 = (prevDate + point.date) / 2;
                let x2 = (point.date + nextDate) / 2;
                if (visMin !== undefined) { x1 = Math.max(visMin, x1); x2 = Math.max(visMin, x2); }
                if (visMax !== undefined) { x1 = Math.min(visMax, x1); x2 = Math.min(visMax, x2); }
                if (x2 <= x1) return areas; // fully outside the visible window
                areas.push(
                  <ReferenceArea
                    key={`disc-${point.periodKey}`}
                    x1={x1}
                    x2={x2}
                    ifOverflow="visible"
                    fill={showDiscounts ? `${DISCOUNT_COLOR}33` : 'transparent'}
                    stroke="none"
                  />
                );
                return areas;
              }, []);
            })()}
            {/* One line per station, each with an intraday min–max ErrorBar
                whisker. Scoped to stations present in the visible window so we
                never feed Recharts empty all-null series. */}
            {visibleStations.map((src) => {
              const color = (STATIONS[src] || {}).color || '#6b7280';
              return (
                <Line
                  key={src}
                  type="monotone"
                  dataKey={`${group.id}__${src}`}
                  stroke={color}
                  strokeWidth={2}
                  connectNulls
                  isAnimationActive={false}
                  dot={{ r: 3, fill: color, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: color, strokeWidth: 0 }}
                >
                  <ErrorBar
                    dataKey={`${group.id}__${src}_range`}
                    width={3}
                    strokeWidth={1.5}
                    stroke={color}
                    direction="y"
                  />
                </Line>
              );
            })}
            {/* Transparent overlay line rendered LAST so its LabelList paints the
                price pills on top of every line, dot, and whisker. It keys off the
                anchor's `_min` field — a DISTINCT dataKey from the real station
                line — so recharts doesn't collide two layers on the same key, and
                the StationChartTooltip filter (known stations only) hides it. */}
            {anchorSrc && domainSpan > 0 && (
              <Line
                key="__pills"
                type="monotone"
                dataKey={`${group.id}__${anchorSrc}_min`}
                stroke="transparent"
                strokeWidth={0}
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={false}
                legendType="none"
              >
                <LabelList
                  dataKey={`${group.id}__${anchorSrc}_min`}
                  content={(props) => {
                    if (!props || props.index !== lastIndex) return null;
                    const stack = buildEndPillStack(activeSrcs, lastPoint, group.id, toY);
                    return (
                      <g>
                        {stack.map((it) => (
                          <EndPricePill key={it.src} item={it} dpX={props.x} />
                        ))}
                      </g>
                    );
                  }}
                />
              </Line>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Custom Timeline Slider — matches Apple-style spec from screenshot
// Live chart preview is throttled to this cadence DURING a drag. The crash was a
// re-render storm: pushing a new window on every pointer frame (60–120 Hz) faster
// than the Recharts trees could settle. ~90 ms (≈11 Hz) is slow enough that each
// chart render finishes before the next starts, yet fast enough to read as live.
const SLIDER_CHART_PREVIEW_MS = 90;

const TimelineSlider = ({ data, startIndex, endIndex, onChange, onBrushStart, onBrushEnd, graphInterval }) => {
  const trackRef = React.useRef(null);
  const dragRef = React.useRef(null); // Stores drag state
  const lastChartCommitRef = React.useRef(0); // throttle clock for live preview

  // Live thumb window DURING a drag. The thumb follows this local state at full
  // pointer rate (re-rendering only this lightweight slider), while the chart's
  // window (brushIndices via onChange) is updated on a throttle — see
  // handlePointerDown. Decoupling the two keeps the preview live without the
  // per-frame Recharts storm that crashed the chart. null = not dragging.
  const [dragWindow, setDragWindow] = React.useState(null);

  const totalCount = data.length;
  if (totalCount === 0) return null;

  // Minimum span based on interval mode
  const minSpan = graphInterval === 'days' ? 6 : 0; // 7 days min for 'days', 1 item min for others (0-indexed)

  // Geometry tracks the live drag window when present, else the committed props.
  const effStart = dragWindow ? dragWindow.startIndex : startIndex;
  const effEnd = dragWindow ? dragWindow.endIndex : endIndex;

  const dataSpan = effEnd - effStart;
  const dataWidthPct = ((dataSpan + 1) / totalCount) * 100;
  const effectiveWidthPct = Math.max(dataWidthPct, 30); // Minimum 30% to fit date label

  // Map data position proportionally to the available visual travel range
  // so the thumb moves smoothly from left edge to right edge
  const travelRange = 100 - effectiveWidthPct;
  const maxStartIndex = totalCount - dataSpan - 1;
  const effectiveLeftPct = maxStartIndex > 0 ? (effStart / maxStartIndex) * travelRange : 0;

  // Format the date range label
  const startDate = data[effStart]?.date ? new Date(data[effStart].date) : null;
  const endDate = data[effEnd]?.date ? new Date(data[effEnd].date) : null;
  const formatDate = (d) => d ? d.toLocaleDateString('lv-LV', { timeZone: 'Europe/Riga', day: '2-digit', month: '2-digit' }) : '';
  const dateLabel = startDate && endDate ? `${formatDate(startDate)} - ${formatDate(endDate)}` : '';


  const clampIndices = (start, end) => {
    let s = Math.max(0, Math.min(totalCount - 1, start));
    let e = Math.max(s, Math.min(totalCount - 1, end));
    // Enforce minimum span
    if (e - s < minSpan) {
      // Try expanding the end first, then adjust start if we hit the boundary
      e = Math.min(totalCount - 1, s + minSpan);
      if (e - s < minSpan) {
        s = Math.max(0, e - minSpan);
      }
    }
    return { startIndex: s, endIndex: e };
  };

  const handlePointerDown = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
    dragRef.current = { mode, startX, origStart: startIndex, origEnd: endIndex };
    if (onBrushStart) onBrushStart(); // mark drag active (stable boundary reset signal)
    lastChartCommitRef.current = 0; // let the first move commit immediately

    // The thumb follows `pending` at full pointer rate via setDragWindow (cheap —
    // only this slider re-renders). The chart follows via onChange, but THROTTLED
    // to SLIDER_CHART_PREVIEW_MS so the Recharts trees re-render at a rate they can
    // keep up with instead of once per frame. onUp always commits the exact final
    // window, so throttling never loses the end position. `lastCommitted` avoids a
    // redundant onChange when the throttled value equals the last one sent.
    let pending = null;
    let lastCommitted = null;

    const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

    const commitToChart = (win) => {
      if (lastCommitted && win.startIndex === lastCommitted.startIndex && win.endIndex === lastCommitted.endIndex) return;
      lastCommitted = win;
      lastChartCommitRef.current = now();
      onChange(win);
    };

    const onMove = (ev) => {
      const clientX = ev.clientX || (ev.touches && ev.touches[0]?.clientX) || 0;
      const drag = dragRef.current;
      if (!drag) return;
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const deltaIdx = Math.round(((clientX - drag.startX) / rect.width) * (totalCount - 1));

      if (drag.mode === 'pan') {
        const span = drag.origEnd - drag.origStart;
        let newStart = drag.origStart + deltaIdx;
        let newEnd = newStart + span;
        if (newStart < 0) { newStart = 0; newEnd = span; }
        if (newEnd >= totalCount) { newEnd = totalCount - 1; newStart = newEnd - span; }
        pending = clampIndices(newStart, newEnd);
      } else if (drag.mode === 'left') {
        pending = clampIndices(drag.origStart + deltaIdx, drag.origEnd);
      } else if (drag.mode === 'right') {
        pending = clampIndices(drag.origStart, drag.origEnd + deltaIdx);
      }
      setDragWindow(pending); // thumb: full rate
      if (now() - lastChartCommitRef.current >= SLIDER_CHART_PREVIEW_MS) {
        commitToChart(pending); // chart: throttled live preview
      }
    };

    const onUp = () => {
      dragRef.current = null;
      // Commit the exact final window to the chart, then drop the local preview in
      // the SAME batched event tick (onChange + setDragWindow), so the thumb never
      // flickers back on release even though the chart was throttled mid-drag.
      if (pending) { commitToChart(pending); pending = null; }
      setDragWindow(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      if (onBrushEnd) onBrushEnd(); // drag settled -> lets any errored chart boundary recover
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  };

  return (
    <div
      ref={trackRef}
      className="relative h-8 rounded-lg bg-gray-50 ring-1 ring-inset ring-gray-200 select-none mb-3 touch-action-none"
      style={{ touchAction: 'none' }}
    >
      {/* Active Viewport Thumb */}
      <div
        className="absolute top-[2px] bottom-[2px] rounded-md bg-white shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing"
        style={{ left: `${effectiveLeftPct}%`, width: `${effectiveWidthPct}%` }}
        onMouseDown={(e) => handlePointerDown(e, 'pan')}
        onTouchStart={(e) => handlePointerDown(e, 'pan')}
      >
        {/* Left drag handle container (Larger hit area) */}
        <div
          className="absolute left-[-14px] top-0 bottom-0 w-8 flex items-center justify-center cursor-ew-resize z-10"
          onMouseDown={(e) => handlePointerDown(e, 'left')}
          onTouchStart={(e) => handlePointerDown(e, 'left')}
        >
          <div className="w-1 h-4 rounded-full bg-gray-300" />
        </div>

        {/* Date range label */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[9px] sm:text-[11px] font-semibold text-gray-400 whitespace-nowrap">{dateLabel}</span>
        </div>

        {/* Right drag handle container (Larger hit area) */}
        <div
          className="absolute right-[-14px] top-0 bottom-0 w-8 flex items-center justify-center cursor-ew-resize z-10"
          onMouseDown={(e) => handlePointerDown(e, 'right')}
          onTouchStart={(e) => handlePointerDown(e, 'right')}
        >
          <div className="w-1 h-4 rounded-full bg-gray-300" />
        </div>
      </div>
    </div>
  );
};

// Pre-calculate fuel keys to avoid re-computations
const FUEL_KEYS = Object.keys(FUEL_COLORS);

// History Table Component — flexible date range picker
const HistoryTable = React.memo(({
  historyData,
  t,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onPresetChange,
  activePreset,
  loading,
  selectedStations,
  selectedFuels
}) => {
  const { i18n } = useTranslation();
  const allFuelTypes = FUEL_KEYS;
  const PAGE_SIZE = 31;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Reset visible rows when date range changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [startDate, endDate]);

  // Staging state for DateRangePicker UI only
  const [localStartDate, setLocalStartDate] = useState(startDate);
  const [localEndDate, setLocalEndDate] = useState(endDate);



  // Sync internal staging when external props change (e.g. from URL)
  useEffect(() => {
    setLocalStartDate(startDate);
    setLocalEndDate(endDate);
  }, [startDate, endDate]);

  // Filter States (the 'Staged' values actually used for UI tables/charts to prevent jumping)
  const [filterStart, setFilterStart] = useState(startDate);
  const [filterEnd, setFilterEnd] = useState(endDate);

  // Sync filter when props change
  useEffect(() => {
    setFilterStart(startDate);
    setFilterEnd(endDate);
  }, [startDate, endDate]);



  const currentLang = i18n?.language || 'en';

  // Quick preset functions
  const setPreset = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1)); // inclusive count
    const s = toYMD(start.getTime());
    const e = toYMD(end.getTime());
    onStartDateChange(s);
    onEndDateChange(e);
    onPresetChange?.(String(days));
  };

  // Optimization: use a single, cached formatter for better performance
  const rigaFormatter = React.useMemo(() => new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Riga',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }), []);

  // Helper: extract Riga timezone date components efficiently
  const getRigaParts = React.useCallback((timestamp) => {
    const utcDate = new Date(timestamp);
    const parts = rigaFormatter.formatToParts(utcDate);
    const getPart = (type) => parts.find(p => p.type === type)?.value;
    
    return { 
      year: parseInt(getPart('year')), 
      month: parseInt(getPart('month')), 
      day: parseInt(getPart('day')) 
    };
  }, [rigaFormatter]);

  const toYMD = React.useCallback((timestamp) => {
    const { year, month, day } = getRigaParts(timestamp);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }, [getRigaParts]);

  // Pre-aggregate ALL available historical data mathematically by Day (for accurate preceding deltas)
  const allDaysData = useMemo(() => {
    if (!historyData || historyData.length === 0) return [];

    // The chart / history table are Neste-only — other stations live only in the
    // Dynamics section. Filter here so multi-station history never leaks in.
    const nesteHistory = historyData.filter(e => (e.source || 'Neste') === 'Neste');

    // Group into days
    const dayMap = new Map();
    nesteHistory.forEach(e => {
        const dateKey = toYMD(e.timestamp);
        if (!dayMap.has(dateKey)) {
            const { year, month, day } = getRigaParts(e.timestamp);
            dayMap.set(dateKey, {
                dateKey,
                // Using requested shortened date format: dd.mm.yy
                timeStr: `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${String(year).slice(-2)}`,
                rawFuels: {},
                hasDiscountLocation: false,
                hasExternalDiscount: false
            });
        }
        const dayData = dayMap.get(dateKey);
        if (!dayData.rawFuels[e.type]) dayData.rawFuels[e.type] = [];
        dayData.rawFuels[e.type].push({ price: e.price, timestamp: e.timestamp });
        if (e.location) {
            if (!dayData.hasDiscountLocation && DISCOUNT_MARKER_RE.test(e.location)) {
                dayData.hasDiscountLocation = true;
            }
            if (!dayData.hasExternalDiscount && EXTERNAL_DISCOUNT_RE.test(e.location)) {
                dayData.hasExternalDiscount = true;
            }
        }
    });

    // Compute stats
    let rows = Array.from(dayMap.values()).map(dayData => {
        const fuels = {};
        allFuelTypes.forEach(f => {
            if (dayData.rawFuels[f] && dayData.rawFuels[f].length > 0) {
                const entries = dayData.rawFuels[f];
                const prices = entries.map(e => e.price);
                const sum = prices.reduce((a,b) => a+b, 0);
                // Most recent price for the day
                const latest = entries.reduce((a, b) => new Date(a.timestamp) > new Date(b.timestamp) ? a : b);
                fuels[f] = {
                    latest: latest.price,
                    avg: sum / prices.length,
                    min: Math.min(...prices),
                    max: Math.max(...prices),
                    count: prices.length
                };
            }
        });
        return {
            dateKey: dayData.dateKey,
            timeStr: dayData.timeStr,
            fuels,
            hasDiscountLocation: dayData.hasDiscountLocation,
            hasExternalDiscount: dayData.hasExternalDiscount,
            isDiscount: false
        };
    });

  // Sort mathematically ASCENDING to calculate previous day delta
    rows.sort((a,b) => a.dateKey.localeCompare(b.dateKey));

    // Calc Day-over-Day change
    for (let i = 0; i < rows.length; i++) {
        FUEL_KEYS.forEach(f => {
            if (rows[i].fuels[f]) {
                if (i > 0 && rows[i-1].fuels[f]) {
                    rows[i].fuels[f].change = rows[i].fuels[f].latest - rows[i-1].fuels[f].latest;
                } else {
                    rows[i].fuels[f].change = null;
                }
            }
        });
    }

    // Finalize isDiscount — mirrors the chart's logic in processData.
    //
    // Two paths:
    //   (1) External confirmation (hasExternalDiscount): server scraper saw
    //       the neste.lv homepage banner / Instagram post / manual override
    //       for that day. Authoritative — flag the day regardless of the
    //       price-drop magnitude (Privātkarte discounts can be as small as
    //       3¢/L, below the heuristic gate).
    //   (2) Marker-only fallback (hasDiscountLocation without external):
    //       require the marker to be NEW (absent the previous day) AND ANY fuel
    //       (incl. diesel) dropped ≥4¢ day-over-day. The onset guard avoids
    //       false-positives from the prices-page "visās stacijās / uniform
    //       price" text lingering for days after a discount ends (e.g. it
    //       persisted 2026-06-10→11 and the post-discount price settling read as
    //       a fresh 6¢ drop). Diesel-focused discounts (e.g. 2026-05-29: diesel
    //       −11¢ while gasoline only −2¢) must qualify, so we check every fuel.
    //
    // No carry-forward: only the day with the visible day-over-day drop is
    // the discount day, not the next day where price recovers.
    const MIN_DISCOUNT_DROP = 0.04;
    const EPSILON = 0.001;
    for (let i = 0; i < rows.length; i++) {
        if (rows[i].hasExternalDiscount) {
            rows[i].isDiscount = true;
            continue;
        }
        if (i === 0 || !rows[i].hasDiscountLocation) continue;
        const prev = rows[i - 1];
        if (prev.hasDiscountLocation) continue; // marker lingering from a prior day, not a fresh onset
        const curr = rows[i];
        const anyFuelDropped = allFuelTypes.some(f => {
            const prevFuel = prev.fuels[f];
            const currFuel = curr.fuels[f];
            if (!prevFuel || !currFuel) return false;
            const dropLatest = prevFuel.latest - currFuel.latest;
            const dropMin = prevFuel.latest - currFuel.min;
            return Math.max(dropLatest, dropMin) >= MIN_DISCOUNT_DROP - EPSILON;
        });
        rows[i].isDiscount = anyFuelDropped;
    }

    return rows;
  }, [historyData, getRigaParts, toYMD, allFuelTypes]);

  const availableDatesSet = useMemo(() => {
    return new Set(allDaysData.map(d => d.dateKey));
  }, [allDaysData]);

  // Multi-station day aggregation for the detail table: per day → per fuel group
  // → per station → most-recent price of that day. Covers ALL stations.
  const allDaysMulti = useMemo(() => {
    if (!historyData || historyData.length === 0) return [];
    const dayMap = new Map();
    historyData.forEach(e => {
      const dateKey = toYMD(e.timestamp);
      const groupId = fuelGroupId(e);
      const src = stationKey(e);
      if (!dayMap.has(dateKey)) {
        const { year, month, day } = getRigaParts(e.timestamp);
        dayMap.set(dateKey, {
          dateKey,
          timeStr: `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${String(year).slice(-2)}`,
          cells: {},
        });
      }
      const d = dayMap.get(dateKey);
      if (!d.cells[groupId]) d.cells[groupId] = {};
      const cur = d.cells[groupId][src];
      if (!cur || new Date(e.timestamp) > new Date(cur.timestamp)) {
        d.cells[groupId][src] = { price: e.price, timestamp: e.timestamp };
      }
    });
    return Array.from(dayMap.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [historyData, toYMD, getRigaParts]);

  const tableRowsMulti = useMemo(() => {
    const filtered = allDaysMulti.filter(r => r.dateKey >= filterStart && r.dateKey <= filterEnd);
    const result = (activePreset === '30' && filtered.length > 30) ? filtered.slice(-30) : filtered;
    return result.reverse();
  }, [allDaysMulti, filterStart, filterEnd, activePreset]);

  // Which fuel groups / stations to render, honoring the global filters.
  // Each column also gets Ø/min/max stats over the whole filtered period
  // (not just the visible page) for the table footer; the station with the
  // lowest period average is flagged via minAvg.
  const tableFuelGroups = useMemo(() => {
    return FUEL_GROUPS
      .filter(g => !selectedFuels || selectedFuels.has(g.id))
      .map(g => {
        const cols = STATION_ORDER.filter(src =>
          (!selectedStations || selectedStations.has(src)) &&
          tableRowsMulti.some(r => r.cells[g.id] && r.cells[g.id][src])
        );
        const stats = cols.map(src => {
          const vals = tableRowsMulti
            .map(r => (r.cells[g.id] && r.cells[g.id][src]) ? r.cells[g.id][src].price : null)
            .filter(v => v != null);
          if (vals.length === 0) return null;
          return {
            avg: vals.reduce((a, b) => a + b, 0) / vals.length,
            min: Math.min(...vals),
            max: Math.max(...vals),
          };
        });
        const avgs = stats.filter(Boolean).map(s => s.avg);
        const minAvg = avgs.length > 1 ? Math.min(...avgs) : null;
        return { ...g, cols, stats, minAvg };
      })
      .filter(g => g.cols.length > 0);
  }, [tableRowsMulti, selectedFuels, selectedStations]);

  return (
    <div>
      {/* Header: subsection title + period controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <h3 className="text-sm sm:text-base font-semibold text-gray-700">{t('avg_prices.table_title')}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker
               startDate={localStartDate}
               endDate={localEndDate}
               onRangeChange={(start, end) => {
                 setLocalStartDate(start);
                 setLocalEndDate(end);

                 // Only update the active filter if we have a full range or both are cleared
                 if ((start && end) || (!start && !end)) {
                   onStartDateChange(start);
                   onEndDateChange(end);
                   onPresetChange?.(null); // Custom date range, clear preset
                 }
               }}
               disabled={(date) => {
                 const key = toYMD(date);
                 return !availableDatesSet.has(key);
               }}
               locale={currentLang}
               className={!activePreset ? "border-blue-500/50 bg-blue-50/50" : ""}
            />
            <SegmentedControl
              options={[
                { value: '7', label: t('avg_prices.last_7_days') },
                { value: '30', label: t('avg_prices.last_30_days') },
                { value: '90', label: t('avg_prices.last_90_days') },
              ]}
              value={activePreset}
              onChange={(val) => {
                if (val === '7') setPreset(7);
                else if (val === '30') setPreset(30);
                else if (val === '90') setPreset(90);
              }}
              layoutId="active-history-preset"
              size="small"
            />
          </div>
        </div>

        {loading && historyData.length === 0 ? (
          <HistoryTableSkeleton />
        ) : tableRowsMulti.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">{t('avg_prices.no_data')}</p>
        ) : (
          <div className="space-y-8">
            {/* Detail Table — daily price per station, grouped by fuel, with
                per-station Ø average + Min–Max footer rows for the period */}
            <div className="space-y-4">
              {/* Subtle disclaimer — the cheapest price of the day (among selected stations) is colored */}
              <div className="flex items-start gap-2 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                <Info className="w-3.5 h-3.5 text-slate-400 mt-px shrink-0" />
                <p className="text-[11px] sm:text-xs text-slate-500 leading-relaxed">
                  {t('avg_prices.latest_disclaimer')}
                </p>
              </div>

              {tableFuelGroups.map(group => (
                <div key={group.id} className="space-y-2">
                  <div>
                    <span className="inline-block text-[11px] sm:text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-gray-100 text-gray-700">
                      {t(group.labelKey)}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left text-[9px] sm:text-[10px] font-semibold text-gray-400 uppercase tracking-wide py-3 pl-2 sm:pl-4">
                            {t('avg_prices.day')}
                          </th>
                          {group.cols.map((src, idx) => (
                            <th
                              key={src}
                              className={clsx("text-right text-[11px] sm:text-xs font-bold uppercase tracking-wide px-1 sm:px-4 py-3 whitespace-nowrap", idx === group.cols.length - 1 && "pr-2 sm:pr-4")}
                              style={{ color: (STATIONS[src] || {}).color }}
                            >
                              {(STATIONS[src] || {}).label || src}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableRowsMulti.slice(0, visibleCount).map(row => {
                          const prices = group.cols.map(src => (row.cells[group.id] && row.cells[group.id][src]) ? row.cells[group.id][src].price : null);
                          const valid = prices.filter(v => v != null);
                          const min = valid.length ? Math.min(...valid) : null;
                          const multiple = valid.length > 1;
                          return (
                            <tr key={row.dateKey} className="border-b border-gray-100 last:border-b-0 hover:bg-slate-100/60 transition-colors">
                              <td className="py-2 pl-2 sm:pl-4 pr-0 sm:pr-2 align-middle">
                                <span className="block text-[10px] sm:text-sm font-normal text-gray-500 whitespace-nowrap tabular-nums">{row.timeStr}</span>
                              </td>
                              {prices.map((price, i) => {
                                const isLast = i === group.cols.length - 1;
                                if (price == null) {
                                  return <td key={group.cols[i]} className={clsx("text-right px-1 sm:px-4 py-2 align-middle text-gray-300 text-[10px]", isLast && "pr-2 sm:pr-4")}>—</td>;
                                }
                                const isCheapest = multiple && price === min;
                                return (
                                  <td key={group.cols[i]} className={clsx("text-right px-1 sm:px-4 py-2 align-middle", isLast && "pr-2 sm:pr-4")}>
                                    <span
                                      className={clsx("inline-block text-[11px] sm:text-sm font-bold leading-tight tabular-nums rounded-md px-1.5 py-0.5", isCheapest ? "text-white" : "text-gray-900")}
                                      style={isCheapest ? { backgroundColor: CHEAPEST_COLOR } : undefined}
                                    >
                                      €{price.toFixed(3)}
                                    </span>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                      {tableRowsMulti.length > 1 && group.stats.some(Boolean) && (
                        <tfoot>
                          <tr className="border-t-2 border-slate-200 bg-slate-50/80">
                            <td className="pt-2.5 pb-1 pl-2 sm:pl-4 pr-0 sm:pr-2 align-middle">
                              <span className="block text-[10px] sm:text-xs font-semibold text-gray-600 whitespace-nowrap">Ø {t('avg_prices.avg')}</span>
                            </td>
                            {group.stats.map((s, i) => {
                              const isLast = i === group.cols.length - 1;
                              if (!s) {
                                return <td key={group.cols[i]} className={clsx("text-right px-1 sm:px-4 pt-2.5 pb-1 align-middle text-gray-300 text-[10px]", isLast && "pr-2 sm:pr-4")}>—</td>;
                              }
                              const isBest = group.minAvg != null && s.avg === group.minAvg;
                              return (
                                <td key={group.cols[i]} className={clsx("text-right px-1 sm:px-4 pt-2.5 pb-1 align-middle", isLast && "pr-2 sm:pr-4")}>
                                  <span
                                    className={clsx("inline-block text-[11px] sm:text-sm font-bold leading-tight tabular-nums rounded-md px-1.5 py-0.5", isBest ? "text-white" : "text-gray-700")}
                                    style={isBest ? { backgroundColor: CHEAPEST_COLOR } : undefined}
                                  >
                                    €{s.avg.toFixed(3)}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                          <tr className="bg-slate-50/80">
                            <td className="pb-2.5 pl-2 sm:pl-4 pr-0 sm:pr-2 align-middle">
                              <span className="block text-[9px] sm:text-[11px] font-medium text-gray-400 whitespace-nowrap">{t('avg_prices.min')}–{t('avg_prices.max')}</span>
                            </td>
                            {group.stats.map((s, i) => {
                              const isLast = i === group.cols.length - 1;
                              return (
                                <td key={group.cols[i]} className={clsx("text-right px-1 sm:px-4 pb-2.5 align-middle", isLast && "pr-2 sm:pr-4")}>
                                  {s ? (
                                    <span className="text-[9px] sm:text-[11px] text-gray-400 tabular-nums whitespace-nowrap">{s.min.toFixed(3)}–{s.max.toFixed(3)}</span>
                                  ) : (
                                    <span className="text-gray-200 text-[10px]">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              ))}

              {/* Show more / row count */}
              {tableRowsMulti.length > PAGE_SIZE && (
                <div className="flex flex-col items-center gap-2 py-3">
                  <span className="text-[11px] text-gray-400 font-medium">
                    {t('avg_prices.showing_of', { visible: Math.min(visibleCount, tableRowsMulti.length), total: tableRowsMulti.length })}
                  </span>
                  {visibleCount < tableRowsMulti.length && (
                    <button
                      onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                      className="w-full sm:w-auto px-6 py-2 rounded-lg text-xs sm:text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 active:scale-95 border border-blue-100 transition-all"
                    >
                      {t('avg_prices.show_more')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );
});

export default function App() {
  const { t, i18n } = useTranslation();
  const [latestPrices, setLatestPrices] = useState(window.__INITIAL_PRICES__ || []);
  const [historyData, setHistoryData] = useState([]);

  // Sticky filter bar shrinks once the page is scrolled past the top (the title
  // row collapses and padding tightens), like a condensing sticky header.
  const [filtersCompact, setFiltersCompact] = useState(() => window.scrollY > 90);
  useEffect(() => {
    let frameId = null;
    const onFrame = () => {
      frameId = null;
      setFiltersCompact(window.scrollY > 90);
    };
    const onScroll = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(onFrame);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, []);

  // The chart renders at day granularity only (the weeks/months switcher was
  // removed in favor of the timeline range slider). Kept as a constant because
  // the chart aggregation logic still branches on it.
  const graphInterval = 'days';

  const [loading, setLoading] = useState(!window.__INITIAL_PRICES__);
  const [historyLoading, setHistoryLoading] = useState(true);
  // True when the most recent history fetch failed after retrying — the analytics
  // subsections then keep showing the previous (stale) data, so we surface a soft
  // hint instead of silently presenting old prices as current.
  const [historyError, setHistoryError] = useState(false);
  const [lastCheck, setLastCheck] = useState(() => {
    if (window.__INITIAL_PRICES__ && window.__INITIAL_PRICES__.length > 0) {
      return window.__INITIAL_PRICES__[0].timestamp;
    }
    return null;
  });
  const [notification, setNotification] = useState(null);
  // Transient "checked just now" feedback after a manual refresh. lastCheck shows
  // when the *data* is from (server scrape time); this confirms the click did
  // something even when the data is unchanged (e.g. within the 5-min debounce).
  const [justChecked, setJustChecked] = useState(false);
  const [showDiscounts, setShowDiscounts] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const discountParam = params.get('discounts');
    const stored = localStorage.getItem('showDiscounts');
    
    if (discountParam !== null) return discountParam === 'on';
    return stored === null ? true : stored === 'true';
  });

  // Client-side station / fuel filters for the prices view (default: all).
  const [selectedStations, setSelectedStations] = useState(() => initFilterSet('stations', 'selectedStations', STATION_ORDER));
  const [selectedFuels, setSelectedFuels] = useState(() => initFilterSet('fuels', 'selectedFuels', FUEL_GROUP_IDS));

  // Fuels actually sold by the currently selected stations. A group disappears
  // when no selected station sells it — gas drops for Neste-only, premium diesel
  // ('pro') drops for Virši-only — without mutating the persisted selection.
  const stationSupportedFuels = useMemo(() => {
    const supported = new Set();
    selectedStations.forEach((s) => {
      (STATION_FUEL_SUPPORT[s] || new Set()).forEach((f) => supported.add(f));
    });
    return supported;
  }, [selectedStations]);

  // Intersection of user's fuel selection and what selected stations actually sell.
  // Use this everywhere a fuel filter is needed; keep selectedFuels for persistence.
  // The analytics subsections (Graph / Dynamics / History) all scope to this same
  // set — there is no separate per-section fuel tab anymore.
  const effectiveSelectedFuels = useMemo(
    () => new Set([...selectedFuels].filter((f) => stationSupportedFuels.has(f))),
    [selectedFuels, stationSupportedFuels]
  );
  const analyticsFuels = effectiveSelectedFuels;

  // Analytics shows ONE fuel at a time, picked via a segmented control in the
  // card header. The tabs offer only fuels in analyticsFuels, in canonical order.
  const analyticsFuelList = useMemo(
    () => FUEL_GROUPS.filter((g) => analyticsFuels.has(g.id)).map((g) => g.id),
    [analyticsFuels]
  );
  // Multi-select of the fuel types to show in Analytics (one, several, or all).
  // Initialized from the `afuel` CSV URL param, else all. Stored raw; what's
  // actually shown is the intersection with the available fuels (below).
  const [analyticsFuelSelection, setAnalyticsFuelSelection] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('afuel');
    if (raw) {
      const picked = raw.split(',').filter((f) => FUEL_GROUP_IDS.includes(f));
      if (picked.length) return new Set(picked);
    }
    return new Set(FUEL_GROUP_IDS);
  });
  const toggleAnalyticsFuel = useCallback((value) => setAnalyticsFuelSelection((prev) => {
    const next = new Set(prev);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next.size === 0 ? prev : next; // never empty → never a blank analytics view
  }), []);
  // The fuels actually shown: the selection ∩ what's available. Falls back to
  // all available if the intersection is empty, so the view is never blank.
  const effectiveAnalyticsFuels = useMemo(() => {
    const inter = analyticsFuelList.filter((id) => analyticsFuelSelection.has(id));
    return new Set(inter.length ? inter : analyticsFuelList);
  }, [analyticsFuelList, analyticsFuelSelection]);

  // Toggle a value; never allow an empty selection (keeps the view non-blank).
  const toggleStation = useCallback((value) => setSelectedStations((prev) => {
    const next = new Set(prev);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next.size === 0 ? prev : next;
  }), []);
  const toggleFuel = useCallback((value) => setSelectedFuels((prev) => {
    const next = new Set(prev);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next.size === 0 ? prev : next;
  }), []);

  // Group latest prices by fuel type, filtered by the two selectors, each group's
  // stations sorted cheapest-first. Pure client-side — no refetch.
  const fuelGroups = useMemo(() => {
    return FUEL_GROUPS
      .filter((g) => effectiveSelectedFuels.has(g.id))
      .map((g) => ({
        group: g,
        rows: latestPrices
          .filter((r) => fuelGroupId(r) === g.id && selectedStations.has(stationKey(r)))
          .slice()
          .sort((a, b) => a.price - b.price),
      }))
      .filter((x) => x.rows.length > 0);
  }, [latestPrices, effectiveSelectedFuels, selectedStations]);

  // Which stations / fuels actually appear in the current data (for the header
  // count and to hide selector options that returned nothing this scrape).
  const presentStations = useMemo(() => {
    const seen = new Set(latestPrices.map(stationKey));
    return STATION_ORDER.filter((s) => seen.has(s));
  }, [latestPrices]);
  const presentFuels = useMemo(() => {
    const seen = new Set(latestPrices.map(fuelGroupId));
    return FUEL_GROUPS.filter((g) => seen.has(g.id) && stationSupportedFuels.has(g.id));
  }, [latestPrices, stationSupportedFuels]);

  // Dynamics data: per selected fuel → per selected station that currently sells
  // it (from latest), each with its own history slice for trend computation.
  // Respects BOTH global filters. History is multi-station now; stations without
  // enough history just render em dashes until data accumulates.
  const insightsGroups = useMemo(() => {
    return FUEL_GROUPS
      .filter((g) => analyticsFuels.has(g.id))
      .map((g) => {
        const stations = STATION_ORDER
          .filter((src) =>
            selectedStations.has(src) &&
            latestPrices.some((r) => stationKey(r) === src && fuelGroupId(r) === g.id)
          )
          .map((src) => ({
            key: src,
            label: (STATIONS[src] || {}).label || src,
            color: (STATIONS[src] || {}).color || '#6b7280',
            history: historyData.filter((r) => stationKey(r) === src && fuelGroupId(r) === g.id),
          }));
        return { id: g.id, color: g.color, labelKey: g.labelKey, stations };
      })
      .filter((g) => g.stations.length > 0);
  }, [historyData, latestPrices, analyticsFuels, selectedStations]);

  // Helper to compute date range from a preset name relative to today
  const computePresetDates = (preset) => {
    const fmt = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const now = new Date();
    if (preset === '7') {
      const start = new Date();
      start.setDate(now.getDate() - 6);
      return { start: fmt(start), end: fmt(now) };
    }
    if (preset === '30') {
      const start = new Date();
      start.setDate(now.getDate() - 29);
      return { start: fmt(start), end: fmt(now) };
    }
    if (preset === '90') {
      const start = new Date();
      start.setDate(now.getDate() - 89);
      return { start: fmt(start), end: fmt(now) };
    }
    return null;
  };

  const VALID_PRESETS = ['7', '30', '90'];

  const [historyPreset, setHistoryPreset] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    // URL preset takes priority
    const urlPreset = params.get('h_preset');
    if (urlPreset && VALID_PRESETS.includes(urlPreset)) return urlPreset;
    // Explicit date params mean no preset
    if (params.get('h_start') || params.get('h_end')) return null;
    const stored = localStorage.getItem('historyPreset_v2');
    if (stored && VALID_PRESETS.includes(stored)) return stored;
    return '7'; // default preset
  });

  const [historyStartDate, setHistoryStartDate] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    // URL preset takes priority
    const urlPreset = params.get('h_preset');
    if (urlPreset && VALID_PRESETS.includes(urlPreset)) {
      return computePresetDates(urlPreset).start;
    }
    const hStart = params.get('h_start');
    if (hStart) return hStart;

    // localStorage preset or stored dates
    const storedPreset = localStorage.getItem('historyPreset_v2');
    if (storedPreset && VALID_PRESETS.includes(storedPreset)) {
      return computePresetDates(storedPreset).start;
    }
    const storedStart = localStorage.getItem('historyStartDate_v2');
    if (storedStart) return storedStart;

    return computePresetDates('7').start;
  });

  const [historyEndDate, setHistoryEndDate] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    // URL preset takes priority
    const urlPreset = params.get('h_preset');
    if (urlPreset && VALID_PRESETS.includes(urlPreset)) {
      return computePresetDates(urlPreset).end;
    }
    const hEnd = params.get('h_end');
    if (hEnd) return hEnd;

    // localStorage preset or stored dates
    const storedPreset = localStorage.getItem('historyPreset_v2');
    if (storedPreset && VALID_PRESETS.includes(storedPreset)) {
      return computePresetDates(storedPreset).end;
    }
    const storedEnd = localStorage.getItem('historyEndDate_v2');
    if (storedEnd) return storedEnd;

    return computePresetDates('7').end;
  });

  const [brushIndices, setBrushIndices] = useState(null); // Controlled state for Brush
  // True only while a slider handle is actively dragged. Used as a *stable* error-
  // boundary reset signal: it flips at most twice per gesture (down/up), never
  // per-frame, so a transient chart throw can't drive a catch->reset->rethrow loop
  // that escalates ("Maximum update depth") past the chart boundary to the root.
  const [isBrushing, setIsBrushing] = useState(false);
  const [activeChartGroupId, setActiveChartGroupId] = useState(null);
  // Timeline window shared via URL (br_start/br_end). Parsed once, applied to the
  // brush on first data load, then normal default-window behavior resumes.
  const initialBrushDates = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get('br_start'), e = p.get('br_end');
    return s && e ? { s, e } : null;
  }, []);
  const previousPricesRef = React.useRef([]);

  // NOTE: the URL-sync effect lives further down (just before `return`) so it can
  // reference chartDataFinal/brushIndices for the timeline (br_start/br_end) params.

  // Persist showDiscounts preference
  useEffect(() => {
    localStorage.setItem('showDiscounts', String(showDiscounts));
  }, [showDiscounts]);

  // NOTE: initial language is resolved once in i18n.js (getInitialLanguage:
  // URL `lang` → localStorage → 'en') BEFORE React mounts. A second
  // read-and-changeLanguage effect used to live here, but it fought the URL-sync
  // effect below (which writes `lang`/localStorage FROM i18n.language): on a
  // language switch the two never reached a fixed point and ping-ponged
  // ru→en→ru… until React's update-depth limiter crashed the app. Keeping a
  // single source of truth (i18n.js for init, the dropdown for changes, URL-sync
  // for persistence) is what prevents that loop — do not re-add a language reader
  // that also calls changeLanguage.

  const fetchData = useCallback(async (forceScrape = false, showNotification = false) => {
    setLoading(true);
    setHistoryLoading(true);

    if (forceScrape) {
      try {
        // Public, rate-limited + persistently-debounced trigger. Unlike /scrape
        // (cron-only, CRON_SECRET), this lets the button do real work; the server
        // skips the outbound scrape when data is already fresh (<5 min).
        await axios.get(`${API_BASE}/refresh`);
      } catch (err) {
        console.error(err);
      }
    }

    // Retry a GET once after a short pause. A single transient blip (timeout, brief
    // network drop) otherwise leaves a view showing stale data with no indication —
    // the failure mode that made the price-card-vs-analytics mismatch look like a bug.
    const getWithRetry = (url, opts) =>
      axios.get(url, opts).catch(() =>
        new Promise(r => setTimeout(r, 1500)).then(() => axios.get(url, opts))
      );

    const latestPromise = getWithRetry(`${API_BASE}/prices/latest`, { timeout: 15000 })
      .then(latestRes => {
        const newPrices = latestRes.data;

        // Build the refresh notification: diff keyed by (station, fuel group) so
        // each line is one unambiguous station+fuel, grouped under its provider,
        // and only fuels that actually moved are shown. Matching by `type` alone
        // (the old way) collapsed the four stations together and listed every
        // unchanged fuel — see the redesigned Toast.
        if (showNotification && previousPricesRef.current.length > 0) {
          const prev = previousPricesRef.current;
          const CHANGE_THRESHOLD = 0.0005; // ≥0.1¢ once rounded; ignores float noise
          const byStation = new Map(); // source -> [{ fuelId, diff, newPrice }]

          newPrices.forEach(np => {
            const source = np.source || 'Neste';
            const fuelId = fuelGroupId(np);
            const old = prev.find(p => (p.source || 'Neste') === source && fuelGroupId(p) === fuelId);
            if (!old) return;
            const diff = np.price - old.price;
            if (Math.abs(diff) < CHANGE_THRESHOLD) return;
            if (!byStation.has(source)) byStation.set(source, []);
            byStation.get(source).push({ fuelId, diff, newPrice: np.price });
          });

          // Order groups by station, fuels within a group canonically.
          const groups = STATION_ORDER
            .filter(src => byStation.has(src))
            .map(src => ({
              source: src,
              label: STATIONS[src].label,
              color: STATIONS[src].color,
              items: byStation.get(src).sort(
                (a, b) => FUEL_GROUP_IDS.indexOf(a.fuelId) - FUEL_GROUP_IDS.indexOf(b.fuelId)
              ),
            }));

          if (groups.length > 0) {
            const net = groups.reduce((s, g) => s + g.items.reduce((t2, i) => t2 + i.diff, 0), 0);
            setNotification({
              kind: 'changed',
              dir: net < -0.0001 ? 'down' : net > 0.0001 ? 'up' : 'mixed',
              groups,
            });
          } else {
            setNotification({ kind: 'nochange' });
          }
        }

        previousPricesRef.current = newPrices;

        setLatestPrices(newPrices);
        if (newPrices.length > 0) {
          setLastCheck(newPrices[0].timestamp);
        }
      })
      .catch(err => {
        console.error(err);
        // Surface a manual refresh failure instead of silently keeping old data.
        if (showNotification) setNotification({ kind: 'error' });
      })
      .finally(() => setLoading(false));

    const historyPromise = getWithRetry(`${API_BASE}/prices/history`, { timeout: 15000 })
      .then(historyRes => {
        setHistoryData(historyRes.data);
        setHistoryError(false);
      })
      .catch(err => {
        console.error(err);
        setHistoryError(true);
      })
      .finally(() => setHistoryLoading(false));

    await Promise.all([latestPromise, historyPromise]);
    // No `t` dependency: all user-facing notification strings are now resolved in
    // the Toast component at render time, so fetchData no longer reads translations.
  }, []);

  const handleRefresh = async () => {
    await fetchData(true, true);
    setJustChecked(true);
    setTimeout(() => setJustChecked(false), 3000);
  };

  useEffect(() => {
    // Track when we last pulled fresh data so the focus/visibility handler below
    // can skip redundant refetches when the tab was only briefly hidden.
    let lastFetchAt = Date.now();
    const run = () => { lastFetchAt = Date.now(); fetchData(); };

    run();
    // Auto-refresh data every 15 minutes to catch automated backend updates.
    // setInterval is throttled/paused in background tabs and while the machine
    // sleeps, so it can't be relied on alone — the visibility handler covers
    // returning to a long-open tab.
    const interval = setInterval(run, 15 * 60 * 1000);

    // Refetch when the user returns to the tab (or refocuses the window) after
    // it's been idle a while. The 30-min cron may have produced newer prices
    // while the tab was backgrounded; 5 min throttles tab-flicking.
    const REFRESH_ON_FOCUS_AFTER = 5 * 60 * 1000;
    const refreshIfStale = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastFetchAt >= REFRESH_ON_FOCUS_AFTER) run();
    };
    document.addEventListener('visibilitychange', refreshIfStale);
    window.addEventListener('focus', refreshIfStale);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfStale);
      window.removeEventListener('focus', refreshIfStale);
    };
  }, [fetchData]);




  // Filter Data based on Interval and Group by Period (Day/Week/Month)
  // We keep a larger history window (e.g. 180 days) for the Brush, but the chart will default to showing recent data
  const chartData = useMemo(() => {
    if (!historyData.length) return [];

    const now = new Date();
    let cutoff = new Date();

    // Limit to exactly 1 year (365 days) back
    cutoff.setDate(now.getDate() - 365);

    // Filter by date first. Chart now covers ALL stations (one line per station
    // within each fuel chart); discount detection below stays Neste-based.
    const filteredByTime = historyData.filter(d => new Date(d.timestamp) >= cutoff);

    // Helper to get period key based on interval (always in Latvia/Riga timezone)
    const getPeriodKey = (timestamp) => {
      const { year, month, day } = getRigaDateParts(timestamp);
      if (graphInterval === 'days') {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      } else if (graphInterval === 'weeks') {
        // ISO week calculation using UTC Date to avoid DST-related day shifts
        const date = new Date(Date.UTC(year, month - 1, day));
        date.setUTCDate(date.getUTCDate() + 3 - (date.getUTCDay() + 6) % 7);
        const week1 = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
        const weekNumber = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getUTCDay() + 6) % 7) / 7);
        return `${date.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
      } else if (graphInterval === 'months') {
        return `${String(month).padStart(2, '0')}.${year}.`;
      }
      return timestamp;
    };

    // Helper to get a normalized UTC timestamp for a period key (for consistent sorting)
    // Uses Date.UTC so timestamps are immune to local-timezone DST shifts
    const getPeriodTimestamp = (periodKey) => {
      if (graphInterval === 'days') {
        const [year, month, day] = periodKey.split('-').map(Number);
        return Date.UTC(year, month - 1, day, 12, 0, 0);
      } else if (graphInterval === 'weeks') {
        const [year, weekStr] = periodKey.split('-W');
        const jan4 = new Date(Date.UTC(parseInt(year), 0, 4));
        const weekNum = parseInt(weekStr);
        const mondayOfWeek = new Date(jan4.getTime() + (weekNum - 1) * 7 * 86400000);
        mondayOfWeek.setUTCDate(mondayOfWeek.getUTCDate() - (mondayOfWeek.getUTCDay() + 6) % 7);
        return mondayOfWeek.getTime();
      } else if (graphInterval === 'months') {
        const parts = periodKey.split('.');
        const month = parseInt(parts[0]);
        const year = parseInt(parts[1]);
        return Date.UTC(year, month - 1, 15, 12, 0, 0);
      }
      return new Date(periodKey).getTime();
    };

    // Accumulate by period → composite series key `${fuelGroupId}__${source}`
    // (e.g. "95__Neste"). Each station gets its own line within a fuel chart.
    const periodData = new Map();

    filteredByTime.forEach(item => {
      const periodKey = getPeriodKey(item.timestamp);
      if (!periodData.has(periodKey)) periodData.set(periodKey, { series: {}, locations: [] });
      const period = periodData.get(periodKey);
      const ck = `${fuelGroupId(item)}__${stationKey(item)}`;
      if (!period.series[ck]) period.series[ck] = [];
      period.series[ck].push({ price: item.price, timestamp: item.timestamp });
      // Discount markers are a Neste signal — only collect Neste locations.
      if (item.location && (item.source || 'Neste') === 'Neste') period.locations.push(item.location);
    });

    // Neste series keys, used for the discount drop-gate below.
    const NESTE_KEYS = FUEL_GROUPS.map(g => `${g.id}__Neste`);

    const result = Array.from(periodData.entries()).map(([periodKey, data]) => {
      let formattedTime = periodKey;
      if (graphInterval === 'days') {
        const [year, month, day] = periodKey.split('-');
        formattedTime = `${day}.${month}.${year}`;
      } else if (graphInterval === 'weeks') {
        const timestamp = getPeriodTimestamp(periodKey);
        const start = new Date(timestamp);
        const end = new Date(timestamp + 6 * 24 * 60 * 60 * 1000);
        const startStr = start.toLocaleDateString('lv-LV', { timeZone: 'Europe/Riga', day: '2-digit', month: '2-digit', year: 'numeric' });
        const endStr = end.toLocaleDateString('lv-LV', { timeZone: 'Europe/Riga', day: '2-digit', month: '2-digit', year: 'numeric' });
        formattedTime = `${startStr} - ${endStr}`;
      }

      const entry = {
        date: getPeriodTimestamp(periodKey),
        periodKey,
        formattedTime,
        hasDiscountLocation: data.locations.some(l => DISCOUNT_MARKER_RE.test(l)),
        hasExternalDiscount: data.locations.some(l => EXTERNAL_DISCOUNT_RE.test(l)),
        isDiscount: false, // finalized in second pass after sorting
      };

      // Each station series → the period's LAST price (the plotted line value),
      // plus the intraday min/max (drawn as an ErrorBar whisker) and the list of
      // distinct within-day price changes with timestamps (shown in the
      // tooltip), so all updates within a day are visible like the pre-redesign
      // chart. Server-side dedup already collapses unchanged consecutive scrapes.
      Object.keys(data.series).forEach(ck => {
        const sortedItems = data.series[ck].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const prices = sortedItems.map(p => p.price);
        const last = prices[prices.length - 1];
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        entry[ck] = last;
        entry[`${ck}_min`] = min;
        entry[`${ck}_max`] = max;
        // Only attach a whisker range when the price actually moved within the
        // period; otherwise leave it unset so the ErrorBar draws nothing.
        if (max - min > 0.0001) entry[`${ck}_range`] = [last - min, max - last]; // [downErr, upErr] → min..max
        entry[`${ck}_history`] = sortedItems
          .filter((it, i, arr) => i === 0 || Math.abs(it.price - arr[i - 1].price) > 0.0001)
          .map(d => ({ price: d.price, timestamp: d.timestamp }));
      });

      return entry;
    });

    const sorted = result.sort((a, b) => a.date - b.date);

    // Finalize isDiscount (Neste-based). External confirmation is authoritative;
    // otherwise require the marker to be NEW (absent the previous period) and
    // any Neste fuel to drop ≥4¢ vs that period. The onset guard stops the
    // prices-page "uniform price" text from re-flagging days after a discount
    // ends (e.g. it lingered 2026-06-10→11, where post-discount settling looked
    // like a fresh 6¢ drop). No carry-forward.
    const MIN_DISCOUNT_DROP = 0.04;
    const EPSILON = 0.001;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].hasExternalDiscount) { sorted[i].isDiscount = true; continue; }
      if (i === 0 || !sorted[i].hasDiscountLocation) continue;
      const prev = sorted[i - 1];
      if (prev.hasDiscountLocation) continue; // marker lingering from a prior day, not a fresh onset
      const curr = sorted[i];
      const anyFuelDropped = NESTE_KEYS.some(k => {
        const prevPrice = prev[k];
        const currPrice = curr[k];
        if (prevPrice === undefined || currPrice === undefined) return false;
        return (prevPrice - currPrice) >= MIN_DISCOUNT_DROP - EPSILON;
      });
      sorted[i].isDiscount = anyFuelDropped;
    }

    return sorted;
  }, [historyData, graphInterval]);

  // Which fuel charts / station lines to render, honoring the global filters.
  const chartGroups = useMemo(() => {
    return FUEL_GROUPS
      .filter(g => analyticsFuels.has(g.id))
      .map(g => {
        const stations = STATION_ORDER.filter(src =>
          selectedStations.has(src) &&
          chartData.some(d => typeof d[`${g.id}__${src}`] === 'number')
        );
        return { ...g, stations };
      })
      .filter(g => g.stations.length > 0);
  }, [chartData, analyticsFuels, selectedStations]);

  // Shared legend: stations present across the visible fuel charts.
  const chartStations = useMemo(() => {
    const present = new Set();
    chartGroups.forEach(g => g.stations.forEach(s => present.add(s)));
    return STATION_ORDER.filter(s => present.has(s));
  }, [chartGroups]);





  const chartDataFinal = chartData;

  // Slice visible data based on timeline slider indices. The charts read a
  // DEFERRED copy of the brush window: during a fast drag React may skip/interrupt
  // intermediate chart renders (reusing the previous slice) while the slider thumb
  // still tracks the live `brushIndices`. This collapses the per-frame re-render
  // pressure on the 5 Recharts trees that was the proximate crash trigger, without
  // changing the live-during-drag behavior the user sees.
  const deferredBrush = useDeferredValue(brushIndices);
  const visibleChartData = useMemo(() => {
    if (!chartDataFinal || !deferredBrush) return chartDataFinal;
    return chartDataFinal.slice(deferredBrush.startIndex, deferredBrush.endIndex + 1);
  }, [chartDataFinal, deferredBrush]);

  // Sync Brush indices when data or interval changes during render
  // This avoids extra render cycles and lint errors associated with useEffect
  const [lastConfig, setLastConfig] = useState({ length: 0, interval: '' });
  if (chartDataFinal && (chartDataFinal.length !== lastConfig.length || graphInterval !== lastConfig.interval)) {
    const isFirstDataLoad = lastConfig.length === 0;
    setLastConfig({ length: chartDataFinal.length, interval: graphInterval });

    let defaultVisibleCount = 30; // default for days
    if (graphInterval === 'weeks') defaultVisibleCount = 4;
    if (graphInterval === 'months') defaultVisibleCount = 3;

    // On the first data load, honor a timeline window shared via the URL
    // (br_start/br_end → indices). Afterwards fall back to the default window.
    if (initialBrushDates && isFirstDataLoad && chartDataFinal.length) {
      const lastIdx = chartDataFinal.length - 1;
      let startIndex = chartDataFinal.findIndex((p) => fmtRigaYmd(p.date) >= initialBrushDates.s);
      if (startIndex < 0) startIndex = 0;
      let endIndex = lastIdx;
      for (let i = lastIdx; i >= 0; i--) {
        if (fmtRigaYmd(chartDataFinal[i].date) <= initialBrushDates.e) { endIndex = i; break; }
      }
      startIndex = Math.min(Math.max(0, startIndex), lastIdx);
      endIndex = Math.min(Math.max(0, endIndex), lastIdx);
      if (endIndex < startIndex) endIndex = startIndex;
      if (endIndex - startIndex < 6) endIndex = Math.min(lastIdx, startIndex + 6); // Brush min span
      setBrushIndices({ startIndex, endIndex });
    } else {
      setBrushIndices({
        startIndex: Math.max(0, chartDataFinal.length - defaultVisibleCount),
        endIndex: chartDataFinal.length - 1
      });
    }
  }

  const handleBrushChange = (newIndex) => {
    if (newIndex && newIndex.startIndex !== undefined) {
      setBrushIndices({ startIndex: newIndex.startIndex, endIndex: newIndex.endIndex });
    }
  };

  // Sync state to URL and localStorage. Lives here (not with the other state) so it
  // can read chartDataFinal/brushIndices for the timeline (br_start/br_end) params.
  useEffect(() => {
    // Create fresh params to avoid keeping deprecated parameters
    const params = new URLSearchParams();

    // Sync Language — persist to localStorage always, but omit the default ('en')
    // from the URL so a fresh visit stays clean.
    const currentLang = i18n.language;
    if (currentLang) {
      localStorage.setItem('i18nextLng', currentLang);
      if (currentLang !== 'en') params.set('lang', currentLang);
    }

    // Sync Discounts — default is 'on', so only write the param when toggled off.
    if (!showDiscounts) params.set('discounts', 'off');

    // Sync History Filters — use preset param when active, concrete dates otherwise.
    // The default preset ('7') is omitted from the URL to keep a fresh visit clean.
    if (historyPreset) {
      localStorage.setItem('historyPreset_v2', historyPreset);
      if (historyPreset !== '7') params.set('h_preset', historyPreset);
    } else {
      localStorage.removeItem('historyPreset_v2');
      if (historyStartDate && historyEndDate) {
        params.set('h_start', historyStartDate);
        params.set('h_end', historyEndDate);
      }
    }
    localStorage.setItem('historyStartDate_v2', historyStartDate);
    localStorage.setItem('historyEndDate_v2', historyEndDate);

    // Sync station / fuel filters — omit the param when all are selected so the
    // default state keeps the URL clean.
    const allStations = STATION_ORDER.every((s) => selectedStations.has(s));
    if (allStations) {
      localStorage.removeItem('selectedStations');
    } else {
      const v = STATION_ORDER.filter((s) => selectedStations.has(s)).join(',');
      params.set('stations', v);
      localStorage.setItem('selectedStations', v);
    }
    const allFuels = FUEL_GROUP_IDS.every((f) => selectedFuels.has(f));
    if (allFuels) {
      localStorage.removeItem('selectedFuels');
    } else {
      const v = FUEL_GROUP_IDS.filter((f) => selectedFuels.has(f)).join(',');
      params.set('fuels', v);
      localStorage.setItem('selectedFuels', v);
    }

    // Sync the active Analytics fuel selection — only meaningful when there is more
    // than one fuel to switch between (otherwise the control is hidden).
    const selectedAvailable = analyticsFuelList.filter((id) => analyticsFuelSelection.has(id));
    const allAnalyticsSelected = analyticsFuelList.length > 0 && selectedAvailable.length === analyticsFuelList.length;
    if (analyticsFuelList.length > 1 && !allAnalyticsSelected && selectedAvailable.length) {
      params.set('afuel', selectedAvailable.join(','));
    }

    // Sync the chart timeline window as dates — omit when it's the default
    // (last 30 days / full range) so the URL stays clean.
    if (brushIndices && chartDataFinal && chartDataFinal.length) {
      const dStart = Math.max(0, chartDataFinal.length - 30);
      const dEnd = chartDataFinal.length - 1;
      if (!(brushIndices.startIndex === dStart && brushIndices.endIndex === dEnd)) {
        const sPoint = chartDataFinal[brushIndices.startIndex];
        const ePoint = chartDataFinal[brushIndices.endIndex];
        if (sPoint && ePoint) {
          params.set('br_start', fmtRigaYmd(sPoint.date));
          params.set('br_end', fmtRigaYmd(ePoint.date));
        }
      }
    }

    const qs = params.toString().replace(/%2C/g, ',');
    const newRelativePathQuery = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', newRelativePathQuery);
  }, [i18n.language, showDiscounts, historyStartDate, historyEndDate, historyPreset, selectedStations, selectedFuels, analyticsFuelSelection, analyticsFuelList, brushIndices, chartDataFinal]);

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-gray-900 pb-24">

      {/* Toast Notification */}
      <Toast
        notification={notification}
        onDismiss={() => setNotification(null)}
        onRetry={handleRefresh}
        t={t}
      />

      {/* Header — in normal flow; it scrolls away (the sticky filter bar below
          is the single persistent control). `relative z-40` lifts the header's
          stacking context above the sticky filter bar (z-30) so the language
          dropdown overlays it instead of opening underneath. */}
      <header className="relative z-40 bg-white/95 backdrop-blur-xl border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between py-5">
          <a
            href="/"
            className="font-bold text-gray-900 tracking-tight hover:text-gray-600 transition-colors duration-300 ease-out cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis mr-4 text-xl sm:text-2xl leading-tight motion-reduce:transition-none"
          >
            {t('app_title')}
          </a>
          <LanguageDropdown
            lngs={lngs}
            currentLng={i18n.language}
            onChange={(val) => i18n.changeLanguage(val)}
            compact={false}
          />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-6 pt-4 sm:pt-6 pb-10 space-y-8">

        {/* Sticky global filter bar — the single persistent control; scopes BOTH
            the prices view and all of analytics. Pinned to the viewport top for the
            entire scroll (first child of <main>, the scroll container). */}
        {latestPrices.length > 0 && (
          <div className={clsx(
            "sticky top-0 z-30 bg-white/95 backdrop-blur-xl rounded-2xl border border-gray-200 shadow-[0_1px_8px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03)] px-3 sm:px-4 transition-[padding] duration-300 ease-out motion-reduce:transition-none",
            filtersCompact ? "py-2 sm:py-2.5" : "py-3 sm:py-4"
          )}>
            <div className={clsx(
              "flex items-center gap-2 overflow-hidden transition-all duration-300 ease-out motion-reduce:transition-none",
              filtersCompact ? "max-h-0 opacity-0 mb-0" : "max-h-8 opacity-100 mb-2"
            )}>
              <h2 className="text-sm sm:text-base font-semibold text-gray-900">
                {t('interested_in')}
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <MultiSelect
                label={t('station_filter')}
                allLabel={t('all')}
                compact={filtersCompact}
                options={presentStations.map((s) => ({ value: s, label: STATIONS[s].label, color: STATIONS[s].color }))}
                selected={selectedStations}
                onToggle={toggleStation}
                onToggleAll={() => {
                  const allOn = presentStations.every((s) => selectedStations.has(s));
                  setSelectedStations(new Set(allOn ? [] : presentStations));
                }}
                onSelectOnly={(v) => setSelectedStations(new Set([v]))}
              />
              <MultiSelect
                label={t('fuel_filter')}
                allLabel={t('all')}
                align="end"
                compact={filtersCompact}
                options={presentFuels.map((g) => ({ value: g.id, label: t(g.labelKey), color: g.color }))}
                selected={selectedFuels}
                onToggle={toggleFuel}
                onToggleAll={() => {
                  const allOn = presentFuels.every((g) => selectedFuels.has(g.id));
                  setSelectedFuels(new Set(allOn ? [] : presentFuels.map((g) => g.id)));
                }}
                onSelectOnly={(v) => setSelectedFuels(new Set([v]))}
              />
            </div>
          </div>
        )}

        {/* Fuel Prices */}
        <section>
          <Card className="p-3 sm:p-6">
            {lastCheck && (
              <div className="flex items-center justify-start gap-1.5 sm:gap-2 text-gray-400 mb-2">
                <span className="text-[10px] sm:text-xs font-medium">
                  {justChecked
                    ? t('checked_just_now')
                    : `${t('updated')}: ${new Date(lastCheck).toLocaleString(i18n.language === 'en' ? 'en-GB' : i18n.language, {
                        timeZone: 'Europe/Riga',
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}`}
                </span>
                <button
                  onClick={handleRefresh}
                  disabled={loading}
                  className="group flex items-center justify-center p-1.5 rounded-full hover:bg-gray-200/50 active:scale-90 transition-all"
                  title={t('refresh')}
                >
                  <RefreshCw
                    className={clsx(
                      "w-3 h-3 sm:w-3.5 sm:h-3.5 transition-colors",
                      loading ? "animate-spin text-blue-600" : "group-hover:text-gray-600"
                    )}
                  />
                </button>
              </div>
            )}

            {loading && latestPrices.length === 0 ? (
              <div className="space-y-3">
                <FuelCardSkeleton />
                <FuelCardSkeleton />
                <FuelCardSkeleton />
                <FuelCardSkeleton />
              </div>
            ) : fuelGroups.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {fuelGroups.map(({ group, rows }) => (
                  <FuelGroupBlock key={group.id} group={group} rows={rows} />
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-400 py-10">
                {t('no_data')}
              </div>
            )}
            <div className="mt-3 sm:mt-4">
              <p className="text-[10px] text-gray-400 font-medium flex items-start sm:items-center gap-1.5 max-w-2xl leading-tight">
                <Info size={11} className="shrink-0 mt-[1px] sm:mt-0" strokeWidth={1.5} />
                <span>{t('current_prices_disclaimer')}</span>
              </p>
            </div>
          </Card>
        </section>

        {/* Analytics — Graph, Dynamics and Price History share one card. The sticky
            header carries the fuel tabs that scope all three subsections; it sticks
            just below the fixed app header (compact height ≈55px) while scrolling.
            Tabs only offer fuels picked in the global filter; hidden when a single
            fuel is selected. */}
        <section>
          <Card className="p-0">
            <div className="rounded-t-2xl border-b border-gray-100 px-3 sm:px-6 py-2.5 sm:py-3">
              {/* Title + one fuel-type segmented control scoping all three
                  subsections (Graph / Dynamics / Price History). Tabs offer only
                  the globally-filtered fuels; hidden when a single fuel is left. */}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <TrendingUp className="w-4 h-4 text-gray-400 shrink-0" />
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate">{t('analytics')}</h2>
                </div>
                {analyticsFuelList.length > 1 && (
                  <div className="w-28 sm:w-36 shrink-0">
                    <MultiSelect
                      label={t('fuel_filter')}
                      allLabel={t('all')}
                      align="end"
                      compact
                      options={analyticsFuelList.map((id) => ({
                        value: id,
                        label: t(FUEL_GROUPS.find((g) => g.id === id).labelKey),
                      }))}
                      selected={analyticsFuelSelection}
                      onToggle={toggleAnalyticsFuel}
                      onToggleAll={() => setAnalyticsFuelSelection(new Set(analyticsFuelList))}
                      onSelectOnly={(v) => setAnalyticsFuelSelection(new Set([v]))}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Soft hint when the latest history refresh failed (after retry): the
                analytics below still shows the previous data, so flag it as stale
                rather than passing it off as current. Offers a manual retry. */}
            {historyError && (
              <div className="mx-3 sm:mx-6 mt-3 flex items-center justify-between gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800">
                <div className="flex items-center gap-2 min-w-0">
                  <Info className="w-4 h-4 shrink-0" />
                  <span className="text-[11px] sm:text-xs font-medium truncate">{t('history_stale')}</span>
                </div>
                <button
                  onClick={handleRefresh}
                  disabled={historyLoading}
                  className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold shrink-0 hover:text-amber-900 active:scale-95 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={clsx('w-3.5 h-3.5', historyLoading && 'animate-spin')} />
                  {t('retry')}
                </button>
              </div>
            )}

            {/* Subsection: Graph */}
            <div className="px-3 sm:px-6 pt-4 sm:pt-5 pb-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-2">
                <ChartSpline className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <h3 className="text-sm sm:text-base font-semibold text-gray-700">{t('history')}</h3>
              </div>

              {/* Discount Toggle — the chart is always day-granularity now */}
              <button
                onClick={() => setShowDiscounts(prev => !prev)}
                className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
              >
                <span>{t('discounts')}</span>
                <div
                  className={clsx(
                    'relative w-9 h-5 rounded-full transition-colors duration-200',
                    !showDiscounts && 'bg-gray-300'
                  )}
                  style={{ backgroundColor: showDiscounts ? DISCOUNT_COLOR : undefined }}
                >
                  <div
                    className={clsx(
                      'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200',
                      showDiscounts ? 'translate-x-[18px]' : 'translate-x-0.5'
                    )}
                  />
                </div>
              </button>
            </div>


            {/* Timeline Slider — above the chart. Wrapped in its own boundary so
                a render fault here degrades to nothing instead of the whole app,
                and auto-recovers on the next data/brush change. */}
            {chartDataFinal && chartDataFinal.length > 0 && brushIndices && (
              <ErrorBoundary
                resetKeys={[chartDataFinal.length, selectedStations, effectiveAnalyticsFuels, isBrushing]}
                fallback={null}
              >
                <TimelineSlider
                  data={chartDataFinal}
                  startIndex={brushIndices.startIndex}
                  endIndex={brushIndices.endIndex}
                  onChange={handleBrushChange}
                  onBrushStart={() => setIsBrushing(true)}
                  onBrushEnd={() => setIsBrushing(false)}
                  graphInterval={graphInterval}
                />
              </ErrorBoundary>
            )}

            {/* Per-fuel charts — one line per selected station, shared zoom + discount shading */}
            <div className="relative">
              {historyLoading && <ChartLoadingOverlay />}
              {historyData.length > 0 && chartGroups.length > 0 ? (
                <div className="space-y-4">
                  {chartGroups.filter(group => effectiveAnalyticsFuels.has(group.id)).map(group => (
                    <ErrorBoundary
                      key={group.id}
                      resetKeys={[chartDataFinal.length, selectedStations, effectiveAnalyticsFuels, showDiscounts, isBrushing]}
                      fallback={<div className="h-[140px] w-full" aria-hidden="true" />}
                    >
                    <div onTouchStart={() => setActiveChartGroupId(group.id)}>
                    <FuelTrendChart
                      group={group}
                      visibleData={visibleChartData}
                      chartDataFinal={chartDataFinal}
                      graphInterval={graphInterval}
                      showDiscounts={showDiscounts}
                      t={t}
                      isActiveChart={activeChartGroupId === null || activeChartGroupId === group.id}
                    />
                    </div>
                    </ErrorBoundary>
                  ))}
                  {/* Shared station legend */}
                  <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-3 mt-1 border-t border-gray-100">
                    {chartStations.map(src => (
                      <span key={src} className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: (STATIONS[src] || {}).color }} />
                        <span className="text-[11px] sm:text-xs font-semibold text-gray-700">{(STATIONS[src] || {}).label || src}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : historyData.length > 0 ? (
                <div className="text-center text-gray-400 py-10 text-sm">{t('no_data')}</div>
              ) : null}
            </div>
            </div>

            {/* Subsection: Dynamics */}
            <div className="px-3 sm:px-6 py-5 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <CircleGauge className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <h3 className="text-sm sm:text-base font-semibold text-gray-700">
                  {t('insights.title')}
                </h3>
              </div>
              {historyLoading && historyData.length === 0 ? (
                <InsightsSkeleton />
              ) : (
                <Suspense fallback={<InsightsSkeleton />}>
                  <PriceChangeCards groups={insightsGroups.filter(g => effectiveAnalyticsFuels.has(g.id))} />
                </Suspense>
              )}
            </div>

            {/* Subsection: Price History table */}
            <div className="px-3 sm:px-6 py-5 border-t border-gray-100">
              <HistoryTable
                historyData={historyData}
                t={t}
                startDate={historyStartDate}
                endDate={historyEndDate}
                onStartDateChange={setHistoryStartDate}
                onEndDateChange={setHistoryEndDate}
                onPresetChange={setHistoryPreset}
                activePreset={historyPreset}
                loading={historyLoading}
                selectedStations={selectedStations}
                selectedFuels={effectiveAnalyticsFuels}
              />
            </div>
          </Card>
        </section>

        <div className="h-8" />

      </main>
    </div >
  );
}
