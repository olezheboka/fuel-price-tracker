import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

// Helper to get end-of-day in Latvian timezone (Europe/Riga)
// Latvia uses EET (UTC+2) in winter and EEST (UTC+3) in summer
const getEndOfDayInLatvia = (date) => {
    // Get the date components in Latvian timezone
    const latvianDateStr = date.toLocaleString('en-CA', {
        timeZone: 'Europe/Riga',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }); // Format: YYYY-MM-DD

    // Parse the Latvian date
    const [year, month, day] = latvianDateStr.split('-').map(Number);

    // Create a Date object for 23:59:59 UTC on that day, then adjust for timezone
    // We need to find what UTC time equals 23:59:59 in Latvia
    const tempDate = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T23:59:59Z`);
    const latvianTime = new Date(tempDate.toLocaleString('en-US', { timeZone: 'Europe/Riga' }));
    const utcTime = new Date(tempDate.toLocaleString('en-US', { timeZone: 'UTC' }));
    const offset = latvianTime.getTime() - utcTime.getTime();

    // Return the UTC time that corresponds to 23:59:59 in Latvia
    return new Date(tempDate.getTime() - offset);
};


// Helper function to calculate analysis for given fuel types
const calculateAnalysis = (historyData, fuelTypes) => {
    if (!historyData || historyData.length === 0 || fuelTypes.length === 0) return null;

    const now = new Date();
    // Calculate cutoff dates (N days ago from now)
    const oneDayAgoRaw = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgoRaw = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgoRaw = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const threeMonthsAgoRaw = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // All cutoffs use end-of-day Latvia so deltas line up with the history
    // table's day-over-day column. Without this, the 24H card would
    // sometimes land on a transient intra-day price point (e.g. the brief
    // post-discount-rebound peak), producing a delta that disagrees with
    // the table's last-of-day comparison.
    const oneDayAgo = getEndOfDayInLatvia(oneDayAgoRaw);
    const sevenDaysAgo = getEndOfDayInLatvia(sevenDaysAgoRaw);
    const thirtyDaysAgo = getEndOfDayInLatvia(thirtyDaysAgoRaw);
    const threeMonthsAgo = getEndOfDayInLatvia(threeMonthsAgoRaw);

    let totalChange24h = 0;
    let totalChange7d = 0;
    let totalChange30d = 0;
    let totalChange3m = 0;
    let totalPct24h = 0;
    let totalPct7d = 0;
    let totalPct30d = 0;
    let totalPct3m = 0;
    let count = 0;

    fuelTypes.forEach(type => {
        const typeHistory = historyData
            .filter(item => item.type === type)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (typeHistory.length === 0) return;

        const current = typeHistory[0].price;
        const oldest = typeHistory[typeHistory.length - 1]; // Oldest available data point

        // Helper to get price at or before a cutoff (end of day), or use oldest available if not enough data
        const getPriceAtCutoff = (cutoffDate) => {
            const found = typeHistory.find(d => new Date(d.timestamp) <= cutoffDate);
            if (found) return found.price;
            // If no data at cutoff, use oldest available data (better than showing 0 change)
            return oldest.price;
        };

        const price24h = getPriceAtCutoff(oneDayAgo);
        const price7d = getPriceAtCutoff(sevenDaysAgo);
        const price30d = getPriceAtCutoff(thirtyDaysAgo);
        const price3m = getPriceAtCutoff(threeMonthsAgo);

        totalChange24h += (current - price24h);
        totalChange7d += (current - price7d);
        totalChange30d += (current - price30d);
        totalChange3m += (current - price3m);

        if (price24h > 0) totalPct24h += ((current - price24h) / price24h) * 100;
        if (price7d > 0) totalPct7d += ((current - price7d) / price7d) * 100;
        if (price30d > 0) totalPct30d += ((current - price30d) / price30d) * 100;
        if (price3m > 0) totalPct3m += ((current - price3m) / price3m) * 100;

        count++;
    });

    if (count === 0) return null;

    return {
        avgChange24h: (totalChange24h / count),
        avgChange7d: (totalChange7d / count),
        avgChange30d: (totalChange30d / count),
        avgChange3m: (totalChange3m / count),
        avgPct24h: (totalPct24h / count),
        avgPct7d: (totalPct7d / count),
        avgPct30d: (totalPct30d / count),
        avgPct3m: (totalPct3m / count)
    };
};

// Simple component that only renders the Change cards
export default function PriceChangeCards({ historyData, latestPrices, selectedFuel }) {
    const { t } = useTranslation();

    // Get all fuel types from latest prices
    const allFuelTypes = useMemo(() => {
        if (!latestPrices) return [];
        return latestPrices.map(p => p.type);
    }, [latestPrices]);

    // Filtered analysis (based on selection)
    const filteredFuelTypes = useMemo(() => {
        if (selectedFuel === 'all') {
            return allFuelTypes;
        }
        return allFuelTypes.filter(type => type === selectedFuel);
    }, [allFuelTypes, selectedFuel]);

    const filteredAnalysis = useMemo(() => {
        return calculateAnalysis(historyData, filteredFuelTypes);
    }, [historyData, filteredFuelTypes]);

    if (!filteredAnalysis) return null;

    const renderTrend = (val, pct, periodKey) => {
        const num = parseFloat(val);
        const cents = num * 100;
        const pctNum = parseFloat(pct);
        let colorClass = "text-blue-600";
        let bgClass = "bg-blue-100/70";
        let Icon = Minus;

        if (num > 0.001) {
            colorClass = "text-red-500";
            bgClass = "bg-red-100/70";
            Icon = TrendingUp;
        } else if (num < -0.001) {
            colorClass = "text-green-500";
            bgClass = "bg-green-100/70";
            Icon = TrendingDown;
        }

        return (
            <div className={`p-2.5 sm:p-4 rounded-xl flex flex-col items-center text-center ${bgClass}`}>
                <span className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide mb-1 sm:mb-2">{t(`insights.${periodKey}`)}</span>
                <div className="flex items-center gap-0.5 sm:gap-1 whitespace-nowrap">
                    <span className={`text-sm sm:text-xl font-semibold tabular-nums ${colorClass}`}>
                        {cents > 0 ? '+' : ''}{cents.toFixed(1)}¢
                    </span>
                    <Icon size={14} className={`${colorClass} sm:w-[18px] sm:h-[18px]`} strokeWidth={2} />
                </div>
                <span className={`text-[9px] sm:text-[10px] tabular-nums ${colorClass} opacity-70 mt-0.5`}>
                    ({pctNum > 0 ? '+' : ''}{pctNum.toFixed(2)}%)
                </span>
            </div>
        );
    };

    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {renderTrend(filteredAnalysis.avgChange24h, filteredAnalysis.avgPct24h, 'period_24h')}
            {renderTrend(filteredAnalysis.avgChange7d, filteredAnalysis.avgPct7d, 'period_7d')}
            {renderTrend(filteredAnalysis.avgChange30d, filteredAnalysis.avgPct30d, 'period_30d')}
            {renderTrend(filteredAnalysis.avgChange3m, filteredAnalysis.avgPct3m, 'period_3m')}
        </div>
    );
}
