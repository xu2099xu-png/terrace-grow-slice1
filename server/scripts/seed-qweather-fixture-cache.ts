import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { AppConfigService } from '../src/config/runtime-config';
import { QWeatherDistrictHttpProvider } from '../src/weather/district-weather.provider';
import {
  QWEATHER_CURRENT_FIXTURE,
  QWEATHER_DAILY_FIXTURE,
  QWEATHER_WARNING_REFER_FIXTURE,
} from '../src/weather/qweather-contract';
import {
  buildWeatherCacheIdentity,
  WeatherCacheService,
} from '../src/weather/weather-cache.service';

const DEFAULT_SELECTED_AREA_CODE = '330102';
const DEFAULT_FIXTURE_TODAY = '2026-08-09';
const DEFAULT_NOW = '2026-08-09T04:00:00.000Z';
const FIXTURE_HOST = 'qweather-fixture.invalid';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fixtureDir(): string {
  const candidates = [
    path.resolve(__dirname, '..', 'src', 'weather', 'fixtures'),
    path.resolve(__dirname, '..', '..', 'src', 'weather', 'fixtures'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`QWeather fixture directory not found: ${candidates.join(', ')}`);
  return found;
}

function readFixture(file: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir(), file), 'utf8'));
}

function config(): AppConfigService {
  return {
    value: {
      weatherProviderBaseUrl: `https://${FIXTURE_HOST}`,
      weatherProviderApiKey: 'smoke-fixture-key',
      qWeatherApiHost: undefined,
      qWeatherKey: undefined,
      weatherProviderTimeoutMs: 1000,
      weatherCacheTtlSeconds: 86400,
    },
  } as AppConfigService;
}

async function main() {
  const selectedAreaCode = arg('selected-area-code') ?? DEFAULT_SELECTED_AREA_CODE;
  const cacheBucket = arg('cache-bucket') ?? arg('today') ?? DEFAULT_FIXTURE_TODAY;
  const fixtureToday = arg('fixture-today') ?? DEFAULT_FIXTURE_TODAY;
  const now = new Date(arg('now') ?? DEFAULT_NOW);
  if (!/^\d{6}$/.test(selectedAreaCode)) throw new Error('selected-area-code must be 6 digits');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cacheBucket)) throw new Error('cache-bucket must be YYYY-MM-DD');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fixtureToday)) throw new Error('fixture-today must be YYYY-MM-DD');
  if (Number.isNaN(now.getTime())) throw new Error('now must be a valid instant');

  const fixtures = {
    current: readFixture(QWEATHER_CURRENT_FIXTURE.file),
    daily: readFixture(QWEATHER_DAILY_FIXTURE.file),
    warning: readFixture(QWEATHER_WARNING_REFER_FIXTURE.file),
  };
  const urls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    urls.push(url.toString());
    if (url.hostname !== FIXTURE_HOST) {
      throw new Error(`unexpected QWeather fixture smoke URL ${url.toString()}`);
    }
    if (url.pathname.startsWith('/weather/v1/current/')) {
      return new Response(JSON.stringify(fixtures.current), { status: 200 });
    }
    if (url.pathname.startsWith('/weather/v1/daily/')) {
      return new Response(JSON.stringify(fixtures.daily), { status: 200 });
    }
    if (url.pathname.startsWith('/weatheralert/v1/current/')) {
      return new Response(JSON.stringify(fixtures.warning), { status: 200 });
    }
    throw new Error(`unexpected QWeather fixture smoke path ${url.pathname}`);
  }) as typeof fetch;

  const prisma = new PrismaClient();
  try {
    const provider = new QWeatherDistrictHttpProvider(config());
    const live = await provider.fetchLive({
      selectedAreaCode,
      latitude: 30.2289457,
      longitude: 120.1928017,
      today: fixtureToday,
      now,
    });
    if (!live.cacheable || live.result.weather.status !== 'available') {
      throw new Error(`fixture weather was not cacheable available: ${JSON.stringify(live.result.weather)}`);
    }

    const cache = new WeatherCacheService(prisma as any);
    const identity = buildWeatherCacheIdentity(selectedAreaCode, cacheBucket);
    await cache.set(identity, live.result, 86400, now);
    const cached = await cache.get(identity, now);
    if (!cached || cached.weather.cache_hit !== true) {
      throw new Error('seeded QWeather fixture cache row did not read back as a cache hit');
    }

    console.log(JSON.stringify({
      status: 'seeded',
      selected_area_code: selectedAreaCode,
      cache_bucket: cacheBucket,
      fixture_today: fixtureToday,
      provider: identity.provider,
      provider_endpoint_version: identity.providerEndpointVersion,
      parser_version: identity.parserVersion,
      fetch_fixture_calls: urls.length,
      attribution_sources: cached.weather.attribution.sources,
    }));
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
