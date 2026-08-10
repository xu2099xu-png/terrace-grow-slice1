import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CALENDAR_ALGORITHM_VERSION } from '../calendar/calendar.types';
import {
  QWEATHER_ENDPOINT_VERSION,
  QWEATHER_PARSER_VERSION,
} from '../weather/qweather-contract';

export type AppEnvironment = 'development' | 'test' | 'production';
export type AiProviderMode = 'off' | 'mock' | 'openai_compatible';
export type ExternalProviderMode = 'off' | 'http' | 'mock';

export interface RuntimeConfig {
  appEnv: AppEnvironment;
  databaseUrl: string;
  port: number;
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigins: string[];
  allowDraftFixtures: boolean;
  locationResolver: 'http' | 'mock';
  locationProvider: ExternalProviderMode;
  locationProviderBaseUrl?: string;
  locationProviderApiKey?: string;
  locationProviderTimeoutMs: number;
  weatherProvider: ExternalProviderMode;
  weatherProviderBaseUrl?: string;
  weatherProviderApiKey?: string;
  weatherProviderTimeoutMs: number;
  weatherCacheTtlSeconds: number;
  weatherEndpointVersion: string;
  weatherParserVersion: string;
  regionCatalogVersion: string;
  calendarAlgorithmVersion: string;
  seasonDate?: string;
  locationApiKey?: string;
  qWeatherApiHost?: string;
  qWeatherKey?: string;
  rateLimitGlobalLimit: number;
  rateLimitTtlMs: number;
  aiProvider: AiProviderMode;
  aiProviderBaseUrl?: string;
  aiProviderApiKey?: string;
  aiProviderModel?: string;
  aiProviderTimeoutMs: number;
  aiPromptVersion: string;
  aiExplanationCacheTtlSeconds: number;
  aiDailyProviderCallCap: number;
  aiEndpointLimit: number;
  aiEndpointTtlMs: number;
}

const DEFAULT_DEVELOPMENT_JWT_SECRET = 'terrace-grow-local-development-secret';
const REJECTED_PRODUCTION_SECRETS = new Set([
  'dev-secret',
  DEFAULT_DEVELOPMENT_JWT_SECRET,
  'replace-with-a-strong-secret-in-production',
  'change-me',
  'changeme',
]);
const REGION_CATALOG_VERSION = 'mca-xzqh-mainland-2026-08-09';
const QWEATHER_SHARED_HOSTS = new Set([
  'api.qweather.com',
  'devapi.qweather.com',
  'geoapi.qweather.com',
]);

export class ConfigValidationError extends Error {
  constructor(variable: string, reason: string) {
    super(`Invalid configuration: ${variable} ${reason}`);
    this.name = 'ConfigValidationError';
  }
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseInteger(
  variable: string,
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = optionalString(value);
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw new ConfigValidationError(variable, 'must be an integer');
  const parsed = Number(raw);
  if (parsed < min || parsed > max) {
    throw new ConfigValidationError(variable, `must be between ${min} and ${max}`);
  }
  return parsed;
}

function parseMode(
  variable: string,
  value: unknown,
  fallback: 'http' | 'mock',
): 'http' | 'mock' {
  const raw = optionalString(value) ?? fallback;
  if (raw !== 'http' && raw !== 'mock') {
    throw new ConfigValidationError(variable, 'must be http or mock');
  }
  return raw;
}

function parseExternalProviderMode(
  variable: string,
  value: unknown,
  fallback: ExternalProviderMode,
): ExternalProviderMode {
  const raw = optionalString(value) ?? fallback;
  if (raw !== 'off' && raw !== 'http' && raw !== 'mock') {
    throw new ConfigValidationError(variable, 'must be off, http, or mock');
  }
  return raw;
}

function parseAiProviderMode(value: unknown): AiProviderMode {
  const raw = optionalString(value) ?? 'off';
  if (raw !== 'off' && raw !== 'mock' && raw !== 'openai_compatible') {
    throw new ConfigValidationError('AI_PROVIDER', 'must be off, mock, or openai_compatible');
  }
  return raw;
}

function requireString(variable: string, value: unknown): string {
  const raw = optionalString(value);
  if (!raw) throw new ConfigValidationError(variable, 'is required');
  return raw;
}

function requireExplicitInteger(
  variable: string,
  value: unknown,
  min: number,
  max: number,
): number {
  if (optionalString(value) === undefined) {
    throw new ConfigValidationError(variable, 'is required');
  }
  return parseInteger(variable, value, 0, min, max);
}

function validateAiBaseUrl(appEnv: AppEnvironment, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigValidationError('AI_PROVIDER_BASE_URL', 'must be a valid URL');
  }
  if (appEnv === 'production') {
    if (url.protocol !== 'https:') {
      throw new ConfigValidationError('AI_PROVIDER_BASE_URL', 'must use HTTPS in production');
    }
    return value;
  }
  if (url.protocol === 'https:') return value;
  if (
    url.protocol === 'http:'
    && ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  ) {
    return value;
  }
  throw new ConfigValidationError(
    'AI_PROVIDER_BASE_URL',
    'must use HTTPS, except localhost HTTP in development/test',
  );
}

function validatePromptVersion(value: string): string {
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(value)) {
    throw new ConfigValidationError(
      'AI_PROMPT_VERSION',
      'must contain 1-80 letters, numbers, dots, underscores, or hyphens',
    );
  }
  return value;
}

function validateProviderBaseUrl(variable: string, value: string, appEnv: AppEnvironment): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigValidationError(variable, 'must be a valid URL');
  }
  if (appEnv === 'production' && url.protocol !== 'https:') {
    throw new ConfigValidationError(variable, 'must use HTTPS in production');
  }
  if (url.protocol === 'https:') {
    return url.toString().replace(/\/$/, '');
  }
  if (
    url.protocol === 'http:'
    && ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  ) {
    return url.toString().replace(/\/$/, '');
  }
  throw new ConfigValidationError(
    variable,
    'must use HTTPS, except localhost HTTP in development/test',
  );
}

function parseFrozenValue(variable: string, value: unknown, expected: string): string {
  const raw = optionalString(value);
  if (raw === undefined) return expected;
  if (raw !== expected) {
    throw new ConfigValidationError(variable, `must equal ${expected}`);
  }
  return expected;
}

function validateQWeatherHost(variable: string, value: string): string {
  const host = value.trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/i.test(host)) {
    throw new ConfigValidationError(variable, 'must be a valid host');
  }
  if (QWEATHER_SHARED_HOSTS.has(host)) {
    throw new ConfigValidationError(variable, 'must not use a QWeather shared host');
  }
  return value;
}

function parseJwtExpiresIn(value: unknown): string {
  const raw = optionalString(value) ?? '365d';
  if (!/^[1-9]\d*(?:ms|s|m|h|d|w|y)$/.test(raw)) {
    throw new ConfigValidationError(
      'JWT_EXPIRES_IN',
      'must be a positive integer followed by ms, s, m, h, d, w, or y',
    );
  }
  return raw;
}

function parseCorsOrigins(value: unknown): string[] {
  const raw = optionalString(value);
  if (!raw) return [];
  const origins = raw.split(',').map((entry) => entry.trim()).filter(Boolean);
  for (const origin of origins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new ConfigValidationError('CORS_ORIGINS', 'must contain valid origins');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new ConfigValidationError('CORS_ORIGINS', 'must contain exact http(s) origins');
    }
  }
  return [...new Set(origins)];
}

export function parseRuntimeEnvironment(env: Record<string, unknown>): RuntimeConfig {
  const appEnv = (optionalString(env.APP_ENV) ?? 'development') as AppEnvironment;
  if (!['development', 'test', 'production'].includes(appEnv)) {
    throw new ConfigValidationError('APP_ENV', 'must be development, test, or production');
  }

  const databaseUrl = optionalString(env.DATABASE_URL);
  if (!databaseUrl) throw new ConfigValidationError('DATABASE_URL', 'is required');
  let database: URL;
  try {
    database = new URL(databaseUrl);
  } catch {
    throw new ConfigValidationError('DATABASE_URL', 'must be a PostgreSQL URL');
  }
  if (database.protocol !== 'postgresql:' && database.protocol !== 'postgres:') {
    throw new ConfigValidationError('DATABASE_URL', 'must be a PostgreSQL URL');
  }

  const port = parseInteger('PORT', env.PORT, 3000, 1, 65535);
  const allowDraftFixtures = env.ALLOW_DRAFT_FIXTURES === 'true';
  if (env.ALLOW_DRAFT_FIXTURES !== undefined && !['true', 'false'].includes(String(env.ALLOW_DRAFT_FIXTURES))) {
    throw new ConfigValidationError('ALLOW_DRAFT_FIXTURES', 'must be true or false');
  }

  const locationResolver = parseMode('LOCATION_RESOLVER', env.LOCATION_RESOLVER, 'http');
  const locationProvider = optionalString(env.LOCATION_PROVIDER)
    ? parseExternalProviderMode('LOCATION_PROVIDER', env.LOCATION_PROVIDER, 'off')
    : locationResolver === 'mock' ? 'mock' : 'off';
  const weatherProvider = parseExternalProviderMode('WEATHER_PROVIDER', env.WEATHER_PROVIDER, 'off');
  const aiProvider = parseAiProviderMode(env.AI_PROVIDER);
  const seasonDate = optionalString(env.SEASON_DATE);
  const corsOrigins = parseCorsOrigins(env.CORS_ORIGINS);
  const jwtSecret = optionalString(env.JWT_SECRET) ?? DEFAULT_DEVELOPMENT_JWT_SECRET;
  const aiProviderTimeoutMs = aiProvider === 'openai_compatible'
    ? requireExplicitInteger('AI_PROVIDER_TIMEOUT_MS', env.AI_PROVIDER_TIMEOUT_MS, 100, 30000)
    : parseInteger('AI_PROVIDER_TIMEOUT_MS', env.AI_PROVIDER_TIMEOUT_MS, 5000, 100, 30000);
  const aiPromptVersion = aiProvider === 'openai_compatible'
    ? validatePromptVersion(requireString('AI_PROMPT_VERSION', env.AI_PROMPT_VERSION))
    : validatePromptVersion(optionalString(env.AI_PROMPT_VERSION) ?? 'slice5-v1');
  const aiExplanationCacheTtlSeconds = aiProvider === 'openai_compatible'
    ? requireExplicitInteger('AI_EXPLANATION_CACHE_TTL_SECONDS', env.AI_EXPLANATION_CACHE_TTL_SECONDS, 60, 2592000)
    : parseInteger('AI_EXPLANATION_CACHE_TTL_SECONDS', env.AI_EXPLANATION_CACHE_TTL_SECONDS, 86400, 60, 2592000);
  const aiDailyProviderCallCap = aiProvider === 'openai_compatible'
    ? requireExplicitInteger('AI_DAILY_PROVIDER_CALL_CAP', env.AI_DAILY_PROVIDER_CALL_CAP, 0, 10000)
    : parseInteger('AI_DAILY_PROVIDER_CALL_CAP', env.AI_DAILY_PROVIDER_CALL_CAP, 20, 0, 10000);
  const aiEndpointLimit = aiProvider === 'openai_compatible'
    ? requireExplicitInteger('AI_ENDPOINT_LIMIT', env.AI_ENDPOINT_LIMIT, 1, 10000)
    : parseInteger('AI_ENDPOINT_LIMIT', env.AI_ENDPOINT_LIMIT, 20, 1, 10000);
  const aiEndpointTtlMs = aiProvider === 'openai_compatible'
    ? requireExplicitInteger('AI_ENDPOINT_TTL_MS', env.AI_ENDPOINT_TTL_MS, 1000, 3600000)
    : parseInteger('AI_ENDPOINT_TTL_MS', env.AI_ENDPOINT_TTL_MS, 60000, 1000, 3600000);
  const aiProviderBaseUrl = aiProvider === 'openai_compatible'
    ? validateAiBaseUrl(appEnv, requireString('AI_PROVIDER_BASE_URL', env.AI_PROVIDER_BASE_URL))
    : optionalString(env.AI_PROVIDER_BASE_URL);
  const aiProviderApiKey = aiProvider === 'openai_compatible'
    ? requireString('AI_PROVIDER_API_KEY', env.AI_PROVIDER_API_KEY)
    : optionalString(env.AI_PROVIDER_API_KEY);
  const aiProviderModel = aiProvider === 'openai_compatible'
    ? requireString('AI_PROVIDER_MODEL', env.AI_PROVIDER_MODEL)
    : optionalString(env.AI_PROVIDER_MODEL);
  const locationProviderBaseUrl = optionalString(env.LOCATION_PROVIDER_BASE_URL)
    ? validateProviderBaseUrl(
      'LOCATION_PROVIDER_BASE_URL',
      requireString('LOCATION_PROVIDER_BASE_URL', env.LOCATION_PROVIDER_BASE_URL),
      appEnv,
    )
    : undefined;
  const weatherProviderBaseUrl = optionalString(env.WEATHER_PROVIDER_BASE_URL)
    ? validateProviderBaseUrl(
      'WEATHER_PROVIDER_BASE_URL',
      requireString('WEATHER_PROVIDER_BASE_URL', env.WEATHER_PROVIDER_BASE_URL),
      appEnv,
    )
    : undefined;
  const locationProviderTimeoutMs = locationProvider === 'http'
    ? requireExplicitInteger('LOCATION_PROVIDER_TIMEOUT_MS', env.LOCATION_PROVIDER_TIMEOUT_MS, 1, 30000)
    : parseInteger('LOCATION_PROVIDER_TIMEOUT_MS', env.LOCATION_PROVIDER_TIMEOUT_MS, 3000, 1, 30000);
  const weatherProviderTimeoutMs = weatherProvider === 'http'
    ? requireExplicitInteger('WEATHER_PROVIDER_TIMEOUT_MS', env.WEATHER_PROVIDER_TIMEOUT_MS, 1, 30000)
    : parseInteger('WEATHER_PROVIDER_TIMEOUT_MS', env.WEATHER_PROVIDER_TIMEOUT_MS, 3500, 1, 30000);
  const weatherCacheTtlSeconds = parseInteger(
    'WEATHER_CACHE_TTL_SECONDS',
    env.WEATHER_CACHE_TTL_SECONDS,
    900,
    1,
    86400,
  );
  const regionCatalogVersion = parseFrozenValue(
    'REGION_CATALOG_VERSION',
    env.REGION_CATALOG_VERSION,
    REGION_CATALOG_VERSION,
  );
  const calendarAlgorithmVersion = parseFrozenValue(
    'CALENDAR_ALGORITHM_VERSION',
    env.CALENDAR_ALGORITHM_VERSION,
    CALENDAR_ALGORITHM_VERSION,
  );
  const weatherEndpointVersion = parseFrozenValue(
    'WEATHER_ENDPOINT_VERSION',
    env.WEATHER_ENDPOINT_VERSION,
    QWEATHER_ENDPOINT_VERSION,
  );
  const weatherParserVersion = parseFrozenValue(
    'WEATHER_PARSER_VERSION',
    env.WEATHER_PARSER_VERSION,
    QWEATHER_PARSER_VERSION,
  );

  if (appEnv === 'production') {
    if (!optionalString(env.JWT_SECRET) || jwtSecret.length < 32) {
      throw new ConfigValidationError('JWT_SECRET', 'must be explicitly set to at least 32 characters');
    }
    if (REJECTED_PRODUCTION_SECRETS.has(jwtSecret.toLowerCase())) {
      throw new ConfigValidationError('JWT_SECRET', 'uses a rejected example/default value');
    }
    if (corsOrigins.length === 0) {
      throw new ConfigValidationError('CORS_ORIGINS', 'must contain at least one origin');
    }
    if (allowDraftFixtures) {
      throw new ConfigValidationError('ALLOW_DRAFT_FIXTURES', 'must be false in production');
    }
    if (seasonDate) throw new ConfigValidationError('SEASON_DATE', 'is forbidden in production');
    if (locationResolver === 'mock') {
      throw new ConfigValidationError('LOCATION_RESOLVER', 'mock is forbidden in production');
    }
    if (weatherProvider === 'mock') {
      throw new ConfigValidationError('WEATHER_PROVIDER', 'mock is forbidden in production');
    }
    if (locationProvider === 'mock') {
      throw new ConfigValidationError('LOCATION_PROVIDER', 'mock is forbidden in production');
    }
    if (locationProvider === 'http') {
      requireString('LOCATION_PROVIDER_API_KEY', env.LOCATION_PROVIDER_API_KEY);
      if (!locationProviderBaseUrl) {
        throw new ConfigValidationError('LOCATION_PROVIDER_BASE_URL', 'is required');
      }
    }
    if (weatherProvider === 'http') {
      requireString('WEATHER_PROVIDER_API_KEY', env.WEATHER_PROVIDER_API_KEY);
      if (!weatherProviderBaseUrl && !optionalString(env.QWEATHER_API_HOST)) {
        throw new ConfigValidationError('WEATHER_PROVIDER_BASE_URL', 'or QWEATHER_API_HOST is required');
      }
      if (weatherProviderBaseUrl) {
        validateQWeatherHost('WEATHER_PROVIDER_BASE_URL', new URL(weatherProviderBaseUrl).hostname);
      }
      if (optionalString(env.QWEATHER_API_HOST)) {
        validateQWeatherHost(
          'QWEATHER_API_HOST',
          requireString('QWEATHER_API_HOST', env.QWEATHER_API_HOST),
        );
      }
    }
    if (aiProvider === 'mock') {
      throw new ConfigValidationError('AI_PROVIDER', 'mock is forbidden in production');
    }
  }

  return {
    appEnv,
    databaseUrl,
    port,
    jwtSecret,
    jwtExpiresIn: parseJwtExpiresIn(env.JWT_EXPIRES_IN),
    corsOrigins: corsOrigins.length > 0 ? corsOrigins : ['http://localhost:5173'],
    allowDraftFixtures,
    locationResolver,
    locationProvider,
    locationProviderBaseUrl,
    locationProviderApiKey: optionalString(env.LOCATION_PROVIDER_API_KEY),
    locationProviderTimeoutMs,
    weatherProvider,
    weatherProviderBaseUrl,
    weatherProviderApiKey: optionalString(env.WEATHER_PROVIDER_API_KEY),
    weatherProviderTimeoutMs,
    weatherCacheTtlSeconds,
    weatherEndpointVersion,
    weatherParserVersion,
    regionCatalogVersion,
    calendarAlgorithmVersion,
    seasonDate,
    locationApiKey: optionalString(env.LOCATION_API_KEY),
    qWeatherApiHost: optionalString(env.QWEATHER_API_HOST),
    qWeatherKey: optionalString(env.QWEATHER_KEY),
    rateLimitGlobalLimit: parseInteger('RATE_LIMIT_GLOBAL_LIMIT', env.RATE_LIMIT_GLOBAL_LIMIT, 300, 1, 10000),
    rateLimitTtlMs: parseInteger('RATE_LIMIT_TTL_MS', env.RATE_LIMIT_TTL_MS, 60000, 1000, 3600000),
    aiProvider,
    aiProviderBaseUrl,
    aiProviderApiKey,
    aiProviderModel,
    aiProviderTimeoutMs,
    aiPromptVersion,
    aiExplanationCacheTtlSeconds,
    aiDailyProviderCallCap,
    aiEndpointLimit,
    aiEndpointTtlMs,
  };
}

@Injectable()
export class AppConfigService {
  readonly value: RuntimeConfig;

  constructor(config: ConfigService) {
    const keys = [
      'APP_ENV', 'DATABASE_URL', 'PORT', 'JWT_SECRET', 'JWT_EXPIRES_IN',
      'CORS_ORIGINS', 'ALLOW_DRAFT_FIXTURES', 'LOCATION_RESOLVER',
      'LOCATION_PROVIDER', 'LOCATION_PROVIDER_BASE_URL', 'LOCATION_PROVIDER_API_KEY',
      'LOCATION_PROVIDER_TIMEOUT_MS', 'WEATHER_PROVIDER', 'WEATHER_PROVIDER_BASE_URL',
      'WEATHER_PROVIDER_API_KEY', 'WEATHER_PROVIDER_TIMEOUT_MS', 'WEATHER_CACHE_TTL_SECONDS',
      'WEATHER_ENDPOINT_VERSION', 'WEATHER_PARSER_VERSION', 'REGION_CATALOG_VERSION',
      'CALENDAR_ALGORITHM_VERSION', 'SEASON_DATE', 'LOCATION_API_KEY', 'QWEATHER_API_HOST',
      'QWEATHER_KEY', 'RATE_LIMIT_GLOBAL_LIMIT',
      'RATE_LIMIT_TTL_MS', 'AI_PROVIDER', 'AI_PROVIDER_BASE_URL',
      'AI_PROVIDER_API_KEY', 'AI_PROVIDER_MODEL', 'AI_PROVIDER_TIMEOUT_MS',
      'AI_PROMPT_VERSION', 'AI_EXPLANATION_CACHE_TTL_SECONDS',
      'AI_DAILY_PROVIDER_CALL_CAP', 'AI_ENDPOINT_LIMIT', 'AI_ENDPOINT_TTL_MS',
    ];
    this.value = parseRuntimeEnvironment(
      Object.fromEntries(keys.map((key) => [key, config.get(key)])),
    );
  }
}
