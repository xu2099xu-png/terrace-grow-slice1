import { Injectable } from '@nestjs/common';
import { DailyWeather, WeatherProvider, addDays } from './weather-provider.interface';

/** Deterministic mock for tests/Playwright: mild stable weather, no frost. */
@Injectable()
export class MockWeatherProvider implements WeatherProvider {
  async fetchRecent(_cityCode: string, today: string): Promise<DailyWeather[]> {
    return [0, 1, 2].map((i) => ({
      date: addDays(today, i),
      tempMinC: 18,
      tempMaxC: 26,
      frostRisk: false,
    }));
  }
}
