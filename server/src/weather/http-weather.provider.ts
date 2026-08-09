import { Injectable, Logger } from '@nestjs/common';
import { DailyWeather, WeatherProvider, addDays } from './weather-provider.interface';
import { CITY_METADATA } from '../location/city-metadata';
import { toShanghaiDateString } from '../engines/lifecycle-engine';

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

function parseCelsiusTemperature(fact: unknown): number | null {
  if (!fact || typeof fact !== 'object') return null;
  const value = parseTemp((fact as { value?: unknown }).value);
  const unit = (fact as { unit?: unknown }).unit;
  return value !== null && (unit === '°C' || unit === 'C') ? value : null;
}

function parseForecastDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : toShanghaiDateString(instant);
}

/**
 * Real HTTP adapter (QWeather Daily Forecast v1). Timeout/error → [] so the
 * seasonal pipeline degrades to weather_data_status=unavailable (AC-20).
 *
 * Contract (AC-07/closure-2):
 *  - location uses QWeather-accepted coordinates (lng,lat), not a raw city name
 *  - temperatureMin/temperatureMax facts are read from the supported v1 shape
 *  - QWeather provides no explicit frost fact, so frostRisk is always unknown
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
      const url = new URL(
        `https://${apiHost}/weather/v1/daily/${coords.lat}/${coords.lng}`,
      );
      url.searchParams.set('days', '3');
      url.searchParams.set('localTime', 'true');
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'X-QW-Api-Key': key },
      });
      if (!res.ok) return [];
      const json: any = await res.json();
      if (!Array.isArray(json.days)) return [];
      const expectedDates = [today, addDays(today, 1), addDays(today, 2)];
      const byDate = new Map<string, DailyWeather>();
      for (const d of json.days) {
        const date = parseForecastDate(d?.forecastStartTime);
        if (!date || !expectedDates.includes(date) || byDate.has(date)) continue;
        const tempMinC = parseCelsiusTemperature(d?.temperatureMin);
        const tempMaxC = parseCelsiusTemperature(d?.temperatureMax);
        byDate.set(date, {
          date,
          tempMinC: tempMinC ?? undefined,
          tempMaxC: tempMaxC ?? undefined,
          frostRisk: 'unknown',
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
