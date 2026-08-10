import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  DistrictWeatherResult,
  PublicDistrictWeather,
  WeatherAttribution,
} from './district-weather.interface';
import {
  QWEATHER_ENDPOINT_VERSION,
  QWEATHER_PARSER_VERSION,
  QWEATHER_PROVIDER,
} from './qweather-contract';

export interface WeatherCacheIdentity {
  selectedAreaCode: string;
  provider: string;
  providerEndpointVersion: string;
  parserVersion: string;
  bucket: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function buildWeatherCacheIdentity(
  selectedAreaCode: string,
  bucket: string,
  provider = QWEATHER_PROVIDER,
  providerEndpointVersion = QWEATHER_ENDPOINT_VERSION,
  parserVersion = QWEATHER_PARSER_VERSION,
): WeatherCacheIdentity {
  return {
    selectedAreaCode,
    provider,
    providerEndpointVersion,
    parserVersion,
    bucket,
  };
}

export function buildWeatherCacheKeyHash(identity: WeatherCacheIdentity): string {
  return sha256(JSON.stringify([
    identity.selectedAreaCode,
    identity.provider,
    identity.providerEndpointVersion,
    identity.bucket,
    identity.parserVersion,
  ]));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function validateAttribution(value: unknown): WeatherAttribution | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.name !== null && typeof row.name !== 'string') return null;
  if (row.url !== null && typeof row.url !== 'string') return null;
  if (!isStringArray(row.sources)) return null;
  return {
    name: row.name as string | null,
    url: row.url as string | null,
    sources: row.sources.slice(),
  };
}

function nullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

function validatePublicWeather(value: unknown): PublicDistrictWeather | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!['available', 'partial', 'unavailable'].includes(String(row.status))) return null;
  if (row.source !== null && typeof row.source !== 'string') return null;
  if (row.observed_at !== null && typeof row.observed_at !== 'string') return null;
  if (row.updated_at !== null && typeof row.updated_at !== 'string') return null;
  if (typeof row.cache_hit !== 'boolean') return null;
  const attribution = validateAttribution(row.attribution);
  if (!attribution) return null;
  if (typeof row.summary !== 'string') return null;
  if (row.condition !== null && typeof row.condition !== 'string') return null;
  if (row.wind !== null && typeof row.wind !== 'string') return null;
  if (!isStringArray(row.warnings)) return null;
  const temperatureCurrentC = nullableNumber(row.temperature_current_c);
  const temperatureMinC = nullableNumber(row.temperature_min_c);
  const temperatureMaxC = nullableNumber(row.temperature_max_c);
  const precipitationMm = nullableNumber(row.precipitation_mm);
  const precipitationProbabilityPercent = nullableNumber(row.precipitation_probability_percent);
  const humidityPercent = nullableNumber(row.humidity_percent);
  if (
    temperatureCurrentC === undefined
    || temperatureMinC === undefined
    || temperatureMaxC === undefined
    || precipitationMm === undefined
    || precipitationProbabilityPercent === undefined
    || humidityPercent === undefined
  ) return null;
  return {
    status: row.status as PublicDistrictWeather['status'],
    source: row.source as string | null,
    observed_at: row.observed_at as string | null,
    updated_at: row.updated_at as string | null,
    cache_hit: row.cache_hit as boolean,
    attribution,
    summary: row.summary as string,
    temperature_current_c: temperatureCurrentC,
    temperature_min_c: temperatureMinC,
    temperature_max_c: temperatureMaxC,
    condition: row.condition as string | null,
    precipitation_mm: precipitationMm,
    precipitation_probability_percent: precipitationProbabilityPercent,
    humidity_percent: humidityPercent,
    wind: row.wind as string | null,
    warnings: row.warnings.slice() as string[],
  };
}

function validateDailyWeather(value: unknown): DistrictWeatherResult['dailyWeather'] | null {
  if (!Array.isArray(value)) return null;
  const rows: DistrictWeatherResult['dailyWeather'] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const item = row as Record<string, unknown>;
    if (typeof item.date !== 'string') return null;
    if (item.tempMinC !== undefined && (typeof item.tempMinC !== 'number' || !Number.isFinite(item.tempMinC))) {
      return null;
    }
    if (item.tempMaxC !== undefined && (typeof item.tempMaxC !== 'number' || !Number.isFinite(item.tempMaxC))) {
      return null;
    }
    if (item.frostRisk !== undefined && item.frostRisk !== true && item.frostRisk !== false && item.frostRisk !== 'unknown') {
      return null;
    }
    rows.push({
      date: item.date,
      tempMinC: item.tempMinC as number | undefined,
      tempMaxC: item.tempMaxC as number | undefined,
      frostRisk: item.frostRisk as boolean | 'unknown' | undefined,
    });
  }
  return rows;
}

@Injectable()
export class WeatherCacheService {
  constructor(private readonly prisma: PrismaService) {}

  private get delegate(): any | null {
    return (this.prisma as any).weatherCache ?? null;
  }

  async get(identity: WeatherCacheIdentity, now = new Date()): Promise<DistrictWeatherResult | null> {
    const delegate = this.delegate;
    if (!delegate) return null;
    const row = await delegate.findUnique({
      where: {
        selectedAreaCode_provider_providerEndpointVersion_bucket_parserVersion: {
          selectedAreaCode: identity.selectedAreaCode,
          provider: identity.provider,
          providerEndpointVersion: identity.providerEndpointVersion,
          bucket: identity.bucket,
          parserVersion: identity.parserVersion,
        },
      },
    });
    if (!row || !(row.expiresAt instanceof Date) || row.expiresAt.getTime() <= now.getTime()) {
      return null;
    }
    const weather = validatePublicWeather(row.publicWeather);
    const dailyWeather = validateDailyWeather(row.dailyWeather);
    const attribution = validateAttribution(row.attribution);
    if (!weather || !dailyWeather || !attribution) return null;
    return {
      weather: {
        ...weather,
        cache_hit: true,
        attribution,
      },
      dailyWeather,
    };
  }

  async set(
    identity: WeatherCacheIdentity,
    result: DistrictWeatherResult,
    ttlSeconds: number,
    now = new Date(),
  ): Promise<void> {
    const delegate = this.delegate;
    if (!delegate) return;
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    await delegate.upsert({
      where: { cacheKeyHash: buildWeatherCacheKeyHash(identity) },
      create: {
        cacheKeyHash: buildWeatherCacheKeyHash(identity),
        selectedAreaCode: identity.selectedAreaCode,
        provider: identity.provider,
        providerEndpointVersion: identity.providerEndpointVersion,
        parserVersion: identity.parserVersion,
        bucket: identity.bucket,
        publicWeather: result.weather,
        dailyWeather: result.dailyWeather,
        attribution: result.weather.attribution,
        status: result.weather.status,
        observedAt: result.weather.observed_at ? new Date(result.weather.observed_at) : null,
        updatedAt: now,
        expiresAt,
      },
      update: {
        publicWeather: result.weather,
        dailyWeather: result.dailyWeather,
        attribution: result.weather.attribution,
        status: result.weather.status,
        observedAt: result.weather.observed_at ? new Date(result.weather.observed_at) : null,
        updatedAt: now,
        expiresAt,
      },
    });
  }
}
