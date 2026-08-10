import { describe, expect, it } from 'vitest';
import { ConfigValidationError, parseRuntimeEnvironment } from './runtime-config';

const frozenWeatherEndpointVersion = 'qweather-v1-display-current-daily-warning';
const frozenWeatherParserVersion =
  'qweather-current-v1-display-parser@1+qweather-daily-v1-agri-display-parser@1+qweather-weatheralert-v1-display-parser@2';
const frozenRegionCatalogVersion = 'mca-xzqh-mainland-2026-08-09';
const frozenCalendarAlgorithmVersion =
  'terrace-calendar-lunar-javascript-1.7.7-asia-shanghai-v1';

const base = () => ({
  APP_ENV: 'development',
  DATABASE_URL: 'postgresql://terrace:terrace@localhost:5433/terrace_grow',
});

const production = () => ({
  ...base(),
  APP_ENV: 'production',
  JWT_SECRET: 'production-secret-with-more-than-32-characters',
  CORS_ORIGINS: 'https://grow.example.com',
  ALLOW_DRAFT_FIXTURES: 'false',
});

describe('Slice 4 runtime configuration', () => {
  it.each(['development', 'test', 'production'])('accepts valid APP_ENV=%s', (appEnv) => {
    const env = appEnv === 'production' ? production() : { ...base(), APP_ENV: appEnv };
    expect(parseRuntimeEnvironment(env).appEnv).toBe(appEnv);
  });

  it.each([
    ['APP_ENV', { ...base(), APP_ENV: 'preview' }],
    ['DATABASE_URL', { ...base(), DATABASE_URL: 'mysql://localhost/db' }],
    ['PORT', { ...base(), PORT: '0' }],
    ['PORT', { ...base(), PORT: 'not-a-port' }],
    ['JWT_EXPIRES_IN', { ...base(), JWT_EXPIRES_IN: 'forever' }],
  ])('rejects invalid %s', (variable, env) => {
    expect(() => parseRuntimeEnvironment(env)).toThrow(variable);
  });

  it.each([
    ['JWT_SECRET missing', { JWT_SECRET: undefined }],
    ['JWT_SECRET short', { JWT_SECRET: 'too-short' }],
    ['JWT_SECRET default', { JWT_SECRET: 'replace-with-a-strong-secret-in-production' }],
    ['CORS_ORIGINS', { CORS_ORIGINS: undefined }],
    ['ALLOW_DRAFT_FIXTURES', { ALLOW_DRAFT_FIXTURES: 'true' }],
    ['SEASON_DATE', { SEASON_DATE: '2026-04-10' }],
    ['LOCATION_RESOLVER', { LOCATION_RESOLVER: 'mock' }],
    ['WEATHER_PROVIDER', { WEATHER_PROVIDER: 'mock' }],
    ['AI_PROVIDER', { AI_PROVIDER: 'mock' }],
  ])('production rejects %s', (_label, override) => {
    const env = { ...production(), ...override };
    for (const [key, value] of Object.entries(env)) if (value === undefined) delete (env as any)[key];
    expect(() => parseRuntimeEnvironment(env)).toThrow(ConfigValidationError);
  });

  it('configuration errors name variables without echoing secret values', () => {
    const secret = 'secret-value-that-must-never-be-printed';
    try {
      parseRuntimeEnvironment({ ...production(), JWT_SECRET: secret, CORS_ORIGINS: 'not-an-origin' });
      throw new Error('expected configuration failure');
    } catch (error) {
      expect(String(error)).toContain('CORS_ORIGINS');
      expect(String(error)).not.toContain(secret);
    }
  });

  it('defaults AI explanation configuration to provider off', () => {
    const config = parseRuntimeEnvironment(base());
    expect(config.regionCatalogVersion).toBe(frozenRegionCatalogVersion);
    expect(config.locationProvider).toBe('off');
    expect(config.weatherProvider).toBe('off');
    expect(config.weatherCacheTtlSeconds).toBe(900);
    expect(config.calendarAlgorithmVersion).toBe(frozenCalendarAlgorithmVersion);
    expect(config.weatherEndpointVersion).toBe(frozenWeatherEndpointVersion);
    expect(config.weatherParserVersion).toBe(frozenWeatherParserVersion);
    expect(config.aiProvider).toBe('off');
    expect(config.aiProviderTimeoutMs).toBe(5000);
    expect(config.aiPromptVersion).toBe('slice5-v1');
    expect(config.aiExplanationCacheTtlSeconds).toBe(86400);
    expect(config.aiDailyProviderCallCap).toBe(20);
    expect(config.aiEndpointLimit).toBe(20);
    expect(config.aiEndpointTtlMs).toBe(60000);
    expect(config.aiProviderBaseUrl).toBeUndefined();
    expect(config.aiProviderApiKey).toBeUndefined();
    expect(config.aiProviderModel).toBeUndefined();
  });

  it('accepts complete openai-compatible AI config in development with localhost HTTP', () => {
    const config = parseRuntimeEnvironment({
      ...base(),
      AI_PROVIDER: 'openai_compatible',
      AI_PROVIDER_BASE_URL: 'http://localhost:11434/v1',
      AI_PROVIDER_API_KEY: 'local-test-key',
      AI_PROVIDER_MODEL: 'contract-fixture-model',
      AI_PROVIDER_TIMEOUT_MS: '4500',
      AI_PROMPT_VERSION: 'slice5-v1',
      AI_EXPLANATION_CACHE_TTL_SECONDS: '3600',
      AI_DAILY_PROVIDER_CALL_CAP: '7',
      AI_ENDPOINT_LIMIT: '8',
      AI_ENDPOINT_TTL_MS: '90000',
    });
    expect(config.aiProvider).toBe('openai_compatible');
    expect(config.aiProviderBaseUrl).toBe('http://localhost:11434/v1');
    expect(config.aiProviderApiKey).toBe('local-test-key');
    expect(config.aiProviderModel).toBe('contract-fixture-model');
    expect(config.aiProviderTimeoutMs).toBe(4500);
    expect(config.aiExplanationCacheTtlSeconds).toBe(3600);
    expect(config.aiDailyProviderCallCap).toBe(7);
    expect(config.aiEndpointLimit).toBe(8);
    expect(config.aiEndpointTtlMs).toBe(90000);
  });

  it.each([
    ['AI_PROVIDER_BASE_URL', { AI_PROVIDER_BASE_URL: undefined }],
    ['AI_PROVIDER_API_KEY', { AI_PROVIDER_API_KEY: undefined }],
    ['AI_PROVIDER_MODEL', { AI_PROVIDER_MODEL: undefined }],
    ['AI_PROVIDER_TIMEOUT_MS', { AI_PROVIDER_TIMEOUT_MS: undefined }],
    ['AI_PROMPT_VERSION', { AI_PROMPT_VERSION: undefined }],
    ['AI_EXPLANATION_CACHE_TTL_SECONDS', { AI_EXPLANATION_CACHE_TTL_SECONDS: undefined }],
    ['AI_DAILY_PROVIDER_CALL_CAP', { AI_DAILY_PROVIDER_CALL_CAP: undefined }],
    ['AI_ENDPOINT_LIMIT', { AI_ENDPOINT_LIMIT: undefined }],
    ['AI_ENDPOINT_TTL_MS', { AI_ENDPOINT_TTL_MS: undefined }],
  ])('openai-compatible AI config requires %s', (variable, override) => {
    const env = {
      ...base(),
      AI_PROVIDER: 'openai_compatible',
      AI_PROVIDER_BASE_URL: 'http://localhost:11434/v1',
      AI_PROVIDER_API_KEY: 'local-test-key',
      AI_PROVIDER_MODEL: 'contract-fixture-model',
      AI_PROVIDER_TIMEOUT_MS: '4500',
      AI_PROMPT_VERSION: 'slice5-v1',
      AI_EXPLANATION_CACHE_TTL_SECONDS: '3600',
      AI_DAILY_PROVIDER_CALL_CAP: '7',
      AI_ENDPOINT_LIMIT: '8',
      AI_ENDPOINT_TTL_MS: '90000',
      ...override,
    };
    for (const [key, value] of Object.entries(env)) if (value === undefined) delete (env as any)[key];
    expect(() => parseRuntimeEnvironment(env)).toThrow(variable);
  });

  it('production openai-compatible AI config requires HTTPS base URL', () => {
    expect(() => parseRuntimeEnvironment({
      ...production(),
      AI_PROVIDER: 'openai_compatible',
      AI_PROVIDER_BASE_URL: 'http://localhost:11434/v1',
      AI_PROVIDER_API_KEY: 'production-ai-key-that-is-not-printed',
      AI_PROVIDER_MODEL: 'prod-model',
      AI_PROVIDER_TIMEOUT_MS: '5000',
      AI_PROMPT_VERSION: 'slice5-v1',
      AI_EXPLANATION_CACHE_TTL_SECONDS: '86400',
      AI_DAILY_PROVIDER_CALL_CAP: '20',
      AI_ENDPOINT_LIMIT: '20',
      AI_ENDPOINT_TTL_MS: '60000',
    })).toThrow('AI_PROVIDER_BASE_URL');
  });

  it('AI provider key is never echoed in configuration errors', () => {
    const apiKey = 'ai-secret-value-that-must-not-be-printed';
    try {
      parseRuntimeEnvironment({
        ...production(),
        AI_PROVIDER: 'openai_compatible',
        AI_PROVIDER_BASE_URL: 'http://localhost:11434/v1',
        AI_PROVIDER_API_KEY: apiKey,
        AI_PROVIDER_MODEL: 'prod-model',
        AI_PROVIDER_TIMEOUT_MS: '5000',
        AI_PROMPT_VERSION: 'slice5-v1',
        AI_EXPLANATION_CACHE_TTL_SECONDS: '86400',
        AI_DAILY_PROVIDER_CALL_CAP: '20',
        AI_ENDPOINT_LIMIT: '20',
        AI_ENDPOINT_TTL_MS: '60000',
      });
      throw new Error('expected configuration failure');
    } catch (error) {
      expect(String(error)).toContain('AI_PROVIDER_BASE_URL');
      expect(String(error)).not.toContain(apiKey);
    }
  });

  it('accepts explicit Slice 6 provider config in development', () => {
    const config = parseRuntimeEnvironment({
      ...base(),
      REGION_CATALOG_VERSION: frozenRegionCatalogVersion,
      LOCATION_PROVIDER: 'http',
      LOCATION_PROVIDER_BASE_URL: 'http://localhost:3100',
      LOCATION_PROVIDER_API_KEY: 'location-test-key',
      LOCATION_PROVIDER_TIMEOUT_MS: '2500',
      WEATHER_PROVIDER: 'http',
      WEATHER_PROVIDER_BASE_URL: 'http://localhost:3200',
      WEATHER_PROVIDER_API_KEY: 'weather-test-key',
      WEATHER_PROVIDER_TIMEOUT_MS: '2600',
      WEATHER_CACHE_TTL_SECONDS: '600',
      WEATHER_ENDPOINT_VERSION: frozenWeatherEndpointVersion,
      WEATHER_PARSER_VERSION: frozenWeatherParserVersion,
      CALENDAR_ALGORITHM_VERSION: frozenCalendarAlgorithmVersion,
    });
    expect(config.locationProvider).toBe('http');
    expect(config.locationProviderBaseUrl).toBe('http://localhost:3100');
    expect(config.locationProviderApiKey).toBe('location-test-key');
    expect(config.locationProviderTimeoutMs).toBe(2500);
    expect(config.weatherProvider).toBe('http');
    expect(config.weatherProviderBaseUrl).toBe('http://localhost:3200');
    expect(config.weatherProviderApiKey).toBe('weather-test-key');
    expect(config.weatherProviderTimeoutMs).toBe(2600);
    expect(config.weatherCacheTtlSeconds).toBe(600);
  });

  it.each([
    ['REGION_CATALOG_VERSION', { REGION_CATALOG_VERSION: 'other-region-catalog' }],
    ['CALENDAR_ALGORITHM_VERSION', { CALENDAR_ALGORITHM_VERSION: 'other-calendar' }],
    ['WEATHER_ENDPOINT_VERSION', { WEATHER_ENDPOINT_VERSION: 'qweather-v1' }],
    ['WEATHER_PARSER_VERSION', { WEATHER_PARSER_VERSION: 'qweather-display-parser@1' }],
  ])('rejects non-frozen manifest override %s without echoing secrets', (variable, override) => {
    const secret = 'weather-secret-value-that-must-not-be-printed';
    try {
      parseRuntimeEnvironment({
        ...base(),
        WEATHER_PROVIDER_API_KEY: secret,
        ...override,
      });
      throw new Error('expected configuration failure');
    } catch (error) {
      expect(String(error)).toContain(variable);
      expect(String(error)).not.toContain(secret);
    }
  });

  it('keeps frozen Slice 3-compatible positive provider timeout minimums', () => {
    const config = parseRuntimeEnvironment({
      ...base(),
      LOCATION_PROVIDER: 'http',
      LOCATION_PROVIDER_BASE_URL: 'http://localhost:3100',
      LOCATION_PROVIDER_API_KEY: 'location-test-key',
      LOCATION_PROVIDER_TIMEOUT_MS: '1',
      WEATHER_PROVIDER: 'http',
      WEATHER_PROVIDER_BASE_URL: 'http://localhost:3200',
      WEATHER_PROVIDER_API_KEY: 'weather-test-key',
      WEATHER_PROVIDER_TIMEOUT_MS: '1',
    });
    expect(config.locationProviderTimeoutMs).toBe(1);
    expect(config.weatherProviderTimeoutMs).toBe(1);
  });

  it.each([
    ['LOCATION_PROVIDER', { LOCATION_PROVIDER: 'mock' }],
    ['LOCATION_PROVIDER_API_KEY', {
      LOCATION_PROVIDER: 'http',
      LOCATION_PROVIDER_BASE_URL: 'https://location.example.com',
      LOCATION_PROVIDER_TIMEOUT_MS: '2500',
    }],
    ['LOCATION_PROVIDER_BASE_URL', {
      LOCATION_PROVIDER: 'http',
      LOCATION_PROVIDER_API_KEY: 'location-test-key',
      LOCATION_PROVIDER_TIMEOUT_MS: '2500',
    }],
    ['WEATHER_PROVIDER_API_KEY', {
      WEATHER_PROVIDER: 'http',
      WEATHER_PROVIDER_BASE_URL: 'https://weather.example.com',
      WEATHER_PROVIDER_TIMEOUT_MS: '2500',
    }],
    ['WEATHER_PROVIDER_BASE_URL', {
      WEATHER_PROVIDER: 'http',
      WEATHER_PROVIDER_API_KEY: 'weather-test-key',
      WEATHER_PROVIDER_TIMEOUT_MS: '2500',
    }],
    ['WEATHER_PROVIDER_BASE_URL', {
      WEATHER_PROVIDER: 'http',
      WEATHER_PROVIDER_BASE_URL: 'https://api.qweather.com',
      WEATHER_PROVIDER_API_KEY: 'weather-test-key',
      WEATHER_PROVIDER_TIMEOUT_MS: '2500',
    }],
    ['QWEATHER_API_HOST', {
      WEATHER_PROVIDER: 'http',
      QWEATHER_API_HOST: 'devapi.qweather.com',
      WEATHER_PROVIDER_API_KEY: 'weather-test-key',
      WEATHER_PROVIDER_TIMEOUT_MS: '2500',
    }],
  ])('production Slice 6 provider config rejects invalid %s', (variable, override) => {
    expect(() => parseRuntimeEnvironment({ ...production(), ...override })).toThrow(variable);
  });

  it('production weather http accepts a dedicated QWeather host compatibility field', () => {
    const config = parseRuntimeEnvironment({
      ...production(),
      WEATHER_PROVIDER: 'http',
      QWEATHER_API_HOST: 'abc123.qweatherapi.com',
      WEATHER_PROVIDER_API_KEY: 'weather-test-key',
      WEATHER_PROVIDER_TIMEOUT_MS: '2500',
    });
    expect(config.weatherProvider).toBe('http');
    expect(config.qWeatherApiHost).toBe('abc123.qweatherapi.com');
  });
});
