import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { AppConfigService } from '../src/config/runtime-config';
import { configureApplication } from '../src/http/application';
import { clientIpTracker } from '../src/rate-limit/client-tracker';
import { PrismaService } from '../src/prisma.service';
import { productionTestConfig, testAppConfig } from './test-config';

async function createApp(config = testAppConfig()): Promise<INestApplication> {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AppConfigService)
    .useValue(config)
    .compile();
  const app = module.createNestApplication();
  configureApplication(app);
  await app.init();
  return app;
}

async function issueToken(app: INestApplication, deviceId: string): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/auth/anonymous')
    .send({ device_id: deviceId })
    .expect(201);
  return response.body.token;
}

function expectValidationError(body: any, path: string) {
  expect(body).toMatchObject({
    statusCode: 400,
    code: 'VALIDATION_ERROR',
    message: 'Invalid request',
  });
  expect(Array.isArray(body.errors)).toBe(true);
  expect(body.errors.some((error: any) => (
    error.path === path
      && typeof error.code === 'string'
      && typeof error.message === 'string'
  ))).toBe(true);
}

describe('Slice 4 Gate - validation, auth, CORS, and health', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    token = await issueToken(app, 'slice4-main-device');
  });

  afterAll(async () => {
    await app.close();
  });

  it('missing anonymous input returns the frozen validation error shape', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/anonymous')
      .send({})
      .expect(400);
    expectValidationError(response.body, 'device_id');
  });

  it('unknown body and query properties are rejected', async () => {
    const body = await request(app.getHttpServer())
      .post('/api/location/resolve')
      .send({ lat: 39.9, lng: 116.4, extra: true })
      .expect(400);
    expectValidationError(body.body, 'extra');

    const query = await request(app.getHttpServer())
      .get('/api/crops?life_type=perennial&extra=1')
      .expect(400);
    expectValidationError(query.body, 'extra');
  });

  it('coordinates reject string coercion and out-of-range numbers', async () => {
    const stringInput = await request(app.getHttpServer())
      .post('/api/location/resolve')
      .send({ lat: '39.9', lng: 116.4 })
      .expect(400);
    expectValidationError(stringInput.body, 'lat');

    const range = await request(app.getHttpServer())
      .post('/api/location/resolve')
      .send({ lat: 91, lng: 116.4 })
      .expect(400);
    expectValidationError(range.body, 'lat');
  });

  it('required booleans reject truthy/falsy strings without coercion', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/terraces')
      .set('Authorization', `Bearer ${token}`)
      .send({ cityCode: 'beijing', sunExposureLevel: 'LONG', rainExposed: 'false' })
      .expect(400);
    expectValidationError(response.body, 'rainExposed');
  });

  it('strict dates and unique bounded arrays are transport contracts', async () => {
    const date = await request(app.getHttpServer())
      .post('/api/plantings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        terrace_id: 'terrace-id',
        crop_id: 'crop-grape',
        container_type_id: 'ct-plastic-pot',
        start_date: '2026-02-30',
      })
      .expect(400);
    expectValidationError(date.body, 'start_date');

    const array = await request(app.getHttpServer())
      .put('/api/users/me/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_ids: ['mat-peat', 'mat-peat'] })
      .expect(400);
    expectValidationError(array.body, 'material_ids');
  });

  it('path parameters reject invalid identifier formats', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/plantings/bad!id')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expectValidationError(response.body, 'id');
  });

  it('required auth returns 401 for missing, malformed, wrong-secret, and expired tokens', async () => {
    await request(app.getHttpServer()).get('/api/terraces/mine').expect(401);
    await request(app.getHttpServer())
      .get('/api/terraces/mine')
      .set('Authorization', 'Basic abc')
      .expect(401);

    const wrong = new JwtService({ secret: 'another-secret-that-is-not-the-app-secret' })
      .sign({ sub: 'someone' });
    await request(app.getHttpServer())
      .get('/api/terraces/mine')
      .set('Authorization', `Bearer ${wrong}`)
      .expect(401);

    const expired = app.get(JwtService).sign({ sub: 'someone' }, { expiresIn: -1 });
    await request(app.getHttpServer())
      .get('/api/terraces/mine')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);
  });

  it('tokens are shared by required and optional auth, while supplied invalid optional auth is 401', async () => {
    await request(app.getHttpServer())
      .get('/api/terraces/mine')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/seasons/now?city_code=beijing')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/seasons/now?city_code=beijing')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });

  it('concurrent anonymous auth converges on one identity and one user', async () => {
    const deviceId = `slice4-concurrent-${Date.now()}`;
    const tokens = await Promise.all(
      Array.from({ length: 8 }, () => issueToken(app, deviceId)),
    );
    const subjects = tokens.map((value) => app.get(JwtService).verify<{ sub: string }>(value).sub);

    expect(new Set(subjects).size).toBe(1);
    expect(await prisma.userIdentity.count({
      where: { provider: 'anonymous_device', providerUid: deviceId },
    })).toBe(1);
  });

  it('a token for a non-active user is rejected with 401', async () => {
    const inactiveToken = await issueToken(app, 'slice4-inactive-device');
    const identity = await prisma.userIdentity.findFirstOrThrow({
      where: { provider: 'anonymous_device', providerUid: 'slice4-inactive-device' },
    });
    await prisma.user.update({ where: { id: identity.userId }, data: { status: 'merged_into' } });
    try {
      await request(app.getHttpServer())
        .get('/api/terraces/mine')
        .set('Authorization', `Bearer ${inactiveToken}`)
        .expect(401);
    } finally {
      await prisma.user.update({ where: { id: identity.userId }, data: { status: 'active' } });
    }
  });

  it('domain failures are 4xx and never a successful error object', async () => {
    const noProfileToken = await issueToken(app, 'slice4-no-profile-device');
    const recommendation = await request(app.getHttpServer())
      .post('/api/recommendations/perennial')
      .set('Authorization', `Bearer ${noProfileToken}`)
      .send({ crop_id: 'crop-blueberry' })
      .expect(400);
    expect(recommendation.body.error).not.toBe('No terrace profile or crop not found');

    await request(app.getHttpServer())
      .post('/api/soil/calculate')
      .set('Authorization', `Bearer ${token}`)
      .send({ crop_id: 'crop-blueberry', container_type_id: 'missing-container' })
      .expect(400);
  });

  it('development CORS allows the local origin and does not reflect another origin', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/api/health/live')
      .set('Origin', 'http://localhost:5173')
      .expect(200);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await request(app.getHttpServer())
      .get('/api/health/live')
      .set('Origin', 'https://attacker.example')
      .expect(200);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('liveness has no DB dependency and readiness returns 503 on DB failure', async () => {
    const count = vi.spyOn(prisma.user, 'count').mockRejectedValueOnce(new Error('DB unavailable'));
    await request(app.getHttpServer()).get('/api/health/live').expect(200, { status: 'live' });
    await request(app.getHttpServer()).get('/api/health/ready').expect(503, { status: 'not_ready' });
    count.mockRestore();
  });

  it('development content health has exact status and body', async () => {
    await request(app.getHttpServer())
      .get('/api/health/content')
      .expect(200, { status: 'development_fixtures' });
  });
});

describe('Slice 4 Gate - exact environment-specific content health', () => {
  it('test content health returns test_fixtures', async () => {
    const app = await createApp(testAppConfig({ APP_ENV: 'test', ALLOW_DRAFT_FIXTURES: 'false' }));
    try {
      await request(app.getHttpServer())
        .get('/api/health/content')
        .expect(200, { status: 'test_fixtures' });
    } finally {
      await app.close();
    }
  });

  it('production draft-only content returns exact not_ready 503', async () => {
    const app = await createApp(productionTestConfig());
    try {
      await request(app.getHttpServer())
        .get('/api/health/content')
        .expect(503, { status: 'not_ready' });
    } finally {
      await app.close();
    }
  });

  it('production ready requires a coherent approved Crop + EnvironmentRequirement + SowingCalendar', async () => {
    const app = await createApp(productionTestConfig());
    const prisma = app.get(PrismaService);
    const calendar = await prisma.sowingCalendar.findFirstOrThrow({
      where: { cropId: 'crop-carrot', climateZoneCode: 'north_china' },
    });
    await prisma.crop.update({ where: { id: 'crop-carrot' }, data: { reviewStatus: 'approved' } });
    try {
      await request(app.getHttpServer())
        .get('/api/health/content')
        .expect(503, { status: 'not_ready' });

      await prisma.environmentRequirement.updateMany({
        where: { ownerType: 'crop', ownerId: 'crop-carrot' },
        data: { reviewStatus: 'approved' },
      });
      await request(app.getHttpServer())
        .get('/api/health/content')
        .expect(503, { status: 'not_ready' });

      await prisma.sowingCalendar.update({
        where: { id: calendar.id },
        data: { reviewStatus: 'approved' },
      });
      await request(app.getHttpServer())
        .get('/api/health/content')
        .expect(200, { status: 'ready' });
    } finally {
      await prisma.crop.update({ where: { id: 'crop-carrot' }, data: { reviewStatus: 'draft' } });
      await prisma.environmentRequirement.updateMany({
        where: { ownerType: 'crop', ownerId: 'crop-carrot' },
        data: { reviewStatus: 'draft' },
      });
      await prisma.sowingCalendar.update({
        where: { id: calendar.id },
        data: { reviewStatus: 'draft' },
      });
      await app.close();
    }
  });

  it('production CORS emits only the configured exact origin', async () => {
    const app = await createApp(productionTestConfig());
    try {
      const allowed = await request(app.getHttpServer())
        .get('/api/health/live')
        .set('Origin', 'https://terrace.test')
        .expect(200);
      expect(allowed.headers['access-control-allow-origin']).toBe('https://terrace.test');

      const denied = await request(app.getHttpServer())
        .get('/api/health/live')
        .set('Origin', 'https://attacker.example')
        .expect(200);
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});

describe('Slice 4 Gate - public rate limiting', () => {
  it('uses real connection identity rather than forwarded-header values', () => {
    expect(clientIpTracker({ ip: '10.0.0.8', headers: { 'x-forwarded-for': '1.1.1.1' } })).toBe('10.0.0.8');
    expect(clientIpTracker({ ip: '10.0.0.9', headers: { 'x-forwarded-for': '1.1.1.1' } })).toBe('10.0.0.9');
  });

  it('blocks forged bucket rotation with 429 and Retry-After', async () => {
    const app = await createApp();
    try {
      for (let index = 0; index < 20; index += 1) {
        await request(app.getHttpServer())
          .post('/api/auth/anonymous')
          .set('X-Forwarded-For', `198.51.100.${index + 1}`)
          .send({ device_id: `slice4-rate-${index}` })
          .expect(201);
      }
      const blocked = await request(app.getHttpServer())
        .post('/api/auth/anonymous')
        .set('X-Forwarded-For', '203.0.113.200')
        .send({ device_id: 'slice4-rate-blocked' })
        .expect(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });
});
