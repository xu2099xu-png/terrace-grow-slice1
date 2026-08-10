import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AppConfigService } from '../src/config/runtime-config';
import { configureApplication } from '../src/http/application';
import { testAppConfig } from './test-config';

const PUBLIC_KEYS = ['answer', 'cache_hit', 'citations', 'source', 'status', 'warnings'];
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const RUN_ID = `${process.pid}-${Date.now()}`;

async function createApp(overrides: Record<string, string | undefined> = {}): Promise<INestApplication> {
  process.env.DATABASE_URL = testDatabaseUrl();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AppConfigService)
    .useValue(testAppConfig({
      DATABASE_URL: testDatabaseUrl(),
      AI_PROVIDER: 'off',
      AI_ENDPOINT_LIMIT: '50',
      AI_ENDPOINT_TTL_MS: '60000',
      RATE_LIMIT_GLOBAL_LIMIT: '10000',
      ...overrides,
    }))
    .compile();
  const app = module.createNestApplication();
  configureApplication(app);
  await app.init();
  return app;
}

function testDatabaseUrl(): string {
  const raw = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!raw) return 'postgresql://terrace:terrace@localhost:5433/terrace_grow_test?schema=public';
  const parsed = new URL(raw);
  parsed.pathname = '/terrace_grow_test';
  return parsed.toString();
}

async function issueToken(app: INestApplication, deviceId: string): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/auth/anonymous')
    .send({ device_id: deviceId })
    .expect(201);
  return response.body.token;
}

function askBody(question = '为什么推荐蓝莓') {
  return {
    context_type: 'perennial_plan',
    question,
    crop_id: 'crop-blueberry',
  };
}

async function createPlanting(app: INestApplication, token: string, suffix: string): Promise<string> {
  const terraceId = await createTerrace(app, token, suffix);
  const plan = await request(app.getHttpServer())
    .post('/api/recommendations/perennial')
    .set('Authorization', `Bearer ${token}`)
    .send({ crop_id: 'crop-grape' })
    .expect(201);
  const planting = await request(app.getHttpServer())
    .post('/api/plantings')
    .set('Authorization', `Bearer ${token}`)
    .send({
      terrace_id: terraceId,
      crop_id: 'crop-grape',
      variety_id: null,
      container_type_id: plan.body.container.selected_type_id,
      start_date: '2026-01-01',
      client_request_id: `ai-http-${suffix}`,
    })
    .expect(201);
  return planting.body.planting.id;
}

async function createTerrace(app: INestApplication, token: string, suffix: string): Promise<string> {
  const terrace = await request(app.getHttpServer())
    .post('/api/terraces')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `ai-http-${suffix}`, cityCode: 'beijing', sunExposureLevel: 'LONG', rainExposed: false })
    .expect(201);
  return terrace.body.id;
}

describe('Slice 5 AI HTTP contract', () => {
  const apps: INestApplication[] = [];

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
    if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
  });

  it('returns 401 for missing and malformed auth before the AI limiter', async () => {
    const app = await createApp({ AI_ENDPOINT_LIMIT: '1' });
    apps.push(app);

    await request(app.getHttpServer()).post('/api/ai/ask').send(askBody()).expect(401);
    await request(app.getHttpServer())
      .post('/api/ai/ask')
      .set('Authorization', 'Basic abc')
      .send(askBody())
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/ai/ask')
      .set('X-Forwarded-For', '203.0.113.10')
      .send(askBody())
      .expect(401);
  });

  it('returns exact HTTP 200 and exact public top-level keys for a valid request', async () => {
    const app = await createApp();
    apps.push(app);
    const token = await issueToken(app, `slice5-http-valid-${RUN_ID}`);
    await createTerrace(app, token, `valid-${RUN_ID}`);

    const response = await request(app.getHttpServer())
      .post('/api/ai/ask')
      .set('Authorization', `Bearer ${token}`)
      .send(askBody())
      .expect(200);

    expect(Object.keys(response.body).sort()).toEqual(PUBLIC_KEYS);
    expect(response.body).toMatchObject({
      status: 'disabled',
      source: 'rules',
      cache_hit: false,
    });
  });

  it('keeps Slice 4 validation shape for unknown DTO fields', async () => {
    const app = await createApp();
    apps.push(app);
    const token = await issueToken(app, `slice5-http-validation-${RUN_ID}`);

    const response = await request(app.getHttpServer())
      .post('/api/ai/ask')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...askBody(), context_id: 'not-allowed' })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
    });
    expect(response.body.errors.some((error: any) => error.path === 'context_id')).toBe(true);
  });

  it('preserves planting missing and cross-user ownership as 404', async () => {
    const app = await createApp();
    apps.push(app);
    const ownerToken = await issueToken(app, `slice5-http-owner-${RUN_ID}`);
    const intruderToken = await issueToken(app, `slice5-http-intruder-${RUN_ID}`);
    const plantingId = await createPlanting(app, ownerToken, `ownership-${RUN_ID}`);

    await request(app.getHttpServer())
      .post('/api/ai/ask')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ context_type: 'planting_now', question: '现在该做什么', planting_id: 'missing-planting' })
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/ai/ask')
      .set('Authorization', `Bearer ${intruderToken}`)
      .send({ context_type: 'planting_now', question: '现在该做什么', planting_id: plantingId })
      .expect(404);
  });

  it('uses per-user AI 429 with Retry-After and ignores IP/XFF bucket rotation', async () => {
    const app = await createApp({ AI_ENDPOINT_LIMIT: '2', AI_ENDPOINT_TTL_MS: '60000' });
    apps.push(app);
    const token = await issueToken(app, `slice5-http-rate-${RUN_ID}`);
    await createTerrace(app, token, `rate-${RUN_ID}`);

    await request(app.getHttpServer())
      .post('/api/ai/ask')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', '198.51.100.1')
      .send(askBody('rate one'))
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/ai/ask')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', '198.51.100.2')
      .send(askBody('rate two'))
      .expect(200);
    const blocked = await request(app.getHttpServer())
      .post('/api/ai/ask')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', '198.51.100.3')
      .send(askBody('rate three'))
      .expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('returns exact public provider success and provider failure fallback without 500', async () => {
    const app = await createApp({
      AI_PROVIDER: 'mock',
      AI_DAILY_PROVIDER_CALL_CAP: '10',
      AI_EXPLANATION_CACHE_TTL_SECONDS: '60',
    });
    apps.push(app);
    const token = await issueToken(app, `slice5-http-provider-${RUN_ID}`);
    await createTerrace(app, token, `provider-${RUN_ID}`);

    const success = await request(app.getHttpServer())
      .post('/api/ai/ask')
      .set('Authorization', `Bearer ${token}`)
      .send(askBody(`mock success ${RUN_ID}`))
      .expect(200);
    expect(Object.keys(success.body).sort()).toEqual(PUBLIC_KEYS);
    expect(success.body).toMatchObject({ status: 'answered', source: 'ai', cache_hit: false });

    const failure = await request(app.getHttpServer())
      .post('/api/ai/ask')
      .set('Authorization', `Bearer ${token}`)
      .send(askBody(`[mock:provider_unavailable] ${RUN_ID}`))
      .expect(200);
    expect(Object.keys(failure.body).sort()).toEqual(PUBLIC_KEYS);
    expect(failure.body).toMatchObject({ status: 'provider_unavailable', source: 'rules', cache_hit: false });
  });
});
