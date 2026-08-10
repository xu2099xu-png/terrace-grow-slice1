import { DailyWeather } from './weather-provider.interface';
import { ParsedQWeatherDaily } from './qweather-display.parser';

export function adaptQWeatherDailyToDailyWeather(
  parsed: ParsedQWeatherDaily,
  today: string,
): DailyWeather[] {
  return parsed.days
    .filter((day) => day.date >= today)
    .slice(0, 3)
    .map((day) => ({
      date: day.date,
      tempMinC: day.tempMinC ?? undefined,
      tempMaxC: day.tempMaxC ?? undefined,
      frostRisk: 'unknown',
    }));
}
