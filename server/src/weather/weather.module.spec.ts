import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppConfigService } from '../config/runtime-config';
import { HttpWeatherProvider } from './http-weather.provider';
import { MockWeatherProvider } from './mock-weather.provider';
import { OffWeatherProvider } from './off-weather.provider';
import { selectLegacyWeatherProvider } from './weather.module';

function config(weatherProvider: 'off' | 'http' | 'mock'): AppConfigService {
  return {
    value: {
      weatherProvider,
      qWeatherApiHost: 'tenant.qweatherapi.com',
      qWeatherKey: 'test-key',
    },
  } as AppConfigService;
}

describe('WeatherModule legacy WEATHER_PROVIDER token factory', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('selects unavailable off provider even when legacy QWeather credentials exist', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const off = new OffWeatherProvider();
    const provider = selectLegacyWeatherProvider(
      config('off'),
      new MockWeatherProvider(),
      new HttpWeatherProvider(config('off')),
      off,
    );

    await expect(provider.fetchRecent('beijing', '2026-08-09')).resolves.toEqual([]);
    expect(provider).toBe(off);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
