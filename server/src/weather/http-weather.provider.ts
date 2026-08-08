import { Injectable, Logger } from '@nestjs/common';
import { DailyWeather, WeatherProvider, addDays } from './weather-provider.interface';
import { CITY_METADATA } from '../location/city-metadata';

/** Parse QWeather string-or-number temps ("12"/12) → number | null. */
function parseTemp(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Real HTTP adapter (QWeather Daily Forecast 3-day). Timeout/error → [] so the
 * seasonal pipeline degrades to weather_data_status=unavailable (AC-20).
 *
 * Contract (AC-07/closure-2):
 *  - location uses QWeather-accepted coordinates (lng,lat), not a raw city name
 *  - tempMin/tempMax parsed safely from string or number; unparsable → missing
 *  - frostRisk NEVER defaults to false: missing/unparsable tempMin → 'unknown'
 */
@Injectable()
export class HttpWeatherProvider implements WeatherProvider {
  private readonly logger = new Logger(HttpWeatherProvider.name);

  async fetchRecent(cityCode: string, today: string): Promise<DailyWeather[]> {
    const key = process.env.QWEATHER_KEY;
    const coords = CITY_METADATA[cityCode];
    if (!key || !coords) {
      this.logger.warn(`QWeather unavailable (key=${!!key}, city=${cityCode}) — weather unavailable`);
      return [];
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const url =
        'https://devapi.qweather.com/v7/weather/3d?' +
        `location=${coords.lng},${coords.lat}&key=${key}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return [];
      const json: any = await res.json();
      if (json.code !== '200' || !Array.isArray(json.daily)) return [];
      const out: DailyWeather[] = [];
      for (let i = 0; i < json.daily.length && i < 3; i++) {
        const d = json.daily[i];
        const tempMinC = parseTemp(d?.tempMin);
        const tempMaxC = parseTemp(d?.tempMax);
        // frost = reliably known only when tempMin parsed; never fake false.
        const frostRisk: boolean | 'unknown' =
          tempMinC === null ? 'unknown' : tempMinC <= 0 ? true : false;
        out.push({ date: addDays(today, i), tempMinC: tempMinC ?? undefined, tempMaxC: tempMaxC ?? undefined, frostRisk });
      }
      return out;
    } catch (e) {
      this.logger.warn(`weather fetch failed: ${(e as Error).message}`);
      return [];
    }
  }
}
