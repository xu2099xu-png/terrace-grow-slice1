export const SHANGHAI_TIMEZONE = 'Asia/Shanghai';
export const CALENDAR_ALGORITHM_VERSION =
  'terrace-calendar-lunar-javascript-1.7.7-asia-shanghai-v1';
export const CALENDAR_SUPPORTED_START = '1900-01-31';
export const CALENDAR_SUPPORTED_END = '2100-12-31';

export interface LunarContext {
  status: 'available' | 'unavailable';
  month: string | null;
  day: string | null;
}

export interface TodayContext {
  date: string;
  weekday: string;
  timezone: typeof SHANGHAI_TIMEZONE;
  lunar: LunarContext;
  solar_term: string | null;
}
