import { Module } from '@nestjs/common';
import { WEATHER_PROVIDER, WeatherProvider } from './weather-provider.interface';
import { HttpWeatherProvider } from './http-weather.provider';
import { MockWeatherProvider } from './mock-weather.provider';
import { OffWeatherProvider } from './off-weather.provider';
import { AppConfigService } from '../config/runtime-config';
import {
  DISTRICT_WEATHER_PROVIDER,
  DistrictWeatherProvider,
} from './district-weather.interface';
import {
  DistrictWeatherFacadeProvider,
  MockDistrictWeatherProvider,
  OffDistrictWeatherProvider,
  QWeatherDistrictHttpProvider,
} from './district-weather.provider';
import { WeatherCacheService } from './weather-cache.service';

export function selectLegacyWeatherProvider(
  config: AppConfigService,
  mock: MockWeatherProvider,
  http: HttpWeatherProvider,
  off: OffWeatherProvider,
): WeatherProvider {
  if (config.value.weatherProvider === 'off') return off;
  return config.value.weatherProvider === 'mock' ? mock : http;
}

@Module({
  providers: [
    MockWeatherProvider,
    HttpWeatherProvider,
    OffWeatherProvider,
    OffDistrictWeatherProvider,
    MockDistrictWeatherProvider,
    QWeatherDistrictHttpProvider,
    WeatherCacheService,
    DistrictWeatherFacadeProvider,
    {
      // WEATHER_PROVIDER=mock enables the deterministic provider (tests/E2E).
      // Default (http) has no key → unavailable → graceful degradation (AC-20).
      provide: WEATHER_PROVIDER,
      inject: [AppConfigService, MockWeatherProvider, HttpWeatherProvider, OffWeatherProvider],
      useFactory: selectLegacyWeatherProvider,
    },
    {
      provide: DISTRICT_WEATHER_PROVIDER,
      inject: [DistrictWeatherFacadeProvider],
      useFactory: (provider: DistrictWeatherFacadeProvider): DistrictWeatherProvider => provider,
    },
  ],
  exports: [WEATHER_PROVIDER, DISTRICT_WEATHER_PROVIDER, WeatherCacheService],
})
export class WeatherModule {}
