import { Module } from '@nestjs/common';
import { WEATHER_PROVIDER, WeatherProvider } from './weather-provider.interface';
import { HttpWeatherProvider } from './http-weather.provider';
import { MockWeatherProvider } from './mock-weather.provider';
import { AppConfigService } from '../config/runtime-config';

@Module({
  providers: [
    MockWeatherProvider,
    HttpWeatherProvider,
    {
      // WEATHER_PROVIDER=mock enables the deterministic provider (tests/E2E).
      // Default (http) has no key → unavailable → graceful degradation (AC-20).
      provide: WEATHER_PROVIDER,
      inject: [AppConfigService, MockWeatherProvider, HttpWeatherProvider],
      useFactory: (
        config: AppConfigService,
        mock: MockWeatherProvider,
        http: HttpWeatherProvider,
      ): WeatherProvider => config.value.weatherProvider === 'mock' ? mock : http,
    },
  ],
  exports: [WEATHER_PROVIDER],
})
export class WeatherModule {}
