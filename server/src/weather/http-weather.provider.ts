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

function parseApiHost(value: string | undefined): string | null {
  const host = value?.trim();
  if (!host || !/^[a-z0-9.-]+$/i.test(host)) return null;
  return host;
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
    const apiHost = parseApiHost(process.env.QWEATHER_API_HOST);
    const coords = CITY_METADATA[cityCode];
    if (!key || !apiHost || !coords) {
      this.logger.warn(
        `QWeather unavailable (key=${!!key}, host=${!!apiHost}, city=${cityCode}) — weather unavailable`,
      );
      return [];
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const url = new URL(`https://${apiHost}/v7/weather/3d`);
      url.searchParams.set('location', `${coords.lng},${coords.lat}`);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'X-QW-Api-Key': key },
      });
      if (!res.ok) return [];
      const json: any = await res.json();
      if (json.code !== '200' || !Array.isArray(json.daily)) return [];
      const expectedDates = [today, addDays(today, 1), addDays(today, 2)];
      const byDate = new Map<string, DailyWeather>();
      for (const d of json.daily) {
        const date = typeof d?.fxDate === 'string' ? d.fxDate : null;
        if (!date || !expectedDates.includes(date) || byDate.has(date)) continue;
        const tempMinC = parseTemp(d?.tempMin);
        const tempMaxC = parseTemp(d?.tempMax);
        // frost = reliably known only when tempMin parsed; never fake false.
        const frostRisk: boolean | 'unknown' =
          tempMinC === null ? 'unknown' : tempMinC <= 0 ? true : false;
        byDate.set(date, {
          date,
          tempMinC: tempMinC ?? undefined,
          tempMaxC: tempMaxC ?? undefined,
          frostRisk,
        });
      }
      return expectedDates.flatMap((date) => {
        const row = byDate.get(date);
        return row ? [row] : [];
      });
    } catch (e) {
      this.logger.warn(`weather fetch failed: ${(e as Error).message}`);
      return [];
    } finally {
      clearTimeout(timer);
    }
  }
}
