import { AppConfigService, parseRuntimeEnvironment } from '../src/config/runtime-config';

export function testAppConfig(
  overrides: Record<string, string | undefined> = {},
): AppConfigService {
  const env: Record<string, unknown> = {
    ...process.env,
    APP_ENV: 'development',
    DATABASE_URL: process.env.DATABASE_URL,
    ALLOW_DRAFT_FIXTURES: 'true',
    ...overrides,
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key];
  }
  return { value: parseRuntimeEnvironment(env) } as AppConfigService;
}

export function productionTestConfig(
  overrides: Record<string, string | undefined> = {},
): AppConfigService {
  return testAppConfig({
    APP_ENV: 'production',
    ALLOW_DRAFT_FIXTURES: 'false',
    JWT_SECRET: 'slice4-production-test-secret-value-0001',
    CORS_ORIGINS: 'https://terrace.test',
    LOCATION_RESOLVER: 'http',
    WEATHER_PROVIDER: 'http',
    SEASON_DATE: undefined,
    ...overrides,
  });
}
