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

export default function PriceChangeCards({ groups }) {
    const { t } = useTranslation();

    const cutoffs = useMemo(() => {
        const now = new Date();
        return PERIODS.map(p => getEndOfDayInLatvia(new Date(now.getTime() - p.days * 24 * 60 * 60 * 1000)));
    }, []);

    const changesFor = (history) => {
        if (!history || history.length === 0) return PERIODS.map(() => null);
        const desc = [...history].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const current = desc[0].price;
        return cutoffs.map(cutoff => {
            const past = desc.find(d => new Date(d.timestamp) <= cutoff);
            return past ? current - past.price : null;
        });
    };

    if (!groups || groups.length === 0) {
        return <div className="text-center text-gray-400 py-6 text-sm">{t('avg_prices.no_data')}</div>;
    }

    return (
        <div className="space-y-5">
            {groups.map(group => (
                <div key={group.id}>
                    <div className="mb-1.5 px-1">
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
                            const changes = changesFor(st.history);
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
