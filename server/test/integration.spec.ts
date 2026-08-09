import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { configureApplication } from '../src/http/application';

describe('Slice 1 Integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApplication(app);
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
        rainExposed: true,
      })
      .expect(201);

    expect(res.body.sunHoursMin).toBeGreaterThanOrEqual(6);
    expect(res.body.sunConfidence).toBe('medium');
  });

  it('2b. POST /terraces without rainExposed returns 400 (required field)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/terraces')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '缺字段露台',
        cityCode: 'beijing',
        sunExposureLevel: 'LONG',
      })
      .expect(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
    });
    expect(res.body.errors.some((error: any) => error.path === 'rainExposed')).toBe(true);
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
    expect(res.body.soil.mix.length).toBeGreaterThan(0);
    expect(res.body.soil.mix.every((l: any) => l.pct > 0 && l.liters > 0)).toBe(true);
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
        cityCode: 'beijing',
        sunOrientationRaw: 'north',
        sunTimeObsRaw: 'unknown',
        rainExposed: false,
      })
      .expect(201);

    expect(res.body.sunHoursMin).toBeLessThanOrEqual(3);
    expect(res.body.sunConfidence).toBe('low');

    const rec = await request(app.getHttpServer())
      .post('/api/recommendations/perennial')
      .set('Authorization', `Bearer ${token2}`)
      .send({ crop_id: 'crop-blueberry' })
      .expect(201);

    expect(rec.body.suitability).toBe('likely_unsuitable');
    expect(rec.body.sunlight_status.status).toBe('LIKELY_NO_MATCH');
    expect(rec.body.warnings).toContain('日照可能不足，建议先确认');
  });

  it('11. BORDERLINE sunlight (west + afternoon = 3-6h)', async () => {
    const auth3 = await request(app.getHttpServer())
      .post('/api/auth/anonymous')
      .send({ device_id: 'test-device-3' })
      .expect(201);

    const token3 = auth3.body.token;

    await request(app.getHttpServer())
      .post('/api/terraces')
      .set('Authorization', `Bearer ${token3}`)
      .send({
        name: '西向露台',
        cityCode: 'beijing',
        sunOrientationRaw: 'west',
        sunTimeObsRaw: 'afternoon',
        rainExposed: true,
      })
      .expect(201);

    const rec = await request(app.getHttpServer())
      .post('/api/recommendations/perennial')
      .set('Authorization', `Bearer ${token3}`)
      .send({ crop_id: 'crop-blueberry' })
      .expect(201);

    expect(rec.body.suitability).toBe('borderline');
    expect(rec.body.sunlight_status.status).toBe('BORDERLINE');
  });

  it('12. NO_MATCH sunlight hard-stops blueberry plan', async () => {
    const auth4 = await request(app.getHttpServer())
      .post('/api/auth/anonymous')
      .send({ device_id: 'test-device-4' })
      .expect(201);

    const token4 = auth4.body.token;

    // north-facing with rare sun = 0-2h, medium confidence = NO_MATCH
    await request(app.getHttpServer())
      .post('/api/terraces')
      .set('Authorization', `Bearer ${token4}`)
      .send({
        name: '北向无光照露台',
        cityCode: 'beijing',
        sunOrientationRaw: 'north',
        sunTimeObsRaw: 'rarely',
        rainExposed: true,
      })
      .expect(201);

    const rec = await request(app.getHttpServer())
      .post('/api/recommendations/perennial')
      .set('Authorization', `Bearer ${token4}`)
      .send({ crop_id: 'crop-blueberry' })
      .expect(201);

    // NO_MATCH must short-circuit: no container, no soil, no water risk
    expect(rec.body.suitability).toBe('unsuitable');
    expect(rec.body.sunlight_status.status).toBe('NO_MATCH');
    expect(rec.body.recommended_varieties).toEqual([]);
    expect(rec.body.selected_variety_id).toBeNull();
    expect(rec.body.container).toBeNull();
    expect(rec.body.soil_mix).toBeNull();
    expect(rec.body.water_risk).toBeNull();
    expect(rec.body.next_action).toContain('耐阴');
  });

  it('13. unknown city blocks reliable variety ranking', async () => {
    const auth5 = await request(app.getHttpServer())
      .post('/api/auth/anonymous')
      .send({ device_id: 'test-device-5' })
      .expect(201);

    const token5 = auth5.body.token;

    await request(app.getHttpServer())
      .post('/api/terraces')
      .set('Authorization', `Bearer ${token5}`)
      .send({
        name: '未知城市露台',
        cityCode: 'unknown_city_xyz',
        sunOrientationRaw: 'south',
        sunTimeObsRaw: 'allday',
        rainExposed: false,
      })
      .expect(201);

    const rec = await request(app.getHttpServer())
      .post('/api/recommendations/perennial')
      .set('Authorization', `Bearer ${token5}`)
      .send({ crop_id: 'crop-blueberry' })
      .expect(201);

    // unknown climate: varieties returned with score=0 and warning reason
    expect(rec.body.recommended_varieties.length).toBeGreaterThan(0);
    expect(rec.body.recommended_varieties.every((v: any) => v.score === 0)).toBe(true);
    expect(rec.body.recommended_varieties[0].reasons.some((r: string) => r.includes('气候区未知'))).toBe(true);
    // MUST NOT fake a selection from the zero-score list
    expect(rec.body.selected_variety_id).toBeNull();
    expect(rec.body.warnings.some((w: string) => w.includes('气候信息不足'))).toBe(true);
    // crop-level container advice may still be present
    expect(rec.body.container).toBeDefined();
  });

  it('14. soil recalculate keeps variety-level container requirement (northblue 20-30L)', async () => {
    const auth6 = await request(app.getHttpServer())
      .post('/api/auth/anonymous')
      .send({ device_id: 'test-device-6' })
      .expect(201);
    const token6 = auth6.body.token;

    await request(app.getHttpServer())
      .post('/api/terraces')
      .set('Authorization', `Bearer ${token6}`)
      .send({
        name: '品种级容器露台',
        cityCode: 'beijing',
        sunExposureLevel: 'LONG',
        rainExposed: false,
      })
      .expect(201);

    // select northblue explicitly; crop-level range is 25-40L, northblue override is 20-30L
    const plan = await request(app.getHttpServer())
      .post('/api/recommendations/perennial')
      .set('Authorization', `Bearer ${token6}`)
      .send({ crop_id: 'crop-blueberry', selected_variety_id: 'var-northblue' })
      .expect(201);
    expect(plan.body.selected_variety_id).toBe('var-northblue');
    const planVol = plan.body.container.volumeRange;
    expect(planVol[0]).toBe(20);
    expect(planVol[1]).toBe(30);

    // recalc must reuse the SAME variety-level container requirement
    const recalc = await request(app.getHttpServer())
      .post('/api/soil/calculate')
      .set('Authorization', `Bearer ${token6}`)
      .send({
        crop_id: 'crop-blueberry',
        container_type_id: 'ct-fabric-bag',
        selected_variety_id: 'var-northblue',
        material_ids: ['mat-peat', 'mat-coco', 'mat-perlite'],
      })
      .expect(201);
    // volume basis matches plan (20-30L midpoint = 25L)
    const totalLiters = recalc.body.soil.mix.reduce((s: number, m: any) => s + m.liters, 0);
    expect(Math.round(totalLiters)).toBe(25);
  });

  it('15. materials for a different cropId do not return blueberry rules', async () => {
    const auth7 = await request(app.getHttpServer())
      .post('/api/auth/anonymous')
      .send({ device_id: 'test-device-7' })
      .expect(201);
    const token7 = auth7.body.token;

    const res = await request(app.getHttpServer())
      .get('/api/materials?crop_id=crop-grape-future')
      .set('Authorization', `Bearer ${token7}`)
      .expect(200);

    expect(res.body.length).toBeGreaterThan(0);
    for (const m of res.body) {
      expect(m.cropRules).toEqual([]);
    }
  });
});
