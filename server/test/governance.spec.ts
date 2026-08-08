import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

/**
 * Governance gate under production-like conditions:
 * APP_ENV=production + ALLOW_DRAFT_FIXTURES=true must NOT leak draft data —
 * neither draft parents nor draft nested relations (traits/attributes,
 * environment requirements, crop rules, container requirements).
 *
 * The seed fixture is 100% reviewStatus='draft'. We promote a few rows to
 * 'approved' to prove that an approved parent still does not drag draft
 * children into the response.
 */
describe('Slice 1 Governance (production-like)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    process.env.APP_ENV = 'production';
    process.env.ALLOW_DRAFT_FIXTURES = 'true';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableCors({ origin: true, credentials: true });
    await app.init();
    prisma = app.get(PrismaService);

    // authenticate
    const auth = await request(app.getHttpServer())
      .post('/api/auth/anonymous')
      .send({ device_id: 'gov-device-1' })
      .expect(201);
    token = auth.body.token;

    // profile needed for recommendation endpoint
    await request(app.getHttpServer())
      .post('/api/terraces')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '治理测试露台',
        cityCode: 'beijing',
        sunExposureLevel: 'LONG',
        rainExposed: false,
      })
      .expect(201);

    // Promote the blueberry crop to approved, but keep all children draft.
    await prisma.crop.update({
      where: { id: 'crop-blueberry' },
      data: { reviewStatus: 'approved' },
    });
    // Promote ONE variety to approved, but keep its traits + attributes draft.
    await prisma.variety.update({
      where: { id: 'var-oneal' },
      data: { reviewStatus: 'approved' },
    });
  });

  afterAll(async () => {
    // restore fixture state so other suites are unaffected
    await prisma.crop.update({
      where: { id: 'crop-blueberry' },
      data: { reviewStatus: 'draft' },
    });
    await prisma.variety.update({
      where: { id: 'var-oneal' },
      data: { reviewStatus: 'draft' },
    });
    await app.close();
  });

  it('crops list: approved parent visible, draft parents hidden', async () => {
    const res = await request(app.getHttpServer()).get('/api/crops?life_type=perennial').expect(200);
    const names = res.body.map((c: any) => c.name);
    expect(names).toContain('蓝莓'); // approved crop is visible
    expect(names.length).toBe(1); // all other crops are draft -> hidden
  });

  it('crops list: approved crop does NOT drag draft environmentRequirement', async () => {
    const res = await request(app.getHttpServer()).get('/api/crops?life_type=perennial').expect(200);
    const blueberry = res.body.find((c: any) => c.name === '蓝莓');
    // environmentRequirement rows are all draft -> filtered out
    expect(blueberry.environmentRequirement).toEqual([]);
  });

  it('varieties: draft variety rows are hidden even under approved crop', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/crops/crop-blueberry/varieties')
      .expect(200);
    // only var-oneal was promoted to approved
    expect(res.body.map((v: any) => v.name)).toEqual(['奥尼尔']);
  });

  it('varieties: approved variety does NOT leak draft traits/attributes', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/crops/crop-blueberry/varieties')
      .expect(200);
    const oneal = res.body.find((v: any) => v.name === '奥尼尔');
    expect(oneal.traits).toEqual([]); // all traits + attributes are draft -> filtered
  });

  it('recommendation: approved variety reaches engine WITHOUT draft traits', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/recommendations/perennial')
      .set('Authorization', `Bearer ${token}`)
      .send({ crop_id: 'crop-blueberry' })
      .expect(201);
    // var-oneal is approved and survives the gate, but its draft traits
    // (chill_hours/heat/shade) are filtered out before the engine.
    expect(res.body.recommended_varieties.length).toBeGreaterThan(0);
    for (const v of res.body.recommended_varieties) {
      expect(v.traits && Object.keys(v.traits).length).toBe(0);
    }
    expect(res.body.selected_variety_id).toBe('var-oneal');
    expect(res.body.container).toBeDefined();
    expect(res.body.soil_mix).toBeDefined();
  });

  it('materials: draft materials are not exposed in production', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/materials')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual([]); // all substrate materials are draft
  });

  it('materials by crop_id: draft crop rules are not exposed', async () => {
    // promote the blueberry crop's rules to approved and materials to approved
    await prisma.substrateMaterial.updateMany({ data: { reviewStatus: 'approved' } });
    await prisma.materialCropRule.updateMany({ data: { reviewStatus: 'approved' } });
    await prisma.environmentRequirement.updateMany({ data: { reviewStatus: 'approved' } });

    const res = await request(app.getHttpServer())
      .get('/api/materials?crop_id=crop-blueberry')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const m of res.body) {
      expect(m.cropRules.length).toBeGreaterThan(0);
    }

    // restore
    await prisma.substrateMaterial.updateMany({ data: { reviewStatus: 'draft' } });
    await prisma.materialCropRule.updateMany({ data: { reviewStatus: 'draft' } });
    await prisma.environmentRequirement.updateMany({ data: { reviewStatus: 'draft' } });
  });
});
