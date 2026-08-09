import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { configureApplication } from '../src/http/application';

/**
 * Slice 2 Acceptance Tests — planting flow (S2-AC-02..07, 13..19).
 * Runs against the isolated test DB (development + draft fixtures).
 */
describe('Slice 2 Plantings', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let terraceId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
    prisma = app.get(PrismaService);

    const auth = await request(app.getHttpServer())
      .post('/api/auth/anonymous')
      .send({ device_id: 's2-device-1' })
      .expect(201);
    token = auth.body.token;

    // isolate: remove prior runs' plantings for the spec's devices so
    // idempotency keys start clean on every run
    const devices = await prisma.userIdentity.findMany({
      where: { provider: 'anonymous_device', providerUid: { startsWith: 's2-device' } },
      select: { userId: true },
    });
    const userIds = devices.map((d) => d.userId);
    if (userIds.length > 0) {
      const plantings = await prisma.plantingRecord.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
      await prisma.plantingEvent.deleteMany({ where: { plantingId: { in: plantings.map((p) => p.id) } } });
      await prisma.plantingRecord.deleteMany({ where: { userId: { in: userIds } } });
    }

    const terrace = await request(app.getHttpServer())
      .post('/api/terraces')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '葡萄露台',
        cityCode: 'beijing',
        sunExposureLevel: 'LONG',
        rainExposed: false,
      })
      .expect(201);
    terraceId = terrace.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC-02: grape recommendation is data-driven, not blueberry', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/recommendations/perennial')
      .set('Authorization', `Bearer ${token}`)
      .send({ crop_id: 'crop-grape' })
      .expect(201);
    expect(res.body.suitability).toBe('suitable');
    expect(res.body.recommended_varieties.length).toBeGreaterThan(0);
    // only grape varieties
    const ids = res.body.recommended_varieties.map((v: any) => v.varietyId);
    for (const id of ids) {
      expect(id.startsWith('var-grape-')).toBe(true);
    }
    expect(res.body.soil_mix).toBeDefined();
    expect(res.body.container).toBeDefined();
  });

  it('AC-04: create a planting record from a valid grape plan', async () => {
    const plan = await request(app.getHttpServer())
      .post('/api/recommendations/perennial')
      .set('Authorization', `Bearer ${token}`)
      .send({ crop_id: 'crop-grape' })
      .expect(201);
    const containerTypeId = plan.body.container.selected_type_id;

    const res = await request(app.getHttpServer())
      .post('/api/plantings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        terrace_id: terraceId,
        crop_id: 'crop-grape',
        variety_id: 'var-grape-shine-muscat',
        container_type_id: containerTypeId,
        start_date: '2026-01-01',
        client_request_id: 's2-create-1',
      })
      .expect(201);

    expect(res.body.created).toBe(true);
    expect(res.body.planting.userId).toBeTruthy();
    expect(res.body.planting.terraceId).toBe(terraceId);
    expect(res.body.planting.cropId).toBe('crop-grape');
    expect(res.body.planting.varietyId).toBe('var-grape-shine-muscat');
    expect(res.body.planting.containerTypeId).toBe(containerTypeId);
    expect(res.body.planting.startMethod).toBe('nursery_plant');
    expect(res.body.planting.status).toBe('active');
    // shine-muscat has no variety-level template -> crop-level fallback
    expect(res.body.planting.lifecycleTemplateId).toBe('lc-grape-crop-v1');
    expect(res.body.planting.lifecycleVersion).toBe(1);
  });

  it('AC-04b: variety-level lifecycle template wins for kyoho', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/plantings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        terrace_id: terraceId,
        crop_id: 'crop-grape',
        variety_id: 'var-grape-kyoho',
        container_type_id: 'ct-fabric-bag',
        start_date: '2026-01-01',
        client_request_id: 's2-create-kyoho',
      })
      .expect(201);
    expect(res.body.planting.lifecycleTemplateId).toBe('lc-grape-kyoho-v1');
    expect(res.body.planting.lifecycleVersion).toBe(1);
  });

  it('AC-05: double submit with same client_request_id creates one record', async () => {
    const plan = await request(app.getHttpServer())
      .post('/api/recommendations/perennial')
      .set('Authorization', `Bearer ${token}`)
      .send({ crop_id: 'crop-grape' })
      .expect(201);
    const containerTypeId = plan.body.container.selected_type_id;
    const body = {
      terrace_id: terraceId,
      crop_id: 'crop-grape',
      variety_id: null,
      container_type_id: containerTypeId,
      start_date: '2026-01-02',
      client_request_id: 's2-create-dup',
    };

    const r1 = await request(app.getHttpServer())
      .post('/api/plantings').set('Authorization', `Bearer ${token}`).send(body).expect(201);
    const r2 = await request(app.getHttpServer())
      .post('/api/plantings').set('Authorization', `Bearer ${token}`).send(body).expect(201);

    expect(r1.body.created).toBe(true);
    expect(r2.body.created).toBe(false);
    expect(r2.body.planting.id).toBe(r1.body.planting.id);

    const count = await prisma.plantingRecord.count({
      where: { userId: r1.body.planting.userId, clientRequestId: 's2-create-dup' },
    });
    expect(count).toBe(1);
  });

  it('AC-06: NO_MATCH cannot start planting', async () => {
    // north + rarely = NO_MATCH for grape
    const auth2 = await request(app.getHttpServer())
      .post('/api/auth/anonymous').send({ device_id: 's2-device-nomatch' }).expect(201);
    const token2 = auth2.body.token;
    const t2 = await request(app.getHttpServer())
      .post('/api/terraces').set('Authorization', `Bearer ${token2}`)
      .send({
        name: '北向无光',
        cityCode: 'beijing',
        sunOrientationRaw: 'north',
        sunTimeObsRaw: 'rarely',
        rainExposed: true,
      })
      .expect(201);

    const plan = await request(app.getHttpServer())
      .post('/api/recommendations/perennial').set('Authorization', `Bearer ${token2}`)
      .send({ crop_id: 'crop-grape' })
      .expect(201);
    expect(plan.body.suitability).toBe('unsuitable');

    const res = await request(app.getHttpServer())
      .post('/api/plantings').set('Authorization', `Bearer ${token2}`)
      .send({
        terrace_id: t2.body.id,
        crop_id: 'crop-grape',
        variety_id: null,
        container_type_id: 'ct-plastic-pot',
        start_date: '2026-01-01',
        client_request_id: 's2-nomatch-1',
      })
      .expect(400);
    expect(String(res.body.message)).toContain('sunlight');
  });

  it('AC-07: variety=null falls back to crop-level lifecycle', async () => {
    const plan = await request(app.getHttpServer())
      .post('/api/recommendations/perennial')
      .set('Authorization', `Bearer ${token}`)
      .send({ crop_id: 'crop-grape' })
      .expect(201);
    const containerTypeId = plan.body.container.selected_type_id;

    const res = await request(app.getHttpServer())
      .post('/api/plantings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        terrace_id: terraceId,
        crop_id: 'crop-grape',
        variety_id: null,
        container_type_id: containerTypeId,
        start_date: '2026-01-03',
        client_request_id: 's2-variety-null',
      })
      .expect(201);
    expect(res.body.planting.varietyId).toBeNull();
    expect(res.body.planting.lifecycleTemplateId).toBe('lc-grape-crop-v1');
    expect(res.body.planting.lifecycleVersion).toBe(1);
  });

  it('AC-13: /plantings/:id/now returns structured current stage', async () => {
    const auth3 = await request(app.getHttpServer())
      .post('/api/auth/anonymous').send({ device_id: 's2-device-now' }).expect(201);
    const token3 = auth3.body.token;
    const t3 = await request(app.getHttpServer())
      .post('/api/terraces').set('Authorization', `Bearer ${token3}`)
      .send({ name: 'now露台', cityCode: 'beijing', sunExposureLevel: 'LONG', rainExposed: false })
      .expect(201);
    const plan = await request(app.getHttpServer())
      .post('/api/recommendations/perennial').set('Authorization', `Bearer ${token3}`)
      .send({ crop_id: 'crop-grape' }).expect(201);
    const p = await request(app.getHttpServer())
      .post('/api/plantings').set('Authorization', `Bearer ${token3}`)
      .send({
        terrace_id: t3.body.id, crop_id: 'crop-grape', variety_id: null,
        container_type_id: plan.body.container.selected_type_id,
        start_date: '2026-08-08', client_request_id: 's2-now-1',
      }).expect(201);
    const plantingId = p.body.planting.id;

    const now = await request(app.getHttpServer())
      .get(`/api/plantings/${plantingId}/now`).set('Authorization', `Bearer ${token3}`)
      .expect(200);
    expect(now.body.planting_id).toBe(plantingId);
    expect(now.body.status).toBeDefined();
    expect(now.body.as_of_date).toBeDefined();
    expect(now.body.lifecycle_template_id).toBe('lc-grape-crop-v1');
    expect(now.body.lifecycle_version).toBe(1);
    expect(Array.isArray(now.body.completed_action_keys)).toBe(true);
  });

  it('AC-16/17: complete an action, idempotent, persists on refresh', async () => {
    const auth4 = await request(app.getHttpServer())
      .post('/api/auth/anonymous').send({ device_id: 's2-device-event' }).expect(201);
    const token4 = auth4.body.token;
    const t4 = await request(app.getHttpServer())
      .post('/api/terraces').set('Authorization', `Bearer ${token4}`)
      .send({ name: 'event露台', cityCode: 'beijing', sunExposureLevel: 'LONG', rainExposed: false })
      .expect(201);
    const plan = await request(app.getHttpServer())
      .post('/api/recommendations/perennial').set('Authorization', `Bearer ${token4}`)
      .send({ crop_id: 'crop-grape' }).expect(201);
    const p = await request(app.getHttpServer())
      .post('/api/plantings').set('Authorization', `Bearer ${token4}`)
      .send({
        terrace_id: t4.body.id, crop_id: 'crop-grape', variety_id: null,
        container_type_id: plan.body.container.selected_type_id,
        start_date: '2026-08-08', client_request_id: 's2-event-1',
      }).expect(201);
    const plantingId = p.body.planting.id;

    const e1 = await request(app.getHttpServer())
      .post(`/api/plantings/${plantingId}/events`).set('Authorization', `Bearer ${token4}`)
      .send({ action_key: 'action_fixture_1', client_event_id: 's2-ev-1' })
      .expect(201);
    expect(e1.body.created).toBe(true);

    // idempotent
    const e2 = await request(app.getHttpServer())
      .post(`/api/plantings/${plantingId}/events`).set('Authorization', `Bearer ${token4}`)
      .send({ action_key: 'action_fixture_1', client_event_id: 's2-ev-1' })
      .expect(201);
    expect(e2.body.created).toBe(false);

    const events = await prisma.plantingEvent.count({ where: { plantingId, clientEventId: 's2-ev-1' } });
    expect(events).toBe(1);

    // refresh: now shows completed
    const now = await request(app.getHttpServer())
      .get(`/api/plantings/${plantingId}/now`).set('Authorization', `Bearer ${token4}`)
      .expect(200);
    expect(now.body.completed_action_keys).toContain('action_fixture_1');
  });

  it('AC-18: unknown action key -> 400', async () => {
    const auth5 = await request(app.getHttpServer())
      .post('/api/auth/anonymous').send({ device_id: 's2-device-bad' }).expect(201);
    const token5 = auth5.body.token;
    const t5 = await request(app.getHttpServer())
      .post('/api/terraces').set('Authorization', `Bearer ${token5}`)
      .send({ name: 'bad露台', cityCode: 'beijing', sunExposureLevel: 'LONG', rainExposed: false })
      .expect(201);
    const plan = await request(app.getHttpServer())
      .post('/api/recommendations/perennial').set('Authorization', `Bearer ${token5}`)
      .send({ crop_id: 'crop-grape' }).expect(201);
    const p = await request(app.getHttpServer())
      .post('/api/plantings').set('Authorization', `Bearer ${token5}`)
      .send({
        terrace_id: t5.body.id, crop_id: 'crop-grape', variety_id: null,
        container_type_id: plan.body.container.selected_type_id,
        start_date: '2026-08-08', client_request_id: 's2-bad-1',
      }).expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/plantings/${p.body.planting.id}/events`).set('Authorization', `Bearer ${token5}`)
      .send({ action_key: 'made_up_action' })
      .expect(400);
    expect(String(res.body.message)).toContain('Action not available');
  });

  it('AC-19: cross-user access denied (404)', async () => {
    const auth6 = await request(app.getHttpServer())
      .post('/api/auth/anonymous').send({ device_id: 's2-device-owner' }).expect(201);
    const token6 = auth6.body.token;
    const t6 = await request(app.getHttpServer())
      .post('/api/terraces').set('Authorization', `Bearer ${token6}`)
      .send({ name: 'owner露台', cityCode: 'beijing', sunExposureLevel: 'LONG', rainExposed: false })
      .expect(201);
    const plan = await request(app.getHttpServer())
      .post('/api/recommendations/perennial').set('Authorization', `Bearer ${token6}`)
      .send({ crop_id: 'crop-grape' }).expect(201);
    const p = await request(app.getHttpServer())
      .post('/api/plantings').set('Authorization', `Bearer ${token6}`)
      .send({
        terrace_id: t6.body.id, crop_id: 'crop-grape', variety_id: null,
        container_type_id: plan.body.container.selected_type_id,
        start_date: '2026-01-01', client_request_id: 's2-owner-1',
      }).expect(201);
    const plantingId = p.body.planting.id;

    const auth7 = await request(app.getHttpServer())
      .post('/api/auth/anonymous').send({ device_id: 's2-device-intruder' }).expect(201);
    const token7 = auth7.body.token;

    await request(app.getHttpServer())
      .get(`/api/plantings/${plantingId}`).set('Authorization', `Bearer ${token7}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/plantings/${plantingId}/now`).set('Authorization', `Bearer ${token7}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/plantings/${plantingId}/events`).set('Authorization', `Bearer ${token7}`)
      .send({ action_key: 'action_fixture_1' })
      .expect(404);
  });

  it('AC-15: lifecycle version is pinned at creation; later template upgrade does not affect old planting', async () => {
    const today = new Date().toISOString().slice(0, 10);
    // create planting A using grape crop-level lifecycle v1 (starts today)
    const res = await request(app.getHttpServer())
      .post('/api/plantings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        terrace_id: terraceId,
        crop_id: 'crop-grape',
        variety_id: null,
        container_type_id: 'ct-fabric-bag',
        start_date: today,
        client_request_id: 's2-pin-1',
      })
      .expect(201);
    expect(res.body.planting.lifecycleVersion).toBe(1);
    const plantingId = res.body.planting.id;

    // upgrade: create a unique v2 crop-level lifecycle template (dev+draft gate)
    const v2Id = 'lc-grape-crop-v2-' + Date.now();
    await prisma.lifecycleTemplate.create({
      data: {
        id: v2Id, cropId: 'crop-grape', varietyId: null,
        startMethod: 'nursery_plant', version: 2, active: true,
        source: 'manual', reviewStatus: 'draft', confidence: 1,
        stages: {
          create: [
            { stageKey: 'v2_a', stageName: 'v2阶段A', order: 1, startOffset: 0, endOffset: 9, actions: ['action_fixture_1'], source: 'manual', reviewStatus: 'draft', confidence: 1 },
          ],
        },
      },
    });

    // old planting still resolves against v1
    const now = await request(app.getHttpServer())
      .get(`/api/plantings/${plantingId}/now`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(now.body.lifecycle_version).toBe(1);
    expect(now.body.current_stage?.stage_key).toBe('stage_a'); // v1 stage, not v2_a

    // new planting picks v2
    const res2 = await request(app.getHttpServer())
      .post('/api/plantings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        terrace_id: terraceId,
        crop_id: 'crop-grape',
        variety_id: null,
        container_type_id: 'ct-fabric-bag',
        start_date: '2026-01-01',
        client_request_id: 's2-pin-2',
      })
      .expect(201);
    expect(res2.body.planting.lifecycleVersion).toBe(2);

    // cleanup v2 fixture so later suites are unaffected
    await prisma.lifecycleStage.deleteMany({ where: { lifecycleTemplateId: v2Id } });
    await prisma.lifecycleTemplate.delete({ where: { id: v2Id } });
  });
});
