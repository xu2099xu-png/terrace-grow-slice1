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
});
