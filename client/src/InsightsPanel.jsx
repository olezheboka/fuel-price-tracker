import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';

const getEndOfDayInLatvia = (date) => {
    const latvianDateStr = date.toLocaleString('en-CA', {
        timeZone: 'Europe/Riga', year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const [year, month, day] = latvianDateStr.split('-').map(Number);
    const tempDate = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T23:59:59Z`);
    const latvianTime = new Date(tempDate.toLocaleString('en-US', { timeZone: 'Europe/Riga' }));
    const utcTime = new Date(tempDate.toLocaleString('en-US', { timeZone: 'UTC' }));
    const offset = latvianTime.getTime() - utcTime.getTime();
    return new Date(tempDate.getTime() - offset);
};

// Shift a YMD date-key string by a number of calendar days (pure date-string
// arithmetic, no timezone math — the key is already a Riga calendar date).
const shiftYMD = (ymd, deltaDays) => {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + deltaDays);
    return dt.toISOString().slice(0, 10);
};

const PERIODS = [
    { key: 'period_24h', days: 1 },
    { key: 'period_7d', days: 7 },
    { key: 'period_30d', days: 30 },
    { key: 'period_3m', days: 90 },
];

// Fixed grid: first column is a fixed width so all period columns align across
// every station row and every fuel group.
const GRID = 'grid grid-cols-[6rem_repeat(4,minmax(0,1fr))]';

const ChangeCell = ({ value }) => {
    if (value === null || value === undefined) {
        return <span className="text-gray-300 tabular-nums select-none">—</span>;
    }
    const cents = value * 100;
    let color = 'text-gray-400';
    let prefix = '';
    if (value > 0.001) { color = 'text-red-500'; prefix = '+'; }
    else if (value < -0.001) { color = 'text-green-600'; prefix = ''; }
    return (
        <span className={clsx('font-semibold tabular-nums text-xs sm:text-sm', color)}>
            {prefix}{cents.toFixed(1)}¢
        </span>
    );
};

export default function PriceChangeCards({ groups, todayKey }) {
    const { t } = useTranslation();

    // 24h cutoff stays rolling/intraday (sub-day granularity matters there).
    const cutoff24h = useMemo(() => getEndOfDayInLatvia(new Date(new Date().getTime() - 24 * 60 * 60 * 1000)), []);

    // 7d/30d/90d targets are calendar-day buckets: the baseline is exactly
    // today minus N days (e.g. "7d" -> today-7), the literal "N days ago"
    // reference point for a delta. This is one day earlier than the History
    // table's N-day preset *window start* (today-(N-1), since that window
    // shows N days inclusive of today) — the two are different concepts by
    // design, not a bug: a delta needs "the price N days back", while the
    // table window needs "the last N calendar days".
    const targetKeys = useMemo(
        () => PERIODS.map(p => (p.days === 1 ? null : shiftYMD(todayKey, -p.days))),
        [todayKey]
    );

    const changesFor = (station) => {
        const { history, dailyMap } = station;
        if (!history || history.length === 0) return PERIODS.map(() => null);
        const desc = [...history].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const current = desc[0].price;
        return PERIODS.map((p, i) => {
            if (p.days === 1) {
                const past = desc.find(d => new Date(d.timestamp) <= cutoff24h);
                return past ? current - past.price : null;
            }
            // Walk backward from the target date to the nearest earlier
            // bucket with data, in case that exact day has a scrape gap.
            let key = targetKeys[i];
            let guard = 0;
            while (!dailyMap.has(key) && guard < 14) {
                key = shiftYMD(key, -1);
                guard++;
            }
            const past = dailyMap.get(key);
            return past !== undefined ? current - past : null;
        });
    };

    if (!groups || groups.length === 0) {
        return <div className="text-center text-gray-400 py-6 text-sm">{t('avg_prices.no_data')}</div>;
    }

    return (
        <div className="space-y-5">
            {groups.map(group => (
                <div key={group.id}>
                    <div className="mb-1.5">
                        <span
                            className="inline-block text-[11px] sm:text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-gray-100 text-gray-700"
                        >
                            {t(group.labelKey)}
                        </span>
                    </div>

                    {/* Period header — first cell is empty placeholder matching the fixed station-name column */}
                    <div className={clsx(GRID, 'gap-x-1 sm:gap-x-2 px-2 mb-0.5')}>
                        <div />
                        {PERIODS.map(p => (
                            <div key={p.key} className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide text-right pr-1">
                                {t(`insights.${p.key}`)}
                            </div>
                        ))}
                    </div>

                    <div className="space-y-0.5">
                        {group.stations.map(st => {
                            const changes = changesFor(st);
                            return (
                                <div
                                    key={st.key}
                                    className={clsx(GRID, 'gap-x-1 sm:gap-x-2 items-center rounded-lg px-2 py-1.5 odd:bg-gray-50/70')}
                                >
                                    <div className="text-[11px] sm:text-xs font-bold uppercase tracking-wide truncate" style={{ color: st.color }}>
                                        {st.label}
                                    </div>
                                    {changes.map((val, i) => (
                                        <div key={i} className="flex items-center justify-end pr-1">
                                            <ChangeCell value={val} />
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
