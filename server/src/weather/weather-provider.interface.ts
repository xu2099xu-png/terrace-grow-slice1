/**
 * WeatherProvider — thin abstraction over an external weather service.
 * Business rules depend ONLY on this internal structure (AC-06). Never call a
 * provider API from the seasonal engine.
 *
 * Data scope (AC-28): today + next 2 days = 3 local calendar days
 * (Asia/Shanghai date strings). Fields missing → 'unknown', never defaulted.
 */
/** DI token for the WeatherProvider abstraction (AC-06). */
export const WEATHER_PROVIDER = 'WEATHER_PROVIDER';

export interface DailyWeather {
  date: string; // Asia/Shanghai calendar date 'yyyy-MM-dd'
  tempMinC?: number;
  tempMaxC?: number;
  frostRisk?: boolean | 'unknown';
}

export interface WeatherProvider {
  /** Fetch recent-3-day weather. Return [] on timeout/error → unavailable. */
  fetchRecent(cityCode: string, today: string): Promise<DailyWeather[]>;
}

/** Add n days to a 'yyyy-MM-dd' date string (date-only arithmetic). */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
