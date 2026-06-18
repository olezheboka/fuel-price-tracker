import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
    en: {
        translation: {
            app_title: "Fuel Prices",
            price: 'Price',
            latest: 'Latest',
            current_prices: 'Fuel prices',
            current_prices_disclaimer: 'We show the cheapest stations in each network. Prices at other stations may be higher than shown.',
            interested_in: 'Choose station & fuel',
            cheapest_badge: 'Best price',
            station_filter: 'Stations',
            fuel_filter: 'Fuel',
            stations_short: 'stations',
            fuels_short: 'fuels',
            stats_history: 'Statistics & History',
            history: 'Graph',
            loading: 'Loading...',
            analytics: 'Analytics',
            loading_initial: 'Loading...',

            liter_short: 'l',
            refresh: 'Refresh Data',
            retry: 'Retry',
            history_stale: "Couldn't refresh — showing last loaded data",
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
            data_source: 'Fuel prices from Neste, Circle K, Virši, Viada',
            disclaimer: 'Tracking fuel prices from Neste, Circle K, Virši and Viada',
            last_update: 'Last update',
            fuel_group: {
                petrol: 'Petrol',
                diesel: 'Diesel'
            },
            // Shortened names
            // Standardized names as requested
            'Futura 95': '95 Petrol',
            'Futura 98': '98 Petrol',
            'Futura D': 'Diesel',
            'Pro Diesel': 'Pro Diesel',
            'Gas': 'LPG',

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
            select_all: 'Select all',
            clear_all: 'Clear',
            only: 'Only',
            discounts: 'Discounts',
            all_stations_same_price: 'Same price at all stations',
            avg_prices: {
                title: 'Average Price',
                table_title: 'Price History',
                day: 'Day',
                avg_for_period: 'Avg. for period',
                avg_for_days: 'Ø price for {{count}} d.',
                latest_disclaimer: 'Showing the last recorded price',
                cheapest_disclaimer: 'The lowest price of the day among the selected stations is highlighted.',
                avg: 'Avg',
                min: 'Min',
                max: 'Max',
                overall_avg: 'Overall Avg',
                range: 'Range',
                no_data: 'No data for this period',
                vs_prev: 'vs prev',
                last_7_days: '7 d.',
                last_30_days: '30 d.',
                last_90_days: '90 d.',
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
            current_prices: 'Degvielas cenas',
            current_prices_disclaimer: 'Rādītas katra tīkla lētākās stacijas. Citās stacijās cena var būt augstāka par norādīto.',
            interested_in: 'Izvēlēties DUS un degvielu',
            cheapest_badge: 'Lētākā cena',
            station_filter: 'Tīkls',
            fuel_filter: 'Degviela',
            stations_short: 'tīkli',
            fuels_short: 'veidi',
            stats_history: 'Statistika un vēsture',
            history: 'Grafiks',
            loading: 'Ielādē...',
            analytics: 'Analītika',
            loading_initial: 'Ielādē...',

            liter_short: 'l',
            refresh: 'Atjaunot datus',
            retry: 'Mēģināt vēlreiz',
            history_stale: 'Neizdevās atjaunot — rāda pēdējos ielādētos datus',
            updated: 'Atjaunots',
            checked_just_now: '✓ Tikko pārbaudīts',
            no_data: 'Nav datu',
            valid_at: 'Spēkā:',
            station: 'Spēkā:',
            location: 'Atrašanās vieta:',
            copied: 'Nokopēts!',
            fuel_type: 'Degvielas veids',
            all: 'Visi',
            data_source: 'Degvielas cenas no Neste, Circle K, Virši, Viada',
            disclaimer: 'Tiek rādītas cenas Neste, Circle K, Virši un Viada stacijās.',
            last_update: 'Pēdējā atjaunošana',
            fuel_group: {
                petrol: 'Benzīns',
                diesel: 'Dīzeļdegviela'
            },
            // Shortened names
            // Standardized names as requested
            'Futura 95': '95 Benzīns',
            'Futura 98': '98 Benzīns',
            'Futura D': 'Dīzelis',
            'Pro Diesel': 'Pro dīzelis',
            'Gas': 'Gāze',

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
            select_all: 'Izvēlēties visus',
            clear_all: 'Notīrīt',
            only: 'Tikai',
            discounts: 'Atlaides',
            all_stations_same_price: 'Visās stacijās cenas vienādas',
            avg_prices: {
                title: 'Vidējā cena',
                table_title: 'Cenu vēsture',
                day: 'Diena',
                avg_for_period: 'Vid. par periodu',
                avg_for_days: 'Ø cena par {{count}} d.',
                latest_disclaimer: 'Rādīta pēdējā reģistrētā cena',
                cheapest_disclaimer: 'Ar krāsu izcelta dienas zemākā cena starp izvēlētajām DUS.',
                avg: 'Vid.',
                min: 'Min',
                max: 'Max',
                overall_avg: 'Kopējā vid.',
                range: 'Diapazons',
                no_data: 'Nav datu šim periodam',
                vs_prev: 'pret iepr.',
                last_7_days: '7 d.',
                last_30_days: '30 d.',
                last_90_days: '90 d.',
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
            current_prices: 'Цены на топливо',
            current_prices_disclaimer: 'Показаны самые дешёвые заправки каждой сети. На других заправках цена может быть выше указанной.',
            interested_in: 'Выбрать АЗС и топливо',
            cheapest_badge: 'Лучшая цена',
            station_filter: 'АЗС',
            fuel_filter: 'Топливо',
            stations_short: 'АЗС',
            fuels_short: 'топл.',
            stats_history: 'Статистика и история',
            history: 'График',
            loading: 'Загрузка...',
            analytics: 'Аналитика',
            loading_initial: 'Загрузка...',

            liter_short: 'л',
            refresh: 'Обновить данные',
            retry: 'Повторить',
            history_stale: 'Не удалось обновить — показаны последние загруженные данные',
            updated: 'Обновлено',
            checked_just_now: '✓ Проверено только что',
            no_data: 'Нет данных',
            valid_at: 'Актуально:',
            station: 'Актуально:',
            location: 'Адрес:',
            copied: 'Скопировано!',
            fuel_type: 'Тип топлива',
            all: 'Все',
            data_source: 'Цены на топливо от Neste, Circle K, Virši, Viada',
            disclaimer: 'Отображаются цены на АЗС Neste, Circle K, Virši и Viada',
            last_update: 'Последнее обновление',
            fuel_group: {
                petrol: 'Бензин',
                diesel: 'Дизель'
            },
            // Shortened names
            // Standardized names as requested
            'Futura 95': '95 бензин',
            'Futura 98': '98 бензин',
            'Futura D': 'Дизель',
            'Pro Diesel': 'Про дизель',
            'Gas': 'Газ',

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
            select_all: 'Выбрать все',
            clear_all: 'Сбросить',
            only: 'Только',
            discounts: 'Скидки',
            all_stations_same_price: 'Одинаковая цена на всех АЗС',
            avg_prices: {
                title: 'Средняя цена',
                table_title: 'История цен',
                day: 'День',
                avg_for_period: 'Сред. за период',
                avg_for_days: 'Ø цена за {{count}} д.',
                latest_disclaimer: 'Показана последняя зафиксированная цена',
                cheapest_disclaimer: 'Цветом выделена самая низкая цена дня среди выбранных АЗС.',
                avg: 'Сред.',
                min: 'Мин',
                max: 'Макс',
                overall_avg: 'Общая сред.',
                range: 'Диапазон',
                no_data: 'Нет данных за этот период',
                vs_prev: 'к пред.',
                last_7_days: '7 д.',
                last_30_days: '30 д.',
                last_90_days: '90 д.',
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
