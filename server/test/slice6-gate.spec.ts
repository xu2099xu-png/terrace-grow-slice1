import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { AppConfigService, ConfigValidationError, parseRuntimeEnvironment } from '../src/config/runtime-config';
import { configureApplication } from '../src/http/application';
import { PrismaService } from '../src/prisma.service';
import { DISTRICT_WEATHER_PROVIDER, unavailableDistrictWeather } from '../src/weather/district-weather.interface';
import { testAppConfig } from './test-config';
import {
  ensureSlice6CatalogInDb,
  loadSlice6Catalog,
  SLICE6_DIRECT_ADMIN_CODE,
  SLICE6_PROXY_ADMIN_CODE,
  SLICE6_UNSUPPORTED_ADMIN_CODE,
} from './fixtures/slice6-region-catalog';

const RUN_ID = `${process.pid}-${Date.now()}`;

function sortedKeys(value: unknown): string[] {
  return Object.keys(value as Record<string, unknown>).sort();
}

function expectValidationError(body: any, path: string) {
  expect(body).toMatchObject({
    statusCode: 400,
    code: 'VALIDATION_ERROR',
    message: 'Invalid request',
  });
  expect(body.errors).toEqual(expect.arrayContaining([
    expect.objectContaining({ path }),
  ]));
}

async function createApp(): Promise<{
  app: INestApplication;
  weatherRequests: any[];
}> {
  const weatherRequests: any[] = [];
  const weatherProvider = {
    fetchDistrictWeather: vi.fn(async (input: any) => {
      weatherRequests.push(input);
      return {
        ...unavailableDistrictWeather(),
        weather: {
          ...unavailableDistrictWeather().weather,
          status: 'unavailable',
          warnings: ['provider off in slice6 gate'],
        },
      };
    }),
  };

  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AppConfigService)
    .useValue(testAppConfig({
      LOCATION_RESOLVER: 'mock',
      LOCATION_PROVIDER: 'mock',
      WEATHER_PROVIDER: 'off',
      AI_PROVIDER: 'off',
      SEASON_DATE: '2026-03-20',
      RATE_LIMIT_GLOBAL_LIMIT: '10000',
    }))
    .overrideProvider(DISTRICT_WEATHER_PROVIDER)
    .useValue(weatherProvider)
    .compile();

  const app = module.createNestApplication();
  configureApplication(app);
  await app.init();
  await ensureSlice6CatalogInDb(app.get(PrismaService));
  return { app, weatherRequests };
}

async function issueToken(app: INestApplication): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/anonymous')
    .send({ device_id: `slice6-gate-${RUN_ID}` })
    .expect(201);
  return res.body.token;
}

function readRuntimeSourceFiles(dir: string): Array<{ file: string; text: string }> {
  const files: Array<{ file: string; text: string }> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...readRuntimeSourceFiles(full));
    } else if (/\.(ts|vue)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')) {
      files.push({ file: full, text: fs.readFileSync(full, 'utf8') });
    }
  }
  return files;
}

describe('Slice 6 Gate - catalog freeze and HTTP contracts', () => {
  let app: INestApplication;
  let weatherRequests: any[];

  beforeAll(async () => {
    const created = await createApp();
    app = created.app;
    weatherRequests = created.weatherRequests;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('passes frozen catalog invariants and has a selected != climate nearest-proxy fixture', () => {
    const catalog = loadSlice6Catalog();
    expect(catalog.manifest.data_version).toBe('mca-xzqh-mainland-2026-08-09');
    expect(catalog.regions).toHaveLength(3211);
    expect(catalog.regions.filter((row) => row.level === 'district')).toHaveLength(2847);
    expect(catalog.popularCities).toHaveLength(17);
    expect(catalog.legacyCityMappings).toHaveLength(17);
    expect(catalog.regions.find((row) => row.admin_code === '110000')).toMatchObject({
      level: 'province',
      is_municipality: true,
    });
    expect(catalog.regions.some((row) => row.level === 'city' && row.parent_admin_code === '110000')).toBe(false);
    expect(catalog.directMappings.some((row) => row.admin_code === SLICE6_DIRECT_ADMIN_CODE)).toBe(true);
    expect(catalog.directMappings.some((row) => row.admin_code === SLICE6_PROXY_ADMIN_CODE)).toBe(false);
    expect(catalog.climateAnchors.length).toBeGreaterThan(0);
  });

  it('does not hardcode the full region directory or four municipality codes in H5 runtime source', () => {
    const h5Source = path.resolve(__dirname, '..', '..', 'h5', 'src');
    const joined = readRuntimeSourceFiles(h5Source).map((file) => file.text).join('\n');
    expect(joined).not.toContain('120000');
    expect(joined).not.toContain('310000');
    expect(joined).not.toContain('500000');
    expect(joined).not.toContain('香港特别行政区');
    expect(joined).not.toContain('澳门特别行政区');
  });

  it('returns exact region directory and municipality public semantics over HTTP', async () => {
    const provinces = await request(app.getHttpServer())
      .get('/api/location/regions?level=province')
      .expect(200);
    expect(provinces.body[0]).toEqual({
      admin_code: '110000',
      name: '北京市',
      level: 'province',
      parent_admin_code: null,
      is_municipality: true,
    });
    expect(provinces.body.every((row: any) => sortedKeys(row).join(',') === [
      'admin_code',
      'is_municipality',
      'level',
      'name',
      'parent_admin_code',
    ].sort().join(','))).toBe(true);

    await request(app.getHttpServer())
      .get('/api/location/regions?level=city&parent_admin_code=110000')
      .expect(200, []);

    const beijingDistricts = await request(app.getHttpServer())
      .get('/api/location/regions?level=district&parent_admin_code=110000')
      .expect(200);
    expect(beijingDistricts.body[0]).toMatchObject({
      admin_code: '110101',
      level: 'district',
      parent_admin_code: '110000',
      is_municipality: false,
    });

    const hangzhouDistricts = await request(app.getHttpServer())
      .get('/api/location/regions?level=district&parent_admin_code=330100')
      .expect(200);
    expect(hangzhouDistricts.body[0]).toMatchObject({
      admin_code: '330102',
      name: '上城区',
    });

    const popular = await request(app.getHttpServer())
      .get('/api/location/popular-cities')
      .expect(200);
    expect(popular.body[0]).toEqual({
      display_area_code: '110000',
      display_name: '北京',
      kind: 'municipality',
      province_admin_code: '110000',
      province_name: '北京市',
      city_admin_code: null,
      city_name: null,
    });
    expect(popular.body.find((row: any) => row.kind === 'city' && row.display_name === '杭州')).toEqual({
      display_area_code: '330100',
      display_name: '杭州',
      kind: 'city',
      province_admin_code: '330000',
      province_name: '浙江省',
      city_admin_code: '330100',
      city_name: '杭州市',
    });
    for (const row of popular.body) {
      expect(sortedKeys(row)).toEqual([
        'city_admin_code',
        'city_name',
        'display_area_code',
        'display_name',
        'kind',
        'province_admin_code',
        'province_name',
      ]);
      expect(row).not.toHaveProperty('legacy_city_code');
      expect(row).not.toHaveProperty('legacyCityCode');
      expect(row).not.toHaveProperty('catalog_order');
      expect(row).not.toHaveProperty('data_version');
      expect(row).not.toHaveProperty('dataVersion');
      expect(row).not.toHaveProperty('source');
      expect(row).not.toHaveProperty('enabled');
    }
  });

  it('resolves mock browser location to a district without raw provider payload or precise coordinates', async () => {
    const located = await request(app.getHttpServer())
      .post('/api/location/resolve')
      .send({ lat: 39.9, lng: 116.4 })
      .expect(201);
    expect(located.body).toEqual({
      admin_code: '110108',
      name: '海淀区',
      level: 'district',
      province_name: '北京市',
      city_name: '北京市',
    });
    expect(JSON.stringify(located.body)).not.toContain('regeocode');
    expect(JSON.stringify(located.body)).not.toContain('116.4');

    const invalid = await request(app.getHttpServer())
      .post('/api/location/resolve')
      .send({ lat: 91, lng: 116.4 })
      .expect(400);
    expectValidationError(invalid.body, 'lat');

    const unresolved = await request(app.getHttpServer())
      .post('/api/location/resolve')
      .send({ lat: 0, lng: 0 })
      .expect(201);
    expect(unresolved.text === '' || unresolved.body === null || Object.keys(unresolved.body).length === 0)
      .toBe(true);
  });

  it('returns exact seasonal home contracts for direct, nearest_proxy, unsupported, and invalid admin_code', async () => {
    const direct = await request(app.getHttpServer())
      .get(`/api/seasonal/home?admin_code=${SLICE6_DIRECT_ADMIN_CODE}`)
      .expect(200);
    expect(sortedKeys(direct.body)).toEqual(['agri_region_match', 'region', 'seasonal', 'today', 'weather']);
    expect(direct.body.region).toMatchObject({
      admin_code: SLICE6_DIRECT_ADMIN_CODE,
      province_name: '北京市',
      city_name: '北京市',
    });
    expect(direct.body.agri_region_match).toMatchObject({
      status: 'direct',
      selected_area_code: SLICE6_DIRECT_ADMIN_CODE,
      climate_area_code: SLICE6_DIRECT_ADMIN_CODE,
      proxy_used: false,
    });
    expect(direct.body.today).toMatchObject({
      date: '2026-03-20',
      timezone: 'Asia/Shanghai',
    });

    const proxy = await request(app.getHttpServer())
      .get(`/api/seasonal/home?admin_code=${SLICE6_PROXY_ADMIN_CODE}`)
      .expect(200);
    expect(proxy.body.agri_region_match).toMatchObject({
      status: 'nearest_proxy',
      selected_area_code: SLICE6_PROXY_ADMIN_CODE,
      proxy_used: true,
    });
    expect(proxy.body.agri_region_match.climate_area_code).not.toBe(SLICE6_PROXY_ADMIN_CODE);
    expect(proxy.body.agri_region_match.status).not.toBe('unsupported');
    expect(weatherRequests.at(-1)).toMatchObject({ selectedAreaCode: SLICE6_PROXY_ADMIN_CODE });
    expect(JSON.stringify(weatherRequests.at(-1))).not.toContain(proxy.body.agri_region_match.climate_area_code);

    const unsupported = await request(app.getHttpServer())
      .get(`/api/seasonal/home?admin_code=${SLICE6_UNSUPPORTED_ADMIN_CODE}`)
      .expect(200);
    expect(unsupported.body).toMatchObject({
      region: null,
      agri_region_match: {
        status: 'unsupported',
        selected_area_code: SLICE6_UNSUPPORTED_ADMIN_CODE,
        climate_area_code: null,
        proxy_used: false,
      },
      weather: {
        status: 'unavailable',
        source: null,
      },
      seasonal: {
        climate_data_status: 'unsupported',
        weather_data_status: 'unavailable',
        items: [],
      },
    });

    const invalid = await request(app.getHttpServer())
      .get('/api/seasonal/home?admin_code=abc')
      .expect(400);
    expectValidationError(invalid.body, 'admin_code');
  });

  it('keeps old /api/seasons/now city_code compatibility and terrace legacy cityCode creation', async () => {
    const legacySeasonal = await request(app.getHttpServer())
      .get('/api/seasons/now?city_code=beijing')
      .expect(200);
    expect(legacySeasonal.body).toMatchObject({
      city_code: 'beijing',
      location_status: 'ok',
    });

    const token = await issueToken(app);
    const terrace = await request(app.getHttpServer())
      .post('/api/terraces')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'slice6 legacy terrace',
        cityCode: 'beijing',
        sunExposureLevel: 'LONG',
        rainExposed: false,
      })
      .expect(201);
    expect(terrace.body).toMatchObject({
      cityCode: 'beijing',
    });
  });

  it('keeps production provider-off config valid while rejecting mock providers and missing http keys', () => {
    const baseProduction = {
      APP_ENV: 'production',
      DATABASE_URL: 'postgresql://terrace:terrace@postgres:5432/terrace_grow',
      JWT_SECRET: 'slice6-production-secret-value-0000001',
      CORS_ORIGINS: 'https://terrace.example.com',
      ALLOW_DRAFT_FIXTURES: 'false',
      LOCATION_RESOLVER: 'http',
      LOCATION_PROVIDER: 'off',
      WEATHER_PROVIDER: 'off',
      AI_PROVIDER: 'off',
    };
    expect(parseRuntimeEnvironment(baseProduction)).toMatchObject({
      appEnv: 'production',
      locationProvider: 'off',
      weatherProvider: 'off',
      aiProvider: 'off',
    });
    expect(() => parseRuntimeEnvironment({ ...baseProduction, WEATHER_PROVIDER: 'mock' }))
      .toThrow(ConfigValidationError);
    expect(() => parseRuntimeEnvironment({
      ...baseProduction,
      WEATHER_PROVIDER: 'http',
      WEATHER_PROVIDER_BASE_URL: 'https://weather.example.com',
      WEATHER_PROVIDER_TIMEOUT_MS: '2500',
    }))
      .toThrow('WEATHER_PROVIDER_API_KEY');
    expect(() => parseRuntimeEnvironment({ ...baseProduction, LOCATION_PROVIDER: 'mock' }))
      .toThrow(ConfigValidationError);
  });
});
