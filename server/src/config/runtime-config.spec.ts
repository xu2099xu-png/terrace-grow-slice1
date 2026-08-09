import { describe, expect, it } from 'vitest';
import { ConfigValidationError, parseRuntimeEnvironment } from './runtime-config';

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
});
