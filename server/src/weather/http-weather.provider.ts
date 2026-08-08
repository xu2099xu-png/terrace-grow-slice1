import { Injectable, Logger } from '@nestjs/common';
import { DailyWeather, WeatherProvider, addDays } from './weather-provider.interface';

/**
 * Real HTTP adapter (QWeather 和风天气). Timeout/error → [] so the seasonal
 * pipeline degrades to weather_data_status=unavailable (AC-20). Without a
 * configured key it always returns [] (never throws into the API).
 */
@Injectable()
export class HttpWeatherProvider implements WeatherProvider {
  private readonly logger = new Logger(HttpWeatherProvider.name);

  async fetchRecent(cityCode: string, today: string): Promise<DailyWeather[]> {
    const key = process.env.QWEATHER_KEY;
    if (!key) {
      this.logger.warn('QWEATHER_KEY not configured — weather unavailable');
      return [];
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const url =
        'https://devapi.qweather.com/v7/weather/3d?' +
        `location=${encodeURIComponent(cityCode)}&key=${key}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return [];
      const json: any = await res.json();
      if (json.code !== '200' || !Array.isArray(json.daily)) return [];
      const out: DailyWeather[] = [];
      for (let i = 0; i < json.daily.length && i < 3; i++) {
        const d = json.daily[i];
        out.push({
          date: addDays(today, i), // align to our calendar-day semantics
          tempMinC: typeof d.tempMin === 'number' ? d.tempMin : undefined,
          tempMaxC: typeof d.tempMax === 'number' ? d.tempMax : undefined,
          frostRisk: typeof d.tempMin === 'number' && Number(d.tempMin) <= 0 ? true : false,
        });
      }
      return out;
    } catch (e) {
      this.logger.warn(`weather fetch failed: ${(e as Error).message}`);
      return [];
    }
  }
}
