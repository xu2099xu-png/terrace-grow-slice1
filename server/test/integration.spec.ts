import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Slice 1 Integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableCors({ origin: true, credentials: true });
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. anonymous auth', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/anonymous')
      .send({ device_id: 'test-device-1' })
      .expect(201);

    expect(res.body).toHaveProperty('token');
    token = res.body.token;
  });

  it('2. create terrace with direct sunlight (south, full_day)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/terraces')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '测试露台',
        cityCode: 'beijing',
        sunOrientationRaw: 'south',
        sunTimeObsRaw: 'allday',
      })
      .expect(201);

    expect(res.body.sunHoursMin).toBeGreaterThanOrEqual(6);
    expect(res.body.sunConfidence).toBe('medium');
  });

  it('3. get terrace profile', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/terraces/mine')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.name).toBe('测试露台');
    expect(res.body.climateZone).toBeTruthy();
  });

  it('4. list perennial crops (includes blueberry)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/crops?life_type=perennial')
      .expect(200);

    const blueberry = res.body.find((c: any) => c.name === '蓝莓');
    expect(blueberry).toBeDefined();
    expect(blueberry.environmentRequirement).toBeDefined();
  });

  it('5. list blueberry varieties', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/crops/crop-blueberry/varieties')
      .expect(200);

    expect(res.body.length).toBeGreaterThanOrEqual(3);
    expect(res.body[0]).toHaveProperty('traits');
  });

  it('6. full recommendation for blueberry (MATCH sunlight)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/recommendations/perennial')
      .set('Authorization', `Bearer ${token}`)
      .send({ crop_id: 'crop-blueberry' })
      .expect(201);

    expect(res.body.suitability).toBe('suitable');
    expect(res.body.sunlight_status.status).toBe('MATCH');
    expect(res.body.recommended_varieties.length).toBeGreaterThan(0);
    expect(res.body.selected_variety_id).toBeTruthy();
    expect(res.body.container).toBeDefined();
    expect(res.body.soil_mix).toBeDefined();
    expect(res.body.soil_mix.feasibility).toBe('optimal');
    expect(res.body.water_risk).toBeDefined();
    expect(res.body.next_action).toContain('买苗上盆');
  });

  it('7. list materials with blueberry rules', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/materials')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const peat = res.body.find((m: any) => m.name === '泥炭');
    expect(peat).toBeDefined();
    expect(peat.cropRules.length).toBeGreaterThan(0);
  });

  it('8. save user material inventory', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/users/me/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_ids: ['mat-peat', 'mat-coco', 'mat-perlite'] })
      .expect(200);

    expect(res.body.ok).toBe(true);
  });

  it('9. recalculate soil with owned materials', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/soil/calculate')
      .set('Authorization', `Bearer ${token}`)
      .send({ crop_id: 'crop-blueberry', container_type_id: 'ct-plastic-pot' })
      .expect(201);

    expect(res.body.soil.feasibility).toBeDefined();
    expect(res.body.soil.mix).toBeDefined();
    expect(res.body.soil.missing.length).toBeGreaterThanOrEqual(0);
    expect(res.body.water_risk).toBeDefined();
  });

  it('10. unsure sunlight auxiliary path (unknown orientation + unknown time)', async () => {
    const auth2 = await request(app.getHttpServer())
      .post('/api/auth/anonymous')
      .send({ device_id: 'test-device-2' })
      .expect(201);

    const token2 = auth2.body.token;

    const res = await request(app.getHttpServer())
      .post('/api/terraces')
      .set('Authorization', `Bearer ${token2}`)
      .send({
        name: '北向露台',
        cityCode: '110100',
        sunOrientationRaw: 'north',
        sunTimeObsRaw: 'unknown',
      })
      .expect(201);

    expect(res.body.sunHoursMin).toBeLessThanOrEqual(3);
    expect(res.body.sunConfidence).toBe('low');

    const rec = await request(app.getHttpServer())
      .post('/api/recommendations/perennial')
      .set('Authorization', `Bearer ${token2}`)
      .send({ crop_id: 'crop-blueberry' })
      .expect(200);

    expect(rec.body.suitability).toBe('likely_unsuitable');
    expect(rec.body.sunlight_status.status).toBe('LIKELY_NO_MATCH');
    expect(rec.body.warnings).toContain('日照可能不足，建议先确认');
  });

  it('11. BORDERLINE sunlight (4-6h)', async () => {
    const auth3 = await request(app.getHttpServer())
      .post('/api/auth/anonymous')
      .send({ device_id: 'test-device-3' })
      .expect(201);

    const token3 = auth3.body.token;

    await request(app.getHttpServer())
      .post('/api/terraces')
      .set('Authorization', `Bearer ${token3}`)
      .send({
        name: '东向露台',
        cityCode: '110100',
        sunOrientationRaw: 'east',
        sunTimeObsRaw: 'morning',
      })
      .expect(201);

    const rec = await request(app.getHttpServer())
      .post('/api/recommendations/perennial')
      .set('Authorization', `Bearer ${token3}`)
      .send({ crop_id: 'crop-blueberry' })
      .expect(200);

    expect(rec.body.suitability).toBe('borderline');
    expect(rec.body.sunlight_status.status).toBe('BORDERLINE');
  });
});
