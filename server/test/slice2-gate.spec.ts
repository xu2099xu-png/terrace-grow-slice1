import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/http/application';
import { PrismaService } from '../src/prisma.service';

let app: INestApplication;
let prisma: PrismaService;
let token: string;
let terraceId: string;
let containerTypeId: string;

describe('Slice 2 Gate — closure acceptance tests', () => {
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
    prisma = app.get(PrismaService);

    const auth = await request(app.getHttpServer())
      .post('/api/auth/anonymous')
      .send({ device_id: 'gate-device-1' })
      .expect(201);
    token = auth.body.token;

    const t = await request(app.getHttpServer())
      .post('/api/terraces')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'gate露台',
        cityCode: 'beijing',
        sunExposureLevel: 'LONG',
        rainExposed: false,
      })
      .expect(201);
    terraceId = t.body.id;

    const c = await prisma.containerType.findFirst({ where: { name: '无纺布美植袋' } });
    containerTypeId = c!.id;

    // isolate: remove prior plantings for this user
    const plantings = await prisma.plantingRecord.findMany({
      where: { userId: (await prisma.userIdentity.findFirst({ where: { providerUid: 'gate-device-1' } }))!.userId },
      select: { id: true },
    });
    await prisma.plantingEvent.deleteMany({ where: { plantingId: { in: plantings.map((p) => p.id) } } });
    await prisma.plantingRecord.deleteMany({ where: { userId: (await prisma.userIdentity.findFirst({ where: { providerUid: 'gate-device-1' } }))!.userId } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('invalid container_type_id → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/plantings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        terrace_id: terraceId,
        crop_id: 'crop-grape',
        variety_id: null,
        container_type_id: 'fake-container-id',
        start_date: '2026-08-08',
        client_request_id: 'gate-invalid-container',
      });
    expect(res.status).toBe(400);
  });

  it('persisted containerTypeId === recommendation resolved container', async () => {
    const plan = await request(app.getHttpServer())
      .post('/api/recommendations/perennial')
      .set('Authorization', `Bearer ${token}`)
      .send({ crop_id: 'crop-grape' })
      .expect(201);
    const resolvedContainerId = plan.body.container.selected_type_id;

    const res = await request(app.getHttpServer())
      .post('/api/plantings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        terrace_id: terraceId,
        crop_id: 'crop-grape',
        variety_id: null,
        container_type_id: resolvedContainerId,
        start_date: '2026-08-08',
        client_request_id: 'gate-container-match',
      })
      .expect(201);

    expect(res.body.planting.containerTypeId).toBe(resolvedContainerId);
  });

  it('concurrent create with same client_request_id → one record, same id, no 500', async () => {
    const body = {
      terrace_id: terraceId,
      crop_id: 'crop-grape',
      variety_id: null,
      container_type_id: containerTypeId,
      start_date: '2026-08-08',
      client_request_id: 'gate-concurrent-create',
    };
    const [a, b] = await Promise.all([
      request(app.getHttpServer()).post('/api/plantings').set('Authorization', `Bearer ${token}`).send(body),
      request(app.getHttpServer()).post('/api/plantings').set('Authorization', `Bearer ${token}`).send(body),
    ]);
    expect(a.status).toBeLessThan(500);
    expect(b.status).toBeLessThan(500);
    const idA = a.body?.planting?.id;
    const idB = b.body?.planting?.id;
    expect(idA).toBeTruthy();
    expect(idA).toBe(idB);

    const rows = await prisma.plantingRecord.count({
      where: { userId: (await prisma.userIdentity.findFirst({ where: { providerUid: 'gate-device-1' } }))!.userId, clientRequestId: 'gate-concurrent-create' },
    });
    expect(rows).toBe(1);
  });

  it('concurrent event with same client_event_id → one record, same id, no 500', async () => {
    const p = await request(app.getHttpServer())
      .post('/api/plantings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        terrace_id: terraceId,
        crop_id: 'crop-grape',
        variety_id: null,
        container_type_id: containerTypeId,
        start_date: '2026-08-08',
        client_request_id: 'gate-concurrent-event-planting',
      })
      .expect(201);
    const plantingId = p.body.planting.id;

    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/plantings/${plantingId}/events`)
        .set('Authorization', `Bearer ${token}`)
        .send({ action_key: 'action_fixture_1', client_event_id: 'gate-concurrent-event' }),
      request(app.getHttpServer())
        .post(`/api/plantings/${plantingId}/events`)
        .set('Authorization', `Bearer ${token}`)
        .send({ action_key: 'action_fixture_1', client_event_id: 'gate-concurrent-event' }),
    ]);
    expect(a.status).toBeLessThan(500);
    expect(b.status).toBeLessThan(500);
    const idA = a.body?.event?.id;
    const idB = b.body?.event?.id;
    expect(idA).toBeTruthy();
    expect(idA).toBe(idB);

    const rows = await prisma.plantingEvent.count({
      where: { plantingId, clientEventId: 'gate-concurrent-event' },
    });
    expect(rows).toBe(1);
  });

  it('future-stage action → 400', async () => {
    const p = await request(app.getHttpServer())
      .post('/api/plantings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        terrace_id: terraceId,
        crop_id: 'crop-grape',
        variety_id: null,
        container_type_id: containerTypeId,
        start_date: '2026-08-08',
        client_request_id: 'gate-future-action',
      })
      .expect(201);
    const plantingId = p.body.planting.id;

    // action_fixture_2 belongs to stage_b (offset 3–5), not current stage_a (offset 0–2)
    const res = await request(app.getHttpServer())
      .post(`/api/plantings/${plantingId}/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action_key: 'action_fixture_2' });
    expect(res.status).toBe(400);
  });

  it('Mine summary has real crop_name, variety_name, current_stage_name, no hardcoding', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/users/me/plantings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const mine = res.body.find((x: any) => x.crop_name === '葡萄');
    expect(mine).toBeTruthy();
    expect(mine).toHaveProperty('variety_name');
    expect(mine).toHaveProperty('current_stage_name');
    expect(mine).toHaveProperty('status');
    expect(mine).toHaveProperty('next_action');
  });

  it('duplicate crop-level lifecycle version is rejected by DB', async () => {
    // Try to insert a second crop-level template with same (cropId, null, startMethod, version)
    await expect(
      prisma.lifecycleTemplate.create({
        data: {
          id: 'lc-grape-crop-v1-dup',
          cropId: 'crop-grape',
          varietyId: null,
          startMethod: 'nursery_plant',
          version: 1,
          active: true,
          source: 'manual',
          reviewStatus: 'draft',
          confidence: 1,
        },
      }),
    ).rejects.toThrow(/unique constraint/i);
  });

  it('Mine next_action = first unfinished action in current stage, then next stage', async () => {
    // fresh planting in stage_a (action_fixture_1, offset 0-2, today active)
    const p = await request(app.getHttpServer())
      .post('/api/plantings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        terrace_id: terraceId,
        crop_id: 'crop-grape',
        variety_id: null,
        container_type_id: containerTypeId,
        start_date: new Date().toISOString().slice(0, 10),
        client_request_id: 'gate-next-action',
      })
      .expect(201);
    const plantingId = p.body.planting.id;

    // nothing done yet -> next is the current stage's first (only) action
    const mine1 = await request(app.getHttpServer())
      .get('/api/users/me/plantings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const row1 = mine1.body.find((x: any) => x.planting_id === plantingId);
    expect(row1.next_action).toBe('action_fixture_1');

    // complete stage_a's only action -> current stage done -> next is stage_b's first
    await request(app.getHttpServer())
      .post(`/api/plantings/${plantingId}/events`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action_key: 'action_fixture_1' })
      .expect(201);

    const mine2 = await request(app.getHttpServer())
      .get('/api/users/me/plantings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const row2 = mine2.body.find((x: any) => x.planting_id === plantingId);
    expect(row2.next_action).toBe('action_fixture_2'); // stage_b's first, not null
  });
});
