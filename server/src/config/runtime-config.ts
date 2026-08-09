import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AppEnvironment = 'development' | 'test' | 'production';

export interface RuntimeConfig {
  appEnv: AppEnvironment;
  databaseUrl: string;
  port: number;
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigins: string[];
  allowDraftFixtures: boolean;
  locationResolver: 'http' | 'mock';
  weatherProvider: 'http' | 'mock';
  seasonDate?: string;
  locationApiKey?: string;
  qWeatherApiHost?: string;
  qWeatherKey?: string;
  weatherProviderTimeoutMs: number;
  rateLimitGlobalLimit: number;
  rateLimitTtlMs: number;
}

const DEFAULT_DEVELOPMENT_JWT_SECRET = 'terrace-grow-local-development-secret';
const REJECTED_PRODUCTION_SECRETS = new Set([
  'dev-secret',
  DEFAULT_DEVELOPMENT_JWT_SECRET,
  'replace-with-a-strong-secret-in-production',
  'change-me',
  'changeme',
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
  const weatherProvider = parseMode('WEATHER_PROVIDER', env.WEATHER_PROVIDER, 'http');
  const seasonDate = optionalString(env.SEASON_DATE);
  const corsOrigins = parseCorsOrigins(env.CORS_ORIGINS);
  const jwtSecret = optionalString(env.JWT_SECRET) ?? DEFAULT_DEVELOPMENT_JWT_SECRET;

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
    weatherProvider,
    seasonDate,
    locationApiKey: optionalString(env.LOCATION_API_KEY),
    qWeatherApiHost: optionalString(env.QWEATHER_API_HOST),
    qWeatherKey: optionalString(env.QWEATHER_KEY),
    weatherProviderTimeoutMs: parseInteger('WEATHER_PROVIDER_TIMEOUT_MS', env.WEATHER_PROVIDER_TIMEOUT_MS, 3500, 1, 30000),
    rateLimitGlobalLimit: parseInteger('RATE_LIMIT_GLOBAL_LIMIT', env.RATE_LIMIT_GLOBAL_LIMIT, 300, 1, 10000),
    rateLimitTtlMs: parseInteger('RATE_LIMIT_TTL_MS', env.RATE_LIMIT_TTL_MS, 60000, 1000, 3600000),
  };
}

@Injectable()
export class AppConfigService {
  readonly value: RuntimeConfig;

  constructor(config: ConfigService) {
    const keys = [
      'APP_ENV', 'DATABASE_URL', 'PORT', 'JWT_SECRET', 'JWT_EXPIRES_IN',
      'CORS_ORIGINS', 'ALLOW_DRAFT_FIXTURES', 'LOCATION_RESOLVER',
      'WEATHER_PROVIDER', 'SEASON_DATE', 'LOCATION_API_KEY', 'QWEATHER_API_HOST',
      'QWEATHER_KEY', 'WEATHER_PROVIDER_TIMEOUT_MS', 'RATE_LIMIT_GLOBAL_LIMIT',
      'RATE_LIMIT_TTL_MS',
    ];
    this.value = parseRuntimeEnvironment(
      Object.fromEntries(keys.map((key) => [key, config.get(key)])),
    );
  }
}
