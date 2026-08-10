import { Injectable } from '@nestjs/common';
import { DailyWeather, WeatherProvider } from './weather-provider.interface';

@Injectable()
export class OffWeatherProvider implements WeatherProvider {
  async fetchRecent(_cityCode: string, _today: string): Promise<DailyWeather[]> {
    return [];
  }
}
