import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppConfigService } from '../config/runtime-config';
import {
  DistrictWeatherFacadeProvider,
  MockDistrictWeatherProvider,
  OffDistrictWeatherProvider,
  QWeatherDistrictHttpProvider,
} from './district-weather.provider';
import { unavailableDistrictWeather } from './district-weather.interface';
import {
  buildWeatherCacheIdentity,
  buildWeatherCacheKeyHash,
  WeatherCacheService,
} from './weather-cache.service';

const fixtureDir = join(__dirname, 'fixtures');

function fixtureJson(file: string): unknown {
  return JSON.parse(readFileSync(join(fixtureDir, file), 'utf8'));
}

function config(overrides: Record<string, unknown> = {}): AppConfigService {
  return {
    value: {
      weatherProvider: 'http',
      weatherProviderBaseUrl: 'https://tenant.qweatherapi.com',
      weatherProviderApiKey: 'test-key',
      qWeatherApiHost: undefined,
      qWeatherKey: undefined,
      weatherProviderTimeoutMs: 1000,
      weatherCacheTtlSeconds: 900,
      weatherEndpointVersion: 'qweather-v1-display-current-daily-warning',
      weatherParserVersion:
        'qweather-current-v1-display-parser@1+qweather-daily-v1-agri-display-parser@1+qweather-weatheralert-v1-display-parser@2',
      ...overrides,
    },
  } as AppConfigService;
}

function response(json: unknown): Response {
  return new Response(JSON.stringify(json), { status: 200 });
}

describe('DistrictWeatherProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses exact QWeather v1 paths, X-QW-Api-Key auth, and latitude/longitude order', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect((init?.headers as Record<string, string>)['X-QW-Api-Key']).toBe('test-key');
      expect(url.searchParams.has('key')).toBe(false);
      if (url.pathname === '/weather/v1/current/30.25/120.16') {
        expect(url.searchParams.get('localTime')).toBe('true');
        expect(url.searchParams.get('lang')).toBe('zh');
        return response(fixtureJson('qweather-current-v1-display.fixture.json'));
      }
      if (url.pathname === '/weather/v1/daily/30.25/120.16') {
        expect(url.searchParams.get('days')).toBe('3');
        expect(url.searchParams.get('localTime')).toBe('true');
        expect(url.searchParams.get('lang')).toBe('zh');
        return response(fixtureJson('qweather-daily-v1-agri-display.fixture.json'));
      }
      if (url.pathname === '/weatheralert/v1/current/30.25/120.16') {
        expect(url.searchParams.get('localTime')).toBe('true');
        expect(url.searchParams.get('lang')).toBe('zh');
        return response(fixtureJson('qweather-weatheralert-v1-display.fixture.json'));
      }
      throw new Error(`unexpected URL ${url.toString()}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new QWeatherDistrictHttpProvider(config());
    const live = await provider.fetchLive({
      selectedAreaCode: '330102',
      latitude: 30.25,
      longitude: 120.16,
      today: '2026-08-09',
      now: new Date('2026-08-09T04:00:00.000Z'),
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(live.cacheable).toBe(true);
    expect(live.result.weather).toMatchObject({
      status: 'available',
      source: 'qweather',
      observed_at: null,
      updated_at: '2026-08-09T04:00:00.000Z',
      cache_hit: false,
      temperature_current_c: 26.4,
      temperature_min_c: 24.6,
      temperature_max_c: 31.2,
      precipitation_probability_percent: 64,
      humidity_percent: 72,
      warnings: ['杭州市气象台发布暴雨蓝色预警'],
    });
    expect(live.result.weather.attribution.name).toBe('和风天气/QWeather');
    expect(live.result.weather.attribution.url).toBe('https://www.qweather.com');
    expect(live.result.dailyWeather).toEqual([
      {
        date: '2026-08-09',
        tempMinC: 24.6,
        tempMaxC: 31.2,
        frostRisk: 'unknown',
      },
    ]);
  });

  it('returns usable current/daily weather but forbids caching when warning refer.sources is malformed', async () => {
    const malformedWarning = fixtureJson('qweather-weatheralert-v1-refer-compat.fixture.json') as any;
    malformedWarning.refer.sources = ['国家预警信息发布中心', { bad: true }];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input)).pathname;
      if (pathname.includes('/current/') && pathname.startsWith('/weather/v1')) {
        return response(fixtureJson('qweather-current-v1-display.fixture.json'));
      }
      if (pathname.includes('/daily/')) {
        return response(fixtureJson('qweather-daily-v1-agri-display.fixture.json'));
      }
      return response(malformedWarning);
    }));
    const provider = new QWeatherDistrictHttpProvider(config());

    const live = await provider.fetchLive({
      selectedAreaCode: '330102',
      latitude: 30.25,
      longitude: 120.16,
      today: '2026-08-09',
      now: new Date('2026-08-09T04:00:00.000Z'),
    });

    expect(live.result.weather.status).toBe('available');
    expect(live.result.weather.warnings).toEqual([]);
    expect(live.cacheable).toBe(false);
  });

  it('does not use legacy shared QWeather hosts', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = new QWeatherDistrictHttpProvider(config({
      weatherProviderBaseUrl: undefined,
      qWeatherApiHost: 'api.qweather.com',
      qWeatherKey: 'test-key',
    }));

    const live = await provider.fetchLive({
      selectedAreaCode: '330102',
      latitude: 30.25,
      longitude: 120.16,
      today: '2026-08-09',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(live.result.weather.status).toBe('unavailable');
  });

  it('mock display weather does not introduce a false frost fact', async () => {
    const provider = new MockDistrictWeatherProvider();

    const result = await provider.fetchDistrictWeather({
      selectedAreaCode: '330102',
      latitude: 30.25,
      longitude: 120.16,
      today: '2026-08-09',
    });

    expect(result.dailyWeather.map((day) => day.frostRisk)).toEqual([
      'unknown',
      'unknown',
      'unknown',
    ]);
  });

  it('uses selectedAreaCode-only weather cache identity and does not cache provider failures', async () => {
    const cache = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => undefined),
    };
    const http = {
      fetchLive: vi.fn(async () => ({ result: unavailableDistrictWeather(), cacheable: false })),
    };
    const facade = new DistrictWeatherFacadeProvider(
      config({ weatherProvider: 'http' }),
      new OffDistrictWeatherProvider(),
      new MockDistrictWeatherProvider(),
      http as any,
      cache as any,
    );

    const result = await facade.fetchDistrictWeather({
      selectedAreaCode: '130102',
      latitude: 38.04,
      longitude: 114.51,
      today: '2026-08-09',
      now: new Date('2026-08-09T04:00:00.000Z'),
    });

    expect(cache.get).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedAreaCode: '130102',
        providerEndpointVersion: 'qweather-v1-display-current-daily-warning',
        parserVersion:
          'qweather-current-v1-display-parser@1+qweather-daily-v1-agri-display-parser@1+qweather-weatheralert-v1-display-parser@2',
        bucket: '2026-08-09',
      }),
      new Date('2026-08-09T04:00:00.000Z'),
    );
    expect(http.fetchLive).toHaveBeenCalledWith(expect.objectContaining({
      selectedAreaCode: '130102',
    }));
    expect(cache.set).not.toHaveBeenCalled();
    expect(result.weather.status).toBe('unavailable');
  });

  it('serves valid cache hits without a provider call', async () => {
    const cached = {
      ...unavailableDistrictWeather(),
      weather: {
        ...unavailableDistrictWeather().weather,
        status: 'available' as const,
        source: 'qweather',
        updated_at: '2026-08-09T04:00:00.000Z',
        cache_hit: true,
        attribution: { name: '和风天气/QWeather', url: 'https://www.qweather.com', sources: ['source-a'] },
      },
    };
    const cache = {
      get: vi.fn(async () => cached),
      set: vi.fn(async () => undefined),
    };
    const http = { fetchLive: vi.fn() };
    const facade = new DistrictWeatherFacadeProvider(
      config({ weatherProvider: 'http' }),
      new OffDistrictWeatherProvider(),
      new MockDistrictWeatherProvider(),
      http as any,
      cache as any,
    );

    const result = await facade.fetchDistrictWeather({
      selectedAreaCode: '130102',
      latitude: 38.04,
      longitude: 114.51,
      today: '2026-08-09',
    });

    expect(result).toBe(cached);
    expect(http.fetchLive).not.toHaveBeenCalled();
  });
});

describe('WeatherCacheService', () => {
  it('builds stable hashes from selected_area_code/provider/version/bucket/parser only', () => {
    const identity = buildWeatherCacheIdentity('130102', '2026-08-09');

    expect(buildWeatherCacheKeyHash(identity)).toBe(buildWeatherCacheKeyHash({
      ...identity,
      selectedAreaCode: '130102',
    }));
    expect(buildWeatherCacheKeyHash(identity)).not.toBe(buildWeatherCacheKeyHash({
      ...identity,
      selectedAreaCode: '110105',
    }));
  });

  it('uses frozen endpoint and parser versions from runtime config as cache identities', async () => {
    const cache = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => undefined),
    };
    const http = {
      fetchLive: vi.fn(async () => ({ result: unavailableDistrictWeather(), cacheable: false })),
    };
    const facade = new DistrictWeatherFacadeProvider(
      config({ weatherProvider: 'http' }),
      new OffDistrictWeatherProvider(),
      new MockDistrictWeatherProvider(),
      http as any,
      cache as any,
    );

    await facade.fetchDistrictWeather({
      selectedAreaCode: '130102',
      latitude: 38.04,
      longitude: 114.51,
      today: '2026-08-09',
    });

    expect(cache.get).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedAreaCode: '130102',
        providerEndpointVersion: 'qweather-v1-display-current-daily-warning',
        parserVersion:
          'qweather-current-v1-display-parser@1+qweather-daily-v1-agri-display-parser@1+qweather-weatheralert-v1-display-parser@2',
        bucket: '2026-08-09',
      }),
      expect.any(Date),
    );
    expect(buildWeatherCacheKeyHash(buildWeatherCacheIdentity('130102', '2026-08-09')))
      .not.toBe(buildWeatherCacheKeyHash(buildWeatherCacheIdentity('110105', '2026-08-09')));
  });

  it('treats expired and corrupt cache rows as misses', async () => {
    const delegate = {
      findUnique: vi
        .fn()
        .mockResolvedValueOnce({
          expiresAt: new Date('2026-08-09T03:59:59.000Z'),
          publicWeather: {},
          dailyWeather: [],
          attribution: {},
        })
        .mockResolvedValueOnce({
          expiresAt: new Date('2026-08-09T05:00:00.000Z'),
          publicWeather: { corrupt: true },
          dailyWeather: [],
          attribution: {},
        }),
    };
    const service = new WeatherCacheService({ weatherCache: delegate } as any);
    const identity = buildWeatherCacheIdentity('130102', '2026-08-09');
    const now = new Date('2026-08-09T04:00:00.000Z');

    await expect(service.get(identity, now)).resolves.toBeNull();
    await expect(service.get(identity, now)).resolves.toBeNull();
  });
});
