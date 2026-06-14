import React from 'react';
import { Popover, PopoverTrigger, PopoverContent } from './Popover';
import { ChevronDown, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';

export default function MultiSelect({ label, options, selected, onToggle, onToggleAll, onSelectOnly, allLabel, align = 'start', compact = false }) {
  const { t } = useTranslation();
  const allSelected = options.every((o) => selected.has(o.value));
  const noneSelected = options.every((o) => !selected.has(o.value));
  const summary = allSelected
    ? allLabel
    : noneSelected
    ? allLabel
    : options.filter((o) => selected.has(o.value)).map((o) => o.label).join(', ');

  return (
    <Popover className="block w-full">
      <PopoverTrigger asChild>
        <button
          type="button"
          className={clsx(
            "w-full flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-gray-300 active:scale-[0.99] transition-all duration-300 ease-out motion-reduce:transition-none",
            compact ? "h-9" : "h-[46px]"
          )}
        >
          <span className={clsx("min-w-0 flex", compact ? "items-baseline gap-1.5" : "flex-col justify-center")}>
            <span className={clsx("font-semibold uppercase tracking-wide text-gray-400 shrink-0 leading-tight", compact ? "text-[9px]" : "text-[10px]")}>{label}</span>
            <span className={clsx("font-semibold text-gray-900 truncate leading-tight", compact ? "text-xs" : "text-sm")}>{summary}</span>
          </span>
          <ChevronDown size={16} className="shrink-0 text-gray-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="p-1.5 w-56 max-w-[80vw]">
        {onToggleAll && !allSelected && (
          <>
            <button
              type="button"
              onClick={onToggleAll}
              className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 active:scale-[0.99] transition-all"
            >
              <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
                {t('select_all')}
              </span>
            </button>
            <div className="my-1 h-px bg-gray-100" />
          </>
        )}
        {options.map((o) => {
          const checked = selected.has(o.value);
          return (
            <div
              key={o.value}
              className="flex items-center gap-1 rounded-lg pl-2.5 pr-1.5 hover:bg-gray-50"
            >
              <button
                type="button"
                onClick={() => onToggle(o.value)}
                className="flex-1 min-w-0 py-2 text-left active:scale-[0.99] transition-transform"
              >
                <span className="text-sm font-medium text-gray-800 truncate">{o.label}</span>
              </button>
              {onSelectOnly && (
                <button
                  type="button"
                  onClick={() => onSelectOnly(o.value)}
                  className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-400 hover:text-blue-600 px-1.5 py-1 rounded-md transition-colors"
                >
                  {t('only')}
                </button>
              )}
              <button
                type="button"
                onClick={() => onToggle(o.value)}
                aria-label={o.label}
                className={clsx(
                  'shrink-0 flex items-center justify-center w-5 h-5 rounded-md border transition-colors',
                  checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 text-transparent'
                )}
              >
                <Check size={13} strokeWidth={3} />
              </button>
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
