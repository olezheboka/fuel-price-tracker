import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import "react-day-picker/src/style.css";
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, ErrorBar, ReferenceArea } from 'recharts';
import { useTranslation } from 'react-i18next';
// framer-motion removed
import { Calendar, RefreshCw, MapPin, Info, X, TrendingUp, TrendingDown, Minus, BarChart3, ChevronDown, ChevronUp, Copy, Check, AlertTriangle, Calculator, History, ChartSpline, Diff, Grid3X3, CircleGauge, CircleSlash2, FileSpreadsheet } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
const PriceChangeCards = lazy(() => import('./InsightsPanel'));
import { DateRangePicker } from './components/ui/DatePicker';
import CustomTooltip from './CustomTooltip';

const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:3000/api';
console.log('[DEBUG] API_BASE:', API_BASE, 'PROD:', import.meta.env.PROD);

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

const lngs = {
  lv: { nativeName: 'Latviešu', flag: '🇱🇻' },
  ru: { nativeName: 'Русский', flag: '🇷🇺' },
  en: { nativeName: 'English', flag: '🇬🇧' }
};

const FUEL_URL_MAP = {
  '95': 'Neste Futura 95',
  '98': 'Neste Futura 98',
  'diesel': 'Neste Futura D',
  'pro': 'Neste Pro Diesel',
};

const FUEL_TO_URL = Object.fromEntries(
  Object.entries(FUEL_URL_MAP).map(([k, v]) => [v, k])
);

// Apple-style Segmented Control
const SegmentedControl = ({ options, value, onChange, className, size = 'default' }) => {
  const [styles, setStyles] = useState({ left: 0, width: 0, opacity: 0 });
  const buttonsRef = React.useRef([]);

  React.useLayoutEffect(() => {
    const update = () => {
      const activeIndex = options.findIndex(opt => opt.value === value);
      if (activeIndex !== -1 && buttonsRef.current[activeIndex]) {
        const btn = buttonsRef.current[activeIndex];
        setStyles({
          left: btn.offsetLeft,
          width: btn.offsetWidth,
          opacity: 1
        });
      } else {
        setStyles(prev => ({ ...prev, opacity: 0 }));
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [value, options]);

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
  const LanguageDropdown = ({ lngs, currentLng, onChange }) => {
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
          className="flex items-center gap-2 px-3 py-2 bg-gray-100/80 hover:bg-gray-200/80 rounded-xl transition-all duration-200 text-sm font-semibold text-gray-900 border border-transparent active:scale-95 shadow-sm"
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
                  "w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200",
                  isActive ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-100/80 hover:text-gray-900"
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
  <div className={twMerge("bg-white rounded-2xl p-5", className)}>
    {children}
  </div>
);

const Skeleton = ({ className }) => (
  <div className={twMerge("animate-pulse rounded-md bg-gray-200", className)} />
);

const FuelCardSkeleton = () => (
  <div className="rounded-xl p-3 sm:p-4 border-l-4 border-l-gray-200 bg-[#FCFCFD] shadow-sm ring-1 ring-gray-100">
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

const HistorySummarySkeleton = () => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-5">
    {[1, 2, 3, 4].map(i => (
      <div key={i} className="rounded-xl p-3 sm:p-4 border-l-4 border-l-gray-200 bg-[#FCFCFD] shadow-sm ring-1 ring-gray-100">
        <Skeleton className="h-3 w-12 mb-1" />
        <Skeleton className="h-7 w-24 mb-1.5" />
        <Skeleton className="h-4 w-20 rounded-full mb-2" />
        <div className="flex gap-3 pt-2 border-t border-gray-50">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
        </div>
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

const Toast = ({ notification, onDismiss, t }) => {
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        onDismiss();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification, onDismiss]);

  return (
    <div
      className={clsx(
        "fixed top-[45vh] md:top-[130px] inset-x-0 mx-auto z-[100] max-w-sm w-[calc(100%-2rem)] sm:w-[92%] transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]",
        notification ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-8 scale-90 pointer-events-none"
      )}
    >
      <div
        className="bg-white/95 rounded-[22px] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] overflow-hidden border border-gray-200/60"
      >
        <div className="p-3 sm:p-4">
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Icon */}
            {(() => {
              const netDiff = notification?.changes?.reduce((sum, c) => sum + c.diff, 0) ?? 0;
              const isUp = notification?.hasChanges && netDiff > 0.0001;
              const isDown = notification?.hasChanges && netDiff < -0.0001;
              return (
                <div className={`flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center ${isUp ? 'bg-red-50' : isDown ? 'bg-green-50' : 'bg-gray-100'}`}>
                  {isUp ? (
                    <TrendingUp size={16} className="text-red-500 sm:w-[18px] sm:h-[18px]" strokeWidth={2.5} />
                  ) : isDown ? (
                    <TrendingDown size={16} className="text-green-600 sm:w-[18px] sm:h-[18px]" strokeWidth={2.5} />
                  ) : (
                    <Info size={16} className="text-gray-500 sm:w-[18px] sm:h-[18px]" strokeWidth={2.5} />
                  )}
                </div>
              );
            })()}

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-[14px] sm:text-[15px] font-semibold text-gray-900 leading-tight">
                {notification?.title}
              </p>
              {notification?.changes && notification.changes.length > 0 ? (
                <div className="mt-1.5 space-y-1">
                  {notification.changes.map((change, i) => {
                    let textKey = 'notification.item_unchanged';
                    if (change.diff > 0.0001) textKey = 'notification.item_increased';
                    if (change.diff < -0.0001) textKey = 'notification.item_decreased';

                    return (
                      <div key={i} className="flex items-center gap-1.5 text-[12px] sm:text-[13px]">
                        <span className={`font-medium ${change.diff > 0.0001 ? 'text-red-500' :
                          change.diff < -0.0001 ? 'text-green-600' : 'text-gray-600'
                          }`}>
                          {t(textKey, {
                            fuel: change.fuel,
                            diff: Math.abs(change.diff * 100).toFixed(1)
                          })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[12px] sm:text-[13px] text-gray-500 mt-0.5 leading-tight">{notification?.message}</p>
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
            className={clsx(
              "h-full bg-gray-300 transition-all duration-[5000ms] ease-linear",
              notification ? "w-full" : "w-0"
            )}
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

const AddressChip = ({ addr, url }) => {
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
    <span className="relative inline-flex items-center gap-0.5">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center text-gray-500 hover:text-blue-600 transition-colors"
      >
        <MapPin size={10} className="text-green-500 shrink-0 mr-1" />
        <span className="underline underline-offset-2">{addr}</span>
      </a>
      <button
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
      </button>
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

const FuelCard = ({ type, price, location }) => {
  const { t } = useTranslation();

  // Parse addresses from pipe-separated string
  let addressList = [];
  // True when the location field is a "same price everywhere" marker rather than
  // a list of specific station addresses. Covers all observed phrasings:
  //   • old price-page:  "Visās stacijās cenas vienādas" / "…cena vienāda"
  //   • current page:    "Visās degvielas uzpildes stacijās"
  //   • homepage/IG:     "Visās Neste DUS degvielai samazināta cena (homepage)"
  const isAllStationsSamePrice = location && (
    /vienād/i.test(location) || DISCOUNT_MARKER_RE.test(location)
  );
  if (isAllStationsSamePrice) {
    addressList = [t('all_stations_same_price')];
  } else if (location && location.trim().length > 0) {
    addressList = location.split(/\|/).map(s => s.trim()).filter(s => s.length > 0);
  }

  const color = FUEL_COLORS[type] || FUEL_COLORS['Neste Futura 95'];

  return (
    <div
      className="rounded-xl p-3 sm:p-4 border-l-4 bg-[#FCFCFD] shadow-sm ring-1 ring-gray-100"
      style={{ borderLeftColor: color }}
    >
      <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1" style={{ color }}>
        {t(type.replace('Neste ', ''))}
      </p>
      <p className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
        €{price.toFixed(3)}
        <span className="text-xs sm:text-sm text-gray-400 font-medium ml-1">/ {t('liter_short')}</span>
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 pt-2 border-t border-gray-50 text-[10px] text-gray-500 font-medium">
        {addressList.length > 0 ? (
          addressList.map((addr, i) => {
            const url = isAllStationsSamePrice
              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Neste DUS, Rīga, Latvia')}`
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Neste ${addr}, Rīga, Latvia`)}`;
            return <AddressChip key={i} addr={addr} url={url} />;
          })
        ) : (
          <span className="text-gray-400 italic">{t('location')}</span>
        )}
      </div>
    </div>
  );
};

// Calculate trend line helper
const calculateTrendLine = (data, dataKey) => {
  if (!data || data.length < 2) return null;

  // const n = data.length; // unused
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  // Map data points to index (x) and value (y)
  const points = data.map((d, i) => {
    const val = parseFloat(d[dataKey]);
    if (isNaN(val)) return null;
    return { x: i, y: val };
  }).filter(p => p !== null);

  if (points.length < 2) return null;

  points.forEach(p => {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  });

  const count = points.length;
  // Linear regression formula: y = mx + c
  const slope = (count * sumXY - sumX * sumY) / (count * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / count;

  // Return mapped data with trend values
  return data.map((d, i) => ({
    ...d,
    [`${dataKey}_trend`]: slope * i + intercept
  }));
};

// Custom Timeline Slider — matches Apple-style spec from screenshot
const TimelineSlider = ({ data, startIndex, endIndex, onChange, graphInterval }) => {
  const trackRef = React.useRef(null);
  const dragRef = React.useRef(null); // Stores drag state

  const totalCount = data.length;
  if (totalCount === 0) return null;

  // Minimum span based on interval mode
  const minSpan = graphInterval === 'days' ? 6 : 0; // 7 days min for 'days', 1 item min for others (0-indexed)

  const dataSpan = endIndex - startIndex;
  const dataWidthPct = ((dataSpan + 1) / totalCount) * 100;
  const effectiveWidthPct = Math.max(dataWidthPct, 30); // Minimum 30% to fit date label

  // Map data position proportionally to the available visual travel range
  // so the thumb moves smoothly from left edge to right edge
  const travelRange = 100 - effectiveWidthPct;
  const maxStartIndex = totalCount - dataSpan - 1;
  const effectiveLeftPct = maxStartIndex > 0 ? (startIndex / maxStartIndex) * travelRange : 0;

  // Format the date range label
  const startDate = data[startIndex]?.date ? new Date(data[startIndex].date) : null;
  const endDate = data[endIndex]?.date ? new Date(data[endIndex].date) : null;
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
        onChange(clampIndices(newStart, newEnd));
      } else if (drag.mode === 'left') {
        onChange(clampIndices(drag.origStart + deltaIdx, drag.origEnd));
      } else if (drag.mode === 'right') {
        onChange(clampIndices(drag.origStart, drag.origEnd + deltaIdx));
      }
    };

    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
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
  showDiscounts
}) => {
  const { i18n } = useTranslation();
  const allFuelTypes = FUEL_KEYS;
  const avgSelectedFuels = allFuelTypes;
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



  // Dynamic names
  const currentLang = i18n?.language || 'en';
  const now = new Date();
  const thisMonthNameRaw = now.toLocaleString(currentLang, { month: 'long' });
  const thisMonthName = thisMonthNameRaw.charAt(0).toUpperCase() + thisMonthNameRaw.slice(1);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthNameRaw = lastMonthDate.toLocaleString(currentLang, { month: 'long' });
  const lastMonthName = lastMonthNameRaw.charAt(0).toUpperCase() + lastMonthNameRaw.slice(1);

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

  const setThisMonth = () => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    const s = toYMD(start.getTime());
    const e = toYMD(end.getTime());
    onStartDateChange(s);
    onEndDateChange(e);
    onPresetChange?.('thisMonth');
  };

  const setLastMonth = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    const s = toYMD(start.getTime());
    const e = toYMD(end.getTime());
    onStartDateChange(s);
    onEndDateChange(e);
    onPresetChange?.('lastMonth');
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
    
    // Group into days
    const dayMap = new Map();
    historyData.forEach(e => {
        const dateKey = toYMD(e.timestamp);
        if (!dayMap.has(dateKey)) {
            const { year, month, day } = getRigaParts(e.timestamp);
            dayMap.set(dateKey, {
                dateKey,
                // Using requested shortened date format: dd.mm.yy
                timeStr: `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${String(year).slice(-2)}`,
                rawFuels: {},
                hasDiscountLocation: false
            });
        }
        const dayData = dayMap.get(dateKey);
        if (!dayData.rawFuels[e.type]) dayData.rawFuels[e.type] = [];
        dayData.rawFuels[e.type].push({ price: e.price, timestamp: e.timestamp });
        if (!dayData.hasDiscountLocation && e.location && DISCOUNT_MARKER_RE.test(e.location)) {
            dayData.hasDiscountLocation = true;
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
    // Marker + gasoline (95, 98) both dropped ≥4¢ day-over-day. No
    // carry-forward: only the day with the visible day-over-day drop is the
    // discount day, not the next day where price recovers.
    const MIN_DISCOUNT_DROP = 0.04;
    const EPSILON = 0.001;
    const GASOLINE_FUELS = ['Neste Futura 95', 'Neste Futura 98'];
    for (let i = 1; i < rows.length; i++) {
        if (!rows[i].hasDiscountLocation) continue;
        const prev = rows[i - 1];
        const curr = rows[i];
        const gasolineDropped = GASOLINE_FUELS.every(f => {
            const prevFuel = prev.fuels[f];
            const currFuel = curr.fuels[f];
            if (!prevFuel || !currFuel) return true;
            const dropLatest = prevFuel.latest - currFuel.latest;
            const dropMin = prevFuel.latest - currFuel.min;
            return Math.max(dropLatest, dropMin) >= MIN_DISCOUNT_DROP - EPSILON;
        });
        rows[i].isDiscount = gasolineDropped;
    }

    return rows;
  }, [historyData, getRigaParts, toYMD, allFuelTypes]);

  const availableDatesSet = useMemo(() => {
    return new Set(allDaysData.map(d => d.dateKey));
  }, [allDaysData]);

  // Filter `allDaysData` into just the selected date range
  const tableRows = useMemo(() => {
    const filtered = allDaysData.filter(r => r.dateKey >= filterStart && r.dateKey <= filterEnd);
    // If the 30-day preset is active, strictly limit to 30 days to avoid 31st-day boundary issues
    const result = (activePreset === '30' && filtered.length > 30) 
      ? filtered.slice(-30) 
      : filtered;
    return result.reverse(); // Newest day at top
  }, [allDaysData, filterStart, filterEnd, activePreset]);

  // Calculate OVERALL summaries only over the filtered selection (used for the big cards)
  const periodSummary = useMemo(() => {
    const stats = {};
    avgSelectedFuels.forEach(fuel => {
        // Collect all daily latest prices for selected fuel in range
        const values = tableRows.map(r => r.fuels[fuel]?.latest).filter(v => v !== undefined);
        if (values.length === 0) return;
        const sum = values.reduce((a,b) => a + b, 0);
        stats[fuel] = {
            avg: sum / values.length,
            min: Math.min(...values),
            max: Math.max(...values),
            count: values.length // number of days
        };
    });
    return stats;
  }, [tableRows, avgSelectedFuels]);
  
  const renderChange = (change) => {
    if (change === null || change === undefined) return null;
    const cents = change * 100;
    const isUp = cents > 0.05;
    const isDown = cents < -0.05;
    if (!isUp && !isDown) return null;
    return (
      <span className={clsx(
        'inline-flex items-center gap-0.5 text-[9px] sm:text-[11px] font-semibold',
        isUp && 'text-red-500',
        isDown && 'text-green-600',
        !isUp && !isDown && 'text-gray-400'
      )}>
        {isUp && <TrendingUp size={10} />}
        {isDown && <TrendingDown size={10} />}
        {!isUp && !isDown && <Minus size={10} />}
        {cents > 0 ? '+' : ''}{cents.toFixed(1)}¢
      </span>
    );
  };


  return (
    <Card className="p-3 sm:p-6 overflow-hidden">
      {/* Header with period controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-6 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-gray-400 shrink-0" />
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">{t('analytics')}</h2>
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
                { value: '30', label: t('avg_prices.last_30_days') },
                { value: 'lastMonth', label: lastMonthName },
                { value: 'thisMonth', label: thisMonthName },
              ]}
              value={activePreset}
              onChange={(val) => {
                if (val === '30') setPreset(30);
                else if (val === 'lastMonth') setLastMonth();
                else if (val === 'thisMonth') setThisMonth();
              }}
              layoutId="active-history-preset"
              size="small"
            />
          </div>
        </div>

        {loading && historyData.length === 0 ? (
          <div className="space-y-8">
            <HistorySummarySkeleton />
            <HistoryTableSkeleton />
          </div>
        ) : tableRows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">{t('avg_prices.no_data')}</p>
        ) : (
          <div className="space-y-8">
            {/* Section 1: Summary Cards for selected period */}
            {Object.keys(periodSummary).length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                  <CircleSlash2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <h2 className="text-sm sm:text-base font-semibold text-gray-700">{t('avg_prices.title')}</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  {avgSelectedFuels.map(fuel => {
                    const stats = periodSummary[fuel];
                    if (!stats) return null;
                    return (
                      <div
                        key={fuel}
                        className="rounded-xl p-3 sm:p-4 border-l-4 bg-[#FCFCFD] shadow-sm ring-1 ring-gray-100"
                        style={{ borderLeftColor: FUEL_COLORS[fuel] }}
                      >
                        <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: FUEL_COLORS[fuel] }}>
                          {t(fuel.replace('Neste ', ''))}
                        </p>
                        <p className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                          €{stats.avg.toFixed(3)}
                        </p>
                        <p className="mt-1.5">
                          <span
                            className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-full"
                            style={{
                              color: FUEL_COLORS[fuel],
                              backgroundColor: FUEL_COLORS[fuel] + '15'
                            }}
                          >
                            {t('avg_prices.avg_for_days', { count: stats.count })}
                          </span>
                        </p>
                        <div className="flex gap-3 mt-2 pt-2 border-t border-gray-100 text-[10px] text-gray-500 font-medium">
                          <span>{t('avg_prices.min')}: €{stats.min.toFixed(3)}</span>
                          <span>{t('avg_prices.max')}: €{stats.max.toFixed(3)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Section 2: Detail Table — latest price per day within the selected period */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <FileSpreadsheet className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <h2 className="text-sm sm:text-base font-semibold text-gray-700">{t('avg_prices.table_title')}</h2>
              </div>
              
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                <div className="p-2.5 sm:p-3 bg-gray-50/80 border-b border-gray-100 flex items-center justify-center gap-2 text-center">
                  <p className="text-sm font-medium text-gray-600">
                    {t('avg_prices.latest_disclaimer')}
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left text-[9px] sm:text-[10px] font-semibold text-gray-400 uppercase tracking-wide py-3 pl-2 sm:pl-4">
                           {t('avg_prices.day')}
                        </th>
                        {avgSelectedFuels.map((fuel, idx) => {
                          const label = t(fuel.replace('Neste ', ''));
                          const shortLabel = label === 'Pro Diesel' ? 'Pro D' : label;
                          const isLast = idx === avgSelectedFuels.length - 1;
                          return (
                            <th key={fuel} className={clsx("text-right text-[9px] sm:text-xs font-semibold uppercase tracking-wide px-1 sm:px-4 py-3 whitespace-nowrap", isLast && "pr-2 sm:pr-4")} style={{ color: FUEL_COLORS[fuel] }}>
                              <div>
                                <span className="sm:hidden">{shortLabel}</span>
                                <span className="hidden sm:inline">{label}</span>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                  <tbody>
                    {tableRows.slice(0, visibleCount).map((row) => {
                      const highlighted = showDiscounts && row.isDiscount;
                      return (
                      <tr
                        key={row.dateKey}
                        className={clsx(
                          "border-b border-gray-100 last:border-b-0 transition-all duration-200",
                          highlighted 
                            ? "bg-[#44D62C]/10 hover:bg-[#44D62C]/20" 
                            : "hover:bg-slate-100/60"
                        )}
                      >
                        <td className="py-2 pl-2 sm:pl-4 pr-0 sm:pr-2 align-top">
                          <span className="block text-[10px] sm:text-sm font-normal text-gray-500 whitespace-nowrap tabular-nums leading-tight">{row.timeStr}</span>
                        </td>
                        {avgSelectedFuels.map((fuel, idx) => {
                          const isLast = idx === avgSelectedFuels.length - 1;
                          const data = row.fuels[fuel];
                          if (!data) {
                            return <td key={fuel} className={clsx("text-right px-1 sm:px-4 py-2 align-top text-gray-300 text-[10px]", isLast && "pr-2 sm:pr-4")}>—</td>;
                          }
                          return (
                            <td key={fuel} className={clsx("text-right px-1 sm:px-4 py-2 align-top", isLast && "pr-2 sm:pr-4")}>
                              <div className="flex flex-col items-end gap-0">
                                <span className="text-[11px] sm:text-sm font-bold text-gray-900 leading-tight tabular-nums">€{data.latest.toFixed(3)}</span>
                                <div className="flex flex-col items-end">
                                  {renderChange(data.change)}
                                  {data.min !== data.max && (
                                    <span className="text-[8px] sm:text-[9px] text-gray-400 font-medium whitespace-nowrap tracking-tighter sm:tracking-tight tabular-nums">
                                      {data.min.toFixed(3)}–{data.max.toFixed(3)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                      );
                    })}
                  </tbody>
                  </table>
                </div>

                {/* Show more / row count */}
                {tableRows.length > PAGE_SIZE && (
                  <div className="flex flex-col items-center gap-2 py-3 px-4 border-t border-slate-100">
                    <span className="text-[11px] text-gray-400 font-medium">
                      {t('avg_prices.showing_of', { visible: Math.min(visibleCount, tableRows.length), total: tableRows.length })}
                    </span>
                    {visibleCount < tableRows.length && (
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
          </div>
        )}
    </Card>
  );
});

export default function App() {
  const { t, i18n } = useTranslation();
  const [latestPrices, setLatestPrices] = useState(window.__INITIAL_PRICES__ || []);
  const [historyData, setHistoryData] = useState([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Insights fuel selector — single fuel for Price Insights section
  const [insightsFuel, setInsightsFuel] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const fuelParam = params.get('fuel');
    const stored = localStorage.getItem('insightsFuel');
    const validFuelNames = Object.keys(FUEL_COLORS);

    if (fuelParam && FUEL_URL_MAP[fuelParam] && validFuelNames.includes(FUEL_URL_MAP[fuelParam])) {
      return FUEL_URL_MAP[fuelParam];
    }
    if (stored && validFuelNames.includes(stored)) return stored;
    return validFuelNames[0]; // Default to first fuel type
  });

  const [graphInterval, setGraphInterval] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const periodParam = params.get('period');
    const storedPeriod = localStorage.getItem('graphInterval');

    // URL params take priority, then localStorage, then default
    if (['days', 'weeks', 'months'].includes(periodParam)) {
      return periodParam;
    }
    if (['days', 'weeks', 'months'].includes(storedPeriod)) {
      return storedPeriod;
    }
    return 'days';
  });

  const [loading, setLoading] = useState(!window.__INITIAL_PRICES__);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [lastCheck, setLastCheck] = useState(() => {
    if (window.__INITIAL_PRICES__ && window.__INITIAL_PRICES__.length > 0) {
      return window.__INITIAL_PRICES__[0].timestamp;
    }
    return null;
  });
  const [notification, setNotification] = useState(null);
  const [showDiscounts, setShowDiscounts] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const discountParam = params.get('discounts');
    const stored = localStorage.getItem('showDiscounts');
    
    if (discountParam !== null) return discountParam === 'on';
    return stored === null ? true : stored === 'true';
  });

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
      start.setDate(now.getDate() - 30);
      return { start: fmt(start), end: fmt(now) };
    }
    if (preset === 'thisMonth') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: fmt(start), end: fmt(now) };
    }
    if (preset === 'lastMonth') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: fmt(start), end: fmt(end) };
    }
    return null;
  };

  const VALID_PRESETS = ['7', '30', 'thisMonth', 'lastMonth'];

  const [historyPreset, setHistoryPreset] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    // URL preset takes priority
    const urlPreset = params.get('h_preset');
    if (urlPreset && VALID_PRESETS.includes(urlPreset)) return urlPreset;
    // Explicit date params mean no preset
    if (params.get('h_start') || params.get('h_end')) return null;
    const stored = localStorage.getItem('historyPreset');
    if (stored && VALID_PRESETS.includes(stored)) return stored;
    return '30'; // default preset
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
    const storedPreset = localStorage.getItem('historyPreset');
    if (storedPreset && VALID_PRESETS.includes(storedPreset)) {
      return computePresetDates(storedPreset).start;
    }
    const storedStart = localStorage.getItem('historyStartDate');
    if (storedStart) return storedStart;

    return computePresetDates('30').start;
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
    const storedPreset = localStorage.getItem('historyPreset');
    if (storedPreset && VALID_PRESETS.includes(storedPreset)) {
      return computePresetDates(storedPreset).end;
    }
    const storedEnd = localStorage.getItem('historyEndDate');
    if (storedEnd) return storedEnd;

    return computePresetDates('30').end;
  });

  const [brushIndices, setBrushIndices] = useState(null); // Controlled state for Brush
  const previousPricesRef = React.useRef([]);

  // Sync state to URL and localStorage
  useEffect(() => {
    // Create fresh params to avoid keeping deprecated parameters
    const params = new URLSearchParams();

    // Sync Language
    const currentLang = i18n.language;
    if (currentLang) {
      params.set('lang', currentLang);
      localStorage.setItem('i18nextLng', currentLang);
    }

    // Sync Graph interval
    params.set('period', graphInterval);
    localStorage.setItem('graphInterval', graphInterval);

    // Sync Insights fuel selector
    params.set('fuel', FUEL_TO_URL[insightsFuel] || '95');
    localStorage.setItem('insightsFuel', insightsFuel);

    // Sync Discounts (only in day view)
    if (graphInterval === 'days') {
      params.set('discounts', showDiscounts ? 'on' : 'off');
    } else {
      params.delete('discounts');
    }

    // Sync History Filters — use preset param when active, concrete dates otherwise
    if (historyPreset) {
      params.set('h_preset', historyPreset);
      localStorage.setItem('historyPreset', historyPreset);
    } else {
      localStorage.removeItem('historyPreset');
      if (historyStartDate && historyEndDate) {
        params.set('h_start', historyStartDate);
        params.set('h_end', historyEndDate);
      }
    }
    localStorage.setItem('historyStartDate', historyStartDate);
    localStorage.setItem('historyEndDate', historyEndDate);
    
    const newRelativePathQuery = window.location.pathname + '?' + params.toString();
    window.history.replaceState(null, '', newRelativePathQuery);
  }, [i18n.language, graphInterval, insightsFuel, showDiscounts, historyStartDate, historyEndDate, historyPreset]);

  // Persist showDiscounts preference
  useEffect(() => {
    localStorage.setItem('showDiscounts', String(showDiscounts));
  }, [showDiscounts]);

  // Handle Initial Language
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const langParam = params.get('lang');
    const storedLang = localStorage.getItem('i18nextLng');
    const initialLang = langParam || storedLang || 'en';

    if (lngs[initialLang] && i18n.language !== initialLang) {
      i18n.changeLanguage(initialLang);
    }
  }, [i18n]);

  const fetchData = useCallback(async (forceScrape = false, showNotification = false) => {
    setLoading(true);
    setHistoryLoading(true);

    if (forceScrape) {
      try {
        await axios.get(`${API_BASE}/scrape`);
      } catch (err) {
        console.error(err);
      }
    }

    const latestPromise = axios
      .get(`${API_BASE}/prices/latest`, { timeout: 15000 })
      .then(latestRes => {
        const newPrices = latestRes.data;

        // Compare prices if we have previous data and notification is requested
        if (showNotification && previousPricesRef.current.length > 0) {
          const changes = [];
          let hasAnyChange = false;

          newPrices.forEach(newPrice => {
            const oldPrice = previousPricesRef.current.find(p => p.type === newPrice.type);
            if (oldPrice) {
              const diff = newPrice.price - oldPrice.price;
              if (Math.abs(diff) >= 0.001) {
                hasAnyChange = true;
              }
              changes.push({
                fuel: newPrice.type.replace('Neste ', '').replace('Futura ', ''),
                oldPrice: oldPrice.price,
                newPrice: newPrice.price,
                diff: diff
              });
            }
          });

          const cleanName = (name) => {
            return name.replace('Futura D', 'Diesel').replace('Futura ', '');
          };

          const processedChanges = changes.map(c => ({
            ...c,
            fuel: cleanName(c.fuel)
          }));

          if (hasAnyChange) {
            setNotification({
              hasChanges: true,
              title: t('notification.prices_changed'),
              changes: processedChanges
            });
          } else {
            setNotification({
              hasChanges: false,
              title: t('notification.data_refreshed'),
              message: t('notification.no_changes')
            });
          }
        }

        previousPricesRef.current = newPrices;

        setLatestPrices(newPrices);
        if (newPrices.length > 0) {
          setLastCheck(newPrices[0].timestamp);
        }
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));

    const historyPromise = axios
      .get(`${API_BASE}/prices/history`, { timeout: 15000 })
      .then(historyRes => {
        setHistoryData(historyRes.data);
      })
      .catch(err => console.error(err))
      .finally(() => setHistoryLoading(false));

    await Promise.all([latestPromise, historyPromise]);
  }, [t]);

  const handleRefresh = () => {
    fetchData(true, true);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    // Auto-refresh data every 15 minutes to catch automated backend updates
    const interval = setInterval(() => {
      fetchData();
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);




  // Helper: extract Riga timezone date components without double-parsing
  // Uses Intl to read year/month/day/weekday directly — immune to DST shifts
  const getRigaDateParts = (timestamp) => {
    const utcDate = new Date(timestamp);
    const tz = 'Europe/Riga';
    const year  = parseInt(utcDate.toLocaleString('en-US', { timeZone: tz, year: 'numeric' }));
    const month = parseInt(utcDate.toLocaleString('en-US', { timeZone: tz, month: 'numeric' }));
    const day   = parseInt(utcDate.toLocaleString('en-US', { timeZone: tz, day: 'numeric' }));
    return { year, month, day };
  };

  // Filter Data based on Interval and Group by Period (Day/Week/Month)
  // We keep a larger history window (e.g. 180 days) for the Brush, but the chart will default to showing recent data
  const chartData = useMemo(() => {
    if (!historyData.length) return [];

    const now = new Date();
    let cutoff = new Date();

    // Limit to exactly 1 year (365 days) back
    cutoff.setDate(now.getDate() - 365);

    // Filter by date first
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

    // Accumulate prices by period and fuel type
    // Structure: { periodKey: { fuelType: { sum: X, count: Y }, ... } }
    const periodData = new Map();

    filteredByTime.forEach(item => {
      const periodKey = getPeriodKey(item.timestamp);

      if (!periodData.has(periodKey)) {
        periodData.set(periodKey, {});
      }

      const period = periodData.get(periodKey);

      if (!period[item.type]) {
        period[item.type] = { prices: [] };
      }

      period[item.type].prices.push({
        price: item.price,
        timestamp: item.timestamp,
        location: item.location
      });
    });

    // Convert to chart format with High-Low Range logic (Option 1)
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

      // Detect discount location: any fuel type in this period has a discount marker
      // in its location field. See DISCOUNT_MARKER_RE for the supported phrasings.
      const hasDiscountLocation = Object.values(data).some(fuelData =>
        fuelData.prices.some(p =>
          p.location && DISCOUNT_MARKER_RE.test(p.location)
        )
      );

      const entry = {
        date: getPeriodTimestamp(periodKey),
        periodKey,
        formattedTime,
        hasDiscountLocation,
        isDiscount: false, // Will be finalized in second pass after sorting
      };

      // Calculate stats for each fuel type
      Object.keys(data).forEach(key => {
        // Sort by timestamp to find the true "last" price
        const sortedItems = data[key].prices.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Filter out duplicates (keep only changes) for tooltip history
        const distinctItems = sortedItems.filter((item, index, arr) => {
          if (index === 0) return true;
          return Math.abs(item.price - arr[index - 1].price) > 0.0001;
        });

        const priceValues = sortedItems.map(p => p.price); // Use ALL values for min/max to be safe

        const lastPrice = priceValues[priceValues.length - 1];
        const minPrice = Math.min(...priceValues);
        const maxPrice = Math.max(...priceValues);

        entry[key] = lastPrice; // Main line plots LAST price
        entry[`${key}_min`] = minPrice;
        entry[`${key}_max`] = maxPrice;

        // Error range for Recharts ErrorBar: [negativeError, positiveError]
        // This draws a line from (last - (last-min)) to (last + (max-last)) => min to max
        entry[`${key}_range`] = [lastPrice - minPrice, maxPrice - lastPrice];

        entry[`${key}_history`] = distinctItems.reverse(); // Store CLEAN history for tooltip (Newest first)
      });

      return entry;
    });

    const sorted = result.sort((a, b) => a.date - b.date);

    // Second pass: finalize isDiscount. A period is a discount when both:
    //   1. It has the marker (hasDiscountLocation), AND
    //   2. Both gasoline fuels (95, 98) dropped ≥4¢ vs the previous period
    //      (using latest OR intra-period min).
    //
    // Why gasoline-only for the drop gate: diesel drops are inconsistent on
    // real discount days (sometimes only 1-2¢, e.g. 2026-04-28) while 95 and
    // 98 reliably drop together. Requiring all four fuels was hiding weak
    // diesel discounts.
    //
    // We do NOT carry the discount flag forward to the next day. Neste
    // typically runs ~24h discounts that span the boundary between two
    // calendar days (e.g. 2026-04-28 22:00 → 2026-04-29 22:00 Riga). Only the
    // day on which the price visibly DROPPED day-over-day is the discount
    // day; the day after is the price-recovery day even if its intra-day min
    // briefly equals the discount price.
    const MIN_DISCOUNT_DROP = 0.04;
    const EPSILON = 0.001;
    const GASOLINE_FUELS = ['Neste Futura 95', 'Neste Futura 98'];
    for (let i = 1; i < sorted.length; i++) {
      if (!sorted[i].hasDiscountLocation) continue;
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const gasolineDropped = GASOLINE_FUELS.every(fuel => {
        const prevPrice = prev[fuel];
        const currLast = curr[fuel];
        const currMin = curr[`${fuel}_min`];
        if (prevPrice === undefined || currLast === undefined) return true;
        const dropLast = prevPrice - currLast;
        const dropMin = currMin !== undefined ? prevPrice - currMin : -Infinity;
        return Math.max(dropLast, dropMin) >= MIN_DISCOUNT_DROP - EPSILON;
      });
      sorted[i].isDiscount = gasolineDropped;
    }

    return sorted;
  }, [historyData, graphInterval]);





  // Prepare data with trend lines
  const chartDataWithTrend = useMemo(() => {
    if (!chartData) return [];
    // Deep copy objects to avoid mutating memoized chartData
    let data = chartData.map(item => ({ ...item }));

    FUEL_KEYS.forEach(fuel => {
      const trend = calculateTrendLine(data, fuel);
      if (trend) {
        // Merge trend data back into main data array
        trend.forEach((t, i) => {
          if (data[i]) data[i][`${fuel}_trend`] = t[`${fuel}_trend`];
        });
      }
    });

    return data;
  }, [chartData]);

  // No smoothing - use raw daily aggregation (High-Low)
  const chartDataFinal = chartDataWithTrend;

  // Slice visible data based on timeline slider indices
  const visibleChartData = useMemo(() => {
    if (!chartDataFinal || !brushIndices) return chartDataFinal;
    return chartDataFinal.slice(brushIndices.startIndex, brushIndices.endIndex + 1);
  }, [chartDataFinal, brushIndices]);

  // Sync Brush indices when data or interval changes during render
  // This avoids extra render cycles and lint errors associated with useEffect
  const [lastConfig, setLastConfig] = useState({ length: 0, interval: '' });
  if (chartDataFinal && (chartDataFinal.length !== lastConfig.length || graphInterval !== lastConfig.interval)) {
    setLastConfig({ length: chartDataFinal.length, interval: graphInterval });

    let defaultVisibleCount = 30; // default for days
    if (graphInterval === 'weeks') defaultVisibleCount = 4;
    if (graphInterval === 'months') defaultVisibleCount = 3;

    setBrushIndices({
      startIndex: Math.max(0, chartDataFinal.length - defaultVisibleCount),
      endIndex: chartDataFinal.length - 1
    });
  }

  const handleBrushChange = (newIndex) => {
    if (newIndex && newIndex.startIndex !== undefined) {
      setBrushIndices({ startIndex: newIndex.startIndex, endIndex: newIndex.endIndex });
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-gray-900 pb-24">

      {/* Toast Notification */}
      <Toast
        notification={notification}
        onDismiss={() => setNotification(null)}
        t={t}
      />

      {/* Header */}
      <header className="bg-white backdrop-blur-xl sticky top-0 z-50 border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <a
            href="/"
            className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight hover:text-gray-600 transition-colors cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis mr-4"
          >
            {t('app_title')}
          </a>
          <LanguageDropdown
            lngs={lngs}
            currentLng={i18n.language}
            onChange={(val) => i18n.changeLanguage(val)}
          />
        </div>
      </header>

      {/* Disclaimer */}
      <div className="bg-amber-50 border-b border-amber-200">
        <div className="max-w-5xl mx-auto px-6 py-3">
          <p className="text-sm text-amber-700 text-center font-medium flex items-center justify-center gap-1.5">
            <AlertTriangle size={15} className="shrink-0" strokeWidth={2} />
            {t('disclaimer')}
          </p>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-3 sm:px-6 py-10 space-y-8">


        {/* Fuel Prices */}
        <section>
          <Card className="p-3 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-lg sm:text-xl leading-none" role="img" aria-label="fire">🔥</span>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                  {t('current_prices')}
                </h2>
              </div>
              {lastCheck && (
                <div className="flex items-center gap-1.5 sm:gap-2 text-gray-400">
                  <span className="text-[10px] sm:text-xs font-medium">
                    {t('updated')}: {new Date(lastCheck).toLocaleString(i18n.language === 'en' ? 'en-GB' : i18n.language, {
                      timeZone: 'Europe/Riga',
                      day: '2-digit',
                      month: '2-digit',
                      year: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
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
            </div>

            {loading && latestPrices.length === 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                <FuelCardSkeleton />
                <FuelCardSkeleton />
                <FuelCardSkeleton />
                <FuelCardSkeleton />
              </div>
            ) : latestPrices.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                {latestPrices.map((item) => (
                  <FuelCard key={item.type} {...item} />
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

        {/* Chart Section */}
        <section>
          <Card className="p-3 sm:p-6">
            {/* Header with Time Period Pills */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-2">
                <ChartSpline className="w-4 h-4 text-gray-400 shrink-0" />
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">{t('history')}</h2>
              </div>
              
              <div className="flex items-center gap-4 sm:gap-6">
                {/* Discount Toggle — only in day view */}
                {graphInterval === 'days' && (
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
                )}

                <SegmentedControl
                  options={['days', 'weeks', 'months'].map(step => ({
                    value: step,
                    label: t(`intervals.${step}`)
                  }))}
                  value={graphInterval}
                  onChange={setGraphInterval}
                  layoutId="active-interval"
                  size="small"
                  className="z-10"
                />
              </div>
            </div>


            {/* Timeline Slider — above the chart */}
            {chartDataFinal && chartDataFinal.length > 0 && brushIndices && (
              <TimelineSlider
                data={chartDataFinal}
                startIndex={brushIndices.startIndex}
                endIndex={brushIndices.endIndex}
                onChange={handleBrushChange}
                graphInterval={graphInterval}
              />
            )}

            {/* Chart container — stretch to card edges on mobile */}
            <div className="relative h-[350px] w-[calc(100%+1.5rem)] -ml-3 sm:w-[calc(100%+3rem)] sm:-ml-6">
              {historyLoading && <ChartLoadingOverlay />}
              {historyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={visibleChartData}
                  margin={{ top: 20, right: isMobile ? 20 : 30, left: isMobile ? -5 : 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                  <XAxis
                    dataKey="date"
                    type="number"
                    domain={['dataMin', (dataMax) => {
                      // Extend right boundary when last day is a discount to prevent shade clipping
                      const lastIsDiscount = chartDataFinal.length > 0 && chartDataFinal[chartDataFinal.length - 1].isDiscount;
                      if (lastIsDiscount && graphInterval === 'days') {
                        const avgGap = chartDataFinal.length > 1
                          ? (chartDataFinal[chartDataFinal.length - 1].date - chartDataFinal[0].date) / (chartDataFinal.length - 1)
                          : 0;
                        return dataMax + avgGap / 2;
                      }
                      return dataMax;
                    }]}
                    stroke="#a3a3a3"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={30}
                    dy={8}
                    tickFormatter={(unixTime) => {
                      const d = new Date(unixTime);
                      const tz = 'Europe/Riga';
                      if (graphInterval === 'hours') return d.toLocaleTimeString('lv-LV', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
                      if (graphInterval === 'weeks') {
                        const start = new Date(d);
                        const end = new Date(d.getTime() + 6 * 86400000);
                        const startStr = start.toLocaleDateString('lv-LV', { timeZone: tz, day: '2-digit', month: '2-digit' });
                        const endStr = end.toLocaleDateString('lv-LV', { timeZone: tz, day: '2-digit', month: '2-digit' });
                        return `${startStr} - ${endStr}`;
                      }
                      if (graphInterval === 'months') {
                        const { month, year } = getRigaDateParts(unixTime);
                        return `${String(month).padStart(2, '0')}.${year}.`;
                      }
                      return d.toLocaleDateString('lv-LV', { timeZone: tz, day: '2-digit', month: '2-digit' });
                    }}
                  />
                  <YAxis
                    stroke="#a3a3a3"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    domain={[dataMin => (dataMin - 0.02), dataMax => (dataMax + 0.10)]}
                    allowDataOverflow={true}
                    tickFormatter={(value) => `€${parseFloat(value).toFixed(2)}`}
                  />
                  <Tooltip
                    content={<CustomTooltip t={t} interval={graphInterval} />}
                    cursor={{ stroke: '#9ca3af', strokeWidth: 1, strokeDasharray: '5 5' }}
                    wrapperStyle={{ zIndex: 50 }}
                  />



                  {/* Discount day highlights — only in day view, always rendered to avoid re-animation */}
                  {graphInterval === 'days' && chartDataFinal.reduce((areas, point, i, arr) => {
                    if (!point.isDiscount) return areas;
                    const avgGap = arr.length > 1 ? (arr[arr.length - 1].date - arr[0].date) / (arr.length - 1) : 0;
                    const prevDate = i > 0 ? arr[i - 1].date : point.date - avgGap;
                    const nextDate = i < arr.length - 1 ? arr[i + 1].date : point.date + avgGap;
                    const x1 = (prevDate + point.date) / 2;
                    const x2 = (point.date + nextDate) / 2;
                    areas.push(
                      <ReferenceArea
                        key={`discount-${point.periodKey}`}
                        x1={x1}
                        x2={x2}
                        fill={showDiscounts ? `${DISCOUNT_COLOR}33` : 'transparent'} // Exact same yellow with ~20% opacity (33 in hex)
                        stroke="none"
                      />
                    );
                    return areas;
                  }, [])}

                  {FUEL_KEYS.map((fuel) => {
                    const fuelShortName = t(fuel.replace('Neste ', ''));

                    // Calculate precise scale for this specific chart view to ensure perfect badge positioning
                    const allValues = visibleChartData.flatMap(d => FUEL_KEYS.map(f => d[f]).filter(v => typeof v === 'number'));
                    const dMin = Math.min(...allValues);
                    const dMax = Math.max(...allValues);
                    const chartDomainHeight = (dMax + 0.10) - (dMin - 0.02);
                    const pxPerEuro = 350 / chartDomainHeight;

                    return (
                      <React.Fragment key={fuel}>
                        <Line
                          type="monotone"
                          dataKey={fuel}
                          stroke={FUEL_COLORS[fuel]}
                          strokeWidth={2}
                          dot={{ r: 3, fill: FUEL_COLORS[fuel], strokeWidth: 0 }}
                          activeDot={{ r: 5, strokeWidth: 0, fill: FUEL_COLORS[fuel] }}
                        >
                          <ErrorBar
                            dataKey={`${fuel}_range`}
                            width={4}
                            strokeWidth={2}
                            stroke={FUEL_COLORS[fuel]}
                            direction="y"
                          />
                          <LabelList
                            dataKey={fuel}
                            content={(props) => {
                              const { x, y, value, index: pointIndex } = props;
                              if (!value) return null;
                              
                              const lastDataPoint = chartDataFinal?.[chartDataFinal.length - 1];
                              const currentPoint = visibleChartData?.[pointIndex];
                              if (!lastDataPoint || !currentPoint || +currentPoint.date !== +lastDataPoint.date) return null;

                              const pillHeight = 30;
                              const pillHeightWithGap = pillHeight + 12;

                              // Resolve collisions consistently across all active fuels
                              const activeFuels = FUEL_KEYS
                                .filter(f => lastDataPoint[f] !== undefined)
                                .sort((a, b) => lastDataPoint[b] - lastDataPoint[a]);

                              // Use the common pxPerEuro to ensure all fuel labels calculate the same Y offsets
                              const positions = activeFuels.map(f => {
                                const priceDiff = lastDataPoint[f] - value;
                                return { fuel: f, y: y - (priceDiff * pxPerEuro) };
                              });

                              for (let iter = 0; iter < 50; iter++) {
                                let changed = false;
                                for (let i = 0; i < positions.length - 1; i++) {
                                  const a = positions[i];
                                  const b = positions[i+1];
                                  const overlap = pillHeightWithGap - (b.y - a.y);
                                  if (overlap > 0) {
                                    a.y -= overlap / 2;
                                    b.y += overlap / 2;
                                    changed = true;
                                  }
                                }
                                if (!changed) break;
                              }

                              const resolvedY = positions.find(p => p.fuel === fuel)?.y || y;
                              const badgeY = resolvedY - pillHeight / 2;
                              const textWidth = `€${value.toFixed(3)}`.length * 7;
                              const pillWidth = textWidth + 14;
                              const pillX = x - pillWidth - 16;

                              return (
                                <g>
                                  <line
                                    x1={x} y1={y}
                                    x2={pillX + pillWidth + 2} y2={resolvedY}
                                    stroke={FUEL_COLORS[fuel]}
                                    strokeWidth={1.5}
                                    opacity={0.8}
                                  />
                                  <g transform={`translate(${pillX}, ${badgeY})`}>
                                    <rect
                                      width={pillWidth}
                                      height={pillHeight}
                                      rx={8}
                                      fill="rgba(255, 255, 255, 0.85)"
                                      stroke="rgba(243, 244, 246, 0.7)"
                                      strokeWidth={1}
                                    />
                                    <text
                                      x={pillWidth / 2}
                                      y={pillHeight / 2 - 4}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                      fontSize={11}
                                      fontWeight="700"
                                      fill={FUEL_COLORS[fuel]}
                                    >
                                      €{value.toFixed(3)}
                                    </text>
                                    <text
                                      x={pillWidth / 2}
                                      y={pillHeight / 2 + 9}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                      fontSize={9}
                                      fontWeight="500"
                                      fill={FUEL_COLORS[fuel]}
                                      opacity={0.6}
                                    >
                                      {fuelShortName}
                                    </text>
                                  </g>
                                </g>
                              );
                            }}
                          />
                        </Line>
                        <Line
                          type="linear"
                          dataKey={`${fuel}_trend`}
                          stroke={FUEL_COLORS[fuel]}
                          strokeWidth={1}
                          strokeDasharray="5 5"
                          dot={false}
                          activeDot={false}
                          legendType="none"
                          isAnimationActive={false}
                          opacity={0.5}
                        />
                      </React.Fragment>
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
              ) : null}
            </div>
          </Card>
        </section>

        {/* Price Changes Section */}
        <section>
          <Card className="p-3 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <CircleGauge className="w-4 h-4 text-gray-400 shrink-0" />
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                  {t('insights.title')}
                </h2>
              </div>
              <SegmentedControl
                options={FUEL_KEYS.map(fuel => ({
                  value: fuel,
                  label: t(fuel.replace('Neste ', ''))
                }))}
                value={insightsFuel}
                onChange={setInsightsFuel}
                layoutId="active-insights-fuel"
                size="small"
              />
            </div>
            {historyLoading && historyData.length === 0 ? (
              <InsightsSkeleton />
            ) : (
              <Suspense fallback={<InsightsSkeleton />}>
                <PriceChangeCards
                  historyData={historyData}
                  latestPrices={latestPrices}
                  selectedFuel={insightsFuel}
                />
              </Suspense>
            )}
          </Card>
        </section>


        {/* History Table Section */}
        <section>
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
            showDiscounts={showDiscounts}
          />
        </section>

        <div className="h-8" />

      </main>
    </div >
  );
}
