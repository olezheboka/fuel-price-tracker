import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
    en: {
        translation: {
            app_title: "Fuel Prices",
            price: 'Price',
            latest: 'Latest',
            current_prices: 'Cheapest fuel',
            current_prices_disclaimer: 'Showing stations where fuel is currently the cheapest. Prices may be higher at other stations.',
            stats_history: 'Statistics & History',
            history: 'Graph',
            loading: 'Loading...',
            analytics: 'Analytics',
            loading_initial: 'Loading...',

            liter_short: 'l',
            refresh: 'Refresh Data',
            updated: 'Updated',
            checked_just_now: '✓ Checked just now',
            no_data: 'No data',
            valid_at: 'Valid:',
            station_one: 'Valid:',
            station_other: 'Valid:',
            location: 'Location:',
            copied: 'Copied!',
            fuel_type: 'Fuel Type',
            all: 'All',
            data_source: 'Fuel prices from Neste',
            disclaimer: 'Currently tracking fuel prices from Neste stations only',
            last_update: 'Last update',
            fuel_group: {
                petrol: 'Petrol',
                diesel: 'Diesel'
            },
            // Shortened names
            // Standardized names as requested
            'Futura 95': '95',
            'Futura 98': '98',
            'Futura D': 'Diesel',
            'Pro Diesel': 'Pro Diesel',

            map_title: 'Station Prices',
            show_map: 'Show Map',
            hide_map: 'Hide Map',

            insights: {
                title: "Dynamics",
                period_24h: "24h",
                period_7d: "7d",
                period_30d: "30d",
                period_3m: "90d"
            },
            intervals: {
                hours: "Hours",
                days: "Days",
                weeks: "Weeks",
                "months": "Months",
                "years": "Years"
            },
            notification: {
                prices_changed: "Prices Updated",
                data_refreshed: "Updated",
                no_changes: "Prices haven't changed",
                item_increased: "{{fuel}} price increased by {{diff}}¢",
                item_decreased: "{{fuel}} price decreased by {{diff}}¢",
                item_unchanged: "{{fuel}} price has not changed"
            },
            discounts: 'Discounts',
            all_stations_same_price: 'Same price at all stations',
            avg_prices: {
                title: 'Average Price',
                table_title: 'Price History',
                day: 'Day',
                avg_for_period: 'Avg. for period',
                avg_for_days: 'Ø price for {{count}} d.',
                latest_disclaimer: 'Each day shows the last known price recorded that day',
                avg: 'Avg',
                min: 'Min',
                max: 'Max',
                overall_avg: 'Overall Avg',
                range: 'Range',
                no_data: 'No data for this period',
                vs_prev: 'vs prev',
                last_7_days: 'Last 7 Days',
                last_30_days: '30 d.',
                this_month: 'This Month',
                last_month: 'Last Month',
                days_short: 'd',
                show_more: 'Show more',
                showing_of: 'Showing {{visible}} of {{total}} days'
            }
        }
    },
    lv: {
        translation: {
            app_title: "Degvielas cenas",
            price: 'Cena',
            latest: 'Jaunākie',
            current_prices: 'Lētākā degviela',
            current_prices_disclaimer: 'Tiek rādītas stacijas, kur degviela šobrīd ir vislētākā. Citās stacijās cena var būt augstāka.',
            stats_history: 'Statistika un vēsture',
            history: 'Grafiks',
            loading: 'Ielādē...',
            analytics: 'Analītika',
            loading_initial: 'Ielādē...',

            liter_short: 'l',
            refresh: 'Atjaunot datus',
            updated: 'Atjaunots',
            checked_just_now: '✓ Tikko pārbaudīts',
            no_data: 'Nav datu',
            valid_at: 'Spēkā:',
            station: 'Spēkā:',
            location: 'Atrašanās vieta:',
            copied: 'Nokopēts!',
            fuel_type: 'Degvielas veids',
            all: 'Visi',
            data_source: 'Degvielas cenas no Neste',
            disclaimer: 'Tiek rādītas cenas tikai Neste stacijās.',
            last_update: 'Pēdējā atjaunošana',
            fuel_group: {
                petrol: 'Benzīns',
                diesel: 'Dīzeļdegviela'
            },
            // Shortened names
            // Standardized names as requested
            'Futura 95': '95',
            'Futura 98': '98',
            'Futura D': 'Diesel',
            'Pro Diesel': 'Pro Diesel',

            map_title: 'Staciju Cenas',
            show_map: 'Rādīt Karti',
            hide_map: 'Slēpt Karti',

            insights: {
                title: "Dinamika",
                period_24h: "24st",
                period_7d: "7d",
                period_30d: "30d",
                period_3m: "90d"
            },
            intervals: {
                hours: "Stundas",
                days: "Dienas",
                weeks: "Nedēļas",
                months: "Mēneši",
                years: "Gadi"
            },
            notification: {
                prices_changed: "Cenas atjauninātas",
                data_refreshed: "Atjaunots",
                no_changes: "Cenas nav mainījušās",
                item_increased: "{{fuel}} cena pieauga par {{diff}}¢",
                item_decreased: "{{fuel}} cena samazinājās par {{diff}}¢",
                item_unchanged: "{{fuel}} cena nav mainījusies"
            },
            discounts: 'Atlaides',
            all_stations_same_price: 'Visās stacijās cenas vienādas',
            avg_prices: {
                title: 'Vidējā cena',
                table_title: 'Cenu vēsture',
                day: 'Diena',
                avg_for_period: 'Vid. par periodu',
                avg_for_days: 'Ø cena par {{count}} d.',
                latest_disclaimer: 'Katrai dienai rādīta pēdējā reģistrētā cena tajā dienā',
                avg: 'Vid.',
                min: 'Min',
                max: 'Max',
                overall_avg: 'Kopējā vid.',
                range: 'Diapazons',
                no_data: 'Nav datu šim periodam',
                vs_prev: 'pret iepr.',
                last_7_days: 'Pēdējās 7 dienas',
                last_30_days: '30 d.',
                this_month: 'Šis mēnesis',
                last_month: 'Iepriekšējais mēnesis',
                days_short: 'd',
                show_more: 'Rādīt vairāk',
                showing_of: 'Rāda {{visible}} no {{total}} dienām'
            }
        }
    },
    ru: {
        translation: {
            app_title: "Цены на топливо",
            price: 'Цена',
            latest: 'Последние',
            current_prices: 'Самое дешевое топливо',
            current_prices_disclaimer: 'Показаны заправки, где топливо сейчас самое дешевое. На других заправках цена может быть выше.',
            stats_history: 'Статистика и история',
            history: 'График',
            loading: 'Загрузка...',
            analytics: 'Аналитика',
            loading_initial: 'Загрузка...',

            liter_short: 'л',
            refresh: 'Обновить данные',
            updated: 'Обновлено',
            checked_just_now: '✓ Проверено только что',
            no_data: 'Нет данных',
            valid_at: 'Актуально:',
            station: 'Актуально:',
            location: 'Адрес:',
            copied: 'Скопировано!',
            fuel_type: 'Тип топлива',
            all: 'Все',
            data_source: 'Цены на топливо от Neste',
            disclaimer: 'Отображаются цены только на АЗС Neste',
            last_update: 'Последнее обновление',
            fuel_group: {
                petrol: 'Бензин',
                diesel: 'Дизель'
            },
            // Shortened names
            // Standardized names as requested
            'Futura 95': '95',
            'Futura 98': '98',
            'Futura D': 'Diesel',
            'Pro Diesel': 'Pro Diesel',

            map_title: 'Цены на АЗС',
            show_map: 'Показать карту',
            hide_map: 'Скрыть карту',

            insights: {
                title: "Динамика",
                period_24h: "24ч",
                period_7d: "7д",
                period_30d: "30д",
                period_3m: "90д"
            },
            intervals: {
                hours: "Часы",
                days: "Дни",
                weeks: "Недели",
                months: "Месяцы",
                years: "Годы"
            },
            notification: {
                prices_changed: "Цены обновлены",
                data_refreshed: "Обновлено",
                no_changes: "Цены не изменились",
                item_increased: "Цена {{fuel}} выросла на {{diff}}¢",
                item_decreased: "Цена {{fuel}} снизилась на {{diff}}¢",
                item_unchanged: "Цена {{fuel}} не изменилась"
            },
            discounts: 'Скидки',
            all_stations_same_price: 'Одинаковая цена на всех АЗС',
            avg_prices: {
                title: 'Средняя цена',
                table_title: 'История цен',
                day: 'День',
                avg_for_period: 'Сред. за период',
                avg_for_days: 'Ø цена за {{count}} д.',
                latest_disclaimer: 'Для каждого дня показана последняя зафиксированная цена',
                avg: 'Сред.',
                min: 'Мин',
                max: 'Макс',
                overall_avg: 'Общая сред.',
                range: 'Диапазон',
                no_data: 'Нет данных за этот период',
                vs_prev: 'к пред.',
                last_7_days: 'Последние 7 дней',
                last_30_days: '30 д.',
                this_month: 'Этот месяц',
                last_month: 'Прошлый месяц',
                days_short: 'д',
                show_more: 'Показать ещё',
                showing_of: 'Показано {{visible}} из {{total}} дней'
            }
        }
    }
};

// Get initial language from URL params or localStorage
const getInitialLanguage = () => {
    // Check URL params first
    const params = new URLSearchParams(window.location.search);
    const langParam = params.get('lang');
    if (langParam && ['en', 'lv', 'ru'].includes(langParam)) {
        return langParam;
    }

    // Then check localStorage
    const storedLang = localStorage.getItem('i18nextLng');
    if (storedLang && ['en', 'lv', 'ru'].includes(storedLang)) {
        return storedLang;
    }

    // Default to English
    return 'en';
};

i18n
    .use(initReactI18next)
    .init({
        resources,
        lng: getInitialLanguage(),
        fallbackLng: "en",
        interpolation: {
            escapeValue: true
        }
    });

export default i18n;
