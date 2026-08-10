import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/runtime-config';
import {
  DistrictWeatherProvider,
  DistrictWeatherRequest,
  DistrictWeatherResult,
  PublicDistrictWeather,
  unavailableDistrictWeather,
} from './district-weather.interface';
import { addDays } from './weather-provider.interface';
import {
  parseQWeatherCurrentV1,
  parseQWeatherDailyV1,
  parseQWeatherWarningV1,
  ParsedQWeatherCurrent,
  ParsedQWeatherDaily,
} from './qweather-display.parser';
import {
  QWEATHER_ATTRIBUTION_NAME,
  QWEATHER_ATTRIBUTION_URL,
  QWEATHER_ENDPOINT_VERSION,
  QWEATHER_FORBIDDEN_HOSTS,
  QWEATHER_PARSER_VERSION,
  QWEATHER_PROVIDER,
} from './qweather-contract';
import { adaptQWeatherDailyToDailyWeather } from './seasonal-weather.adapter';
import { buildWeatherCacheIdentity, WeatherCacheService } from './weather-cache.service';

interface LiveWeatherResult {
  result: DistrictWeatherResult;
  cacheable: boolean;
}

function finiteCoordinate(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function resolveQWeatherBaseUrl(config: AppConfigService): URL | null {
  const baseUrl = config.value.weatherProviderBaseUrl;
  if (baseUrl) {
    try {
      const url = new URL(baseUrl);
      if (QWEATHER_FORBIDDEN_HOSTS.has(url.hostname)) return null;
      return url;
    } catch {
      return null;
    }
  }
  const apiHost = config.value.qWeatherApiHost?.trim();
  if (!apiHost || !/^[a-z0-9.-]+$/i.test(apiHost) || QWEATHER_FORBIDDEN_HOSTS.has(apiHost)) {
    return null;
  }
  return new URL(`https://${apiHost}`);
}

function makeUrl(baseUrl: URL, path: string, params: Record<string, string>): string {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

async function fetchJson(url: string, apiKey: string, timeoutMs: number): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'X-QW-Api-Key': apiKey },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function selectStatus(current: ParsedQWeatherCurrent | null, daily: ParsedQWeatherDaily | null): PublicDistrictWeather['status'] {
  if (!current && !daily) return 'unavailable';
  if (!current || !daily) return 'partial';
  const requiredFacts = [
    current.condition,
    current.temperatureCurrentC,
    daily.days[0]?.tempMinC ?? null,
    daily.days[0]?.tempMaxC ?? null,
  ];
  return requiredFacts.every((fact) => fact !== null && fact !== undefined) ? 'available' : 'partial';
}

function buildSummary(weather: PublicDistrictWeather): string {
  if (weather.status === 'unavailable') return '';
  const parts: string[] = [];
  if (weather.condition) parts.push(weather.condition);
  if (weather.temperature_current_c !== null) parts.push(`${weather.temperature_current_c}°C`);
  if (weather.temperature_min_c !== null && weather.temperature_max_c !== null) {
    parts.push(`${weather.temperature_min_c}-${weather.temperature_max_c}°C`);
  }
  return parts.join(' ');
}

function mergeSources(...groups: string[][]): string[] {
  return groups.flatMap((group) => group);
}

function buildPublicWeather(
  current: ParsedQWeatherCurrent | null,
  daily: ParsedQWeatherDaily | null,
  warningSources: string[],
  warnings: string[],
  now: Date,
): PublicDistrictWeather {
  const status = selectStatus(current, daily);
  if (status === 'unavailable') return unavailableDistrictWeather().weather;
  const today = daily?.days[0] ?? null;
  const weather: PublicDistrictWeather = {
    status,
    source: QWEATHER_PROVIDER,
    observed_at: null,
    updated_at: now.toISOString(),
    cache_hit: false,
    attribution: {
      name: QWEATHER_ATTRIBUTION_NAME,
      url: QWEATHER_ATTRIBUTION_URL,
      sources: mergeSources(
        current?.attributionSources ?? [],
        daily?.attributionSources ?? [],
        warningSources,
      ),
    },
    summary: '',
    temperature_current_c: current?.temperatureCurrentC ?? null,
    temperature_min_c: today?.tempMinC ?? null,
    temperature_max_c: today?.tempMaxC ?? null,
    condition: current?.condition ?? daily?.todayDisplay.condition ?? null,
    precipitation_mm: current?.precipitationMm ?? daily?.todayDisplay.precipitationMm ?? null,
    precipitation_probability_percent: daily?.todayDisplay.precipitationProbabilityPercent ?? null,
    humidity_percent: current?.humidityPercent ?? daily?.todayDisplay.humidityPercent ?? null,
    wind: current?.wind ?? daily?.todayDisplay.wind ?? null,
    warnings,
  };
  weather.summary = buildSummary(weather);
  return weather;
}

@Injectable()
export class OffDistrictWeatherProvider implements DistrictWeatherProvider {
  async fetchDistrictWeather(_request: DistrictWeatherRequest): Promise<DistrictWeatherResult> {
    return unavailableDistrictWeather();
  }
}

@Injectable()
export class MockDistrictWeatherProvider implements DistrictWeatherProvider {
  async fetchDistrictWeather(request: DistrictWeatherRequest): Promise<DistrictWeatherResult> {
    const now = request.now ?? new Date();
    const dailyWeather = [0, 1, 2].map((i) => ({
      date: addDays(request.today, i),
      tempMinC: 18,
      tempMaxC: 26,
      frostRisk: 'unknown' as const,
    }));
    return {
      weather: {
        status: 'available',
        source: 'mock',
        observed_at: null,
        updated_at: now.toISOString(),
        cache_hit: false,
        attribution: {
          name: 'Mock Weather',
          url: null,
          sources: [],
        },
        summary: '晴 22°C 18-26°C',
        temperature_current_c: 22,
        temperature_min_c: 18,
        temperature_max_c: 26,
        condition: '晴',
        precipitation_mm: 0,
        precipitation_probability_percent: 0,
        humidity_percent: 55,
        wind: '微风 1级',
        warnings: [],
      },
      dailyWeather,
    };
  }
}

@Injectable()
export class QWeatherDistrictHttpProvider {
  private readonly logger = new Logger(QWeatherDistrictHttpProvider.name);

  constructor(private readonly config: AppConfigService) {}

  async fetchLive(request: DistrictWeatherRequest): Promise<LiveWeatherResult> {
    const apiKey = this.config.value.weatherProviderApiKey ?? this.config.value.qWeatherKey;
    const baseUrl = resolveQWeatherBaseUrl(this.config);
    if (
      !apiKey
      || !baseUrl
      || !finiteCoordinate(request.latitude, -90, 90)
      || !finiteCoordinate(request.longitude, -180, 180)
    ) {
      return { result: unavailableDistrictWeather(), cacheable: false };
    }
    const coordPath = `${request.latitude}/${request.longitude}`;
    const commonParams = { localTime: 'true', lang: 'zh' };
    const timeoutMs = this.config.value.weatherProviderTimeoutMs;
    const [currentJson, dailyJson, warningJson] = await Promise.all([
      fetchJson(makeUrl(baseUrl, `/weather/v1/current/${coordPath}`, commonParams), apiKey, timeoutMs),
      fetchJson(makeUrl(baseUrl, `/weather/v1/daily/${coordPath}`, {
        ...commonParams,
        days: '3',
      }), apiKey, timeoutMs),
      fetchJson(makeUrl(baseUrl, `/weatheralert/v1/current/${coordPath}`, commonParams), apiKey, timeoutMs),
    ]);
    const now = request.now ?? new Date();
    const current = currentJson ? parseQWeatherCurrentV1(currentJson) : null;
    const daily = dailyJson ? parseQWeatherDailyV1(dailyJson, request.today) : null;
    const warning = warningJson ? parseQWeatherWarningV1(warningJson) : { ok: true as const, attributionSources: [], warnings: [], metadataTag: null, zeroResult: null };
    if (warningJson && !warning.ok && warning.malformedRefer) {
      this.logger.warn(`QWeather warning refer.sources malformed for selectedAreaCode=${request.selectedAreaCode}`);
    }
    const warningSources = warning.ok ? warning.attributionSources : [];
    const warnings = warning.ok ? warning.warnings : [];
    const weather = buildPublicWeather(current, daily, warningSources, warnings, now);
    if (weather.status === 'unavailable') {
      return { result: unavailableDistrictWeather(), cacheable: false };
    }
    return {
      result: {
        weather,
        dailyWeather: daily ? adaptQWeatherDailyToDailyWeather(daily, request.today) : [],
      },
      cacheable: !warningJson || warning.ok,
    };
  }
}

@Injectable()
export class DistrictWeatherFacadeProvider implements DistrictWeatherProvider {
  constructor(
    private readonly config: AppConfigService,
    private readonly off: OffDistrictWeatherProvider,
    private readonly mock: MockDistrictWeatherProvider,
    private readonly http: QWeatherDistrictHttpProvider,
    private readonly cache: WeatherCacheService,
  ) {}

  async fetchDistrictWeather(request: DistrictWeatherRequest): Promise<DistrictWeatherResult> {
    if (this.config.value.weatherProvider === 'off') {
      return this.off.fetchDistrictWeather(request);
    }
    if (this.config.value.weatherProvider === 'mock') {
      return this.mock.fetchDistrictWeather(request);
    }
    const now = request.now ?? new Date();
    const identity = buildWeatherCacheIdentity(
      request.selectedAreaCode,
      request.today,
      QWEATHER_PROVIDER,
      this.config.value.weatherEndpointVersion ?? QWEATHER_ENDPOINT_VERSION,
      this.config.value.weatherParserVersion ?? QWEATHER_PARSER_VERSION,
    );
    const cached = await this.cache.get(identity, now);
    if (cached) return cached;
    const live = await this.http.fetchLive({ ...request, now });
    if (live.cacheable && live.result.weather.status !== 'unavailable') {
      await this.cache.set(
        identity,
        live.result,
        this.config.value.weatherCacheTtlSeconds,
        now,
      );
    }
    return live.result;
  }
}
