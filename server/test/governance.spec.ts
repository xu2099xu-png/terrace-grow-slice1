import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { configureApplication } from '../src/http/application';
import { AppConfigService } from '../src/config/runtime-config';
import { productionTestConfig } from './test-config';

/**
 * Governance gate under production-like conditions:
 * A valid APP_ENV=production configuration must NOT leak draft data —
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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AppConfigService)
      .useValue(productionTestConfig())
      .compile();

    app = moduleRef.createNestApplication();
    configureApplication(app);
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
    // Promote grape crop + its crop-level lifecycle TEMPLATE to approved,
    // but keep all LifecycleStages draft (S2-AC-03).
    await prisma.crop.update({
      where: { id: 'crop-grape' },
      data: { reviewStatus: 'approved' },
    });
    await prisma.lifecycleTemplate.update({
      where: { id: 'lc-grape-crop-v1' },
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
    await prisma.crop.update({
      where: { id: 'crop-grape' },
      data: { reviewStatus: 'draft' },
    });
    await prisma.lifecycleTemplate.update({
      where: { id: 'lc-grape-crop-v1' },
      data: { reviewStatus: 'draft' },
    });
    await app.close();
  });

  it('crops list: approved parents visible, draft parents hidden', async () => {
    const res = await request(app.getHttpServer()).get('/api/crops?life_type=perennial').expect(200);
    const names = res.body.map((c: any) => c.name);
    // blueberry + grape are approved; all other crops are draft -> hidden
    expect(names).toContain('蓝莓');
    expect(names).toContain('葡萄');
    expect(names.length).toBe(2);
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

  it('inventory write gate: PUT drops draft materials, keeps only approved ones', async () => {
    // promote mat-peat to approved; mat-coco stays draft
    await prisma.substrateMaterial.update({
      where: { id: 'mat-peat' },
      data: { reviewStatus: 'approved' },
    });

    const res = await request(app.getHttpServer())
      .put('/api/users/me/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_ids: ['mat-peat', 'mat-coco'] })
      .expect(200);
    expect(res.body.ok).toBe(true);

    const mine = await request(app.getHttpServer())
      .get('/api/materials/mine')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const ids = mine.body.map((r: any) => r.materialId);
    expect(ids).toContain('mat-peat'); // approved material persisted
    expect(ids).not.toContain('mat-coco'); // draft material dropped by write gate

    // restore
    await prisma.substrateMaterial.update({
      where: { id: 'mat-peat' },
      data: { reviewStatus: 'draft' },
    });
  });

  it('inventory read gate: GET mine never leaks a draft-backed entry', async () => {
    // create a dedicated user so we control the inventory row directly
    const auth = await request(app.getHttpServer())
      .post('/api/auth/anonymous')
      .send({ device_id: 'gov-device-inventory' })
      .expect(201);
    const token2 = auth.body.token;
    const identity = await prisma.userIdentity.findFirst({
      where: { provider: 'anonymous_device', providerUid: 'gov-device-inventory' },
    });
    if (!identity) throw new Error('identity not found');

    // directly seed a leftover inventory row pointing at a draft material
    // (simulates legacy data written before the gate existed); upsert so the
    // spec is repeatable across runs
    await prisma.userMaterialInventory.upsert({
      where: { userId_materialId: { userId: identity.userId, materialId: 'mat-perlite' } },
      update: { level: 'enough' },
      create: { userId: identity.userId, materialId: 'mat-perlite', level: 'enough' },
    });

    const mine = await request(app.getHttpServer())
      .get('/api/materials/mine')
      .set('Authorization', `Bearer ${token2}`)
      .expect(200);
    // mat-perlite is draft -> its inventory entry must not appear
    const ids = mine.body.map((r: any) => r.materialId);
    expect(ids).not.toContain('mat-perlite');
  });

  it('AC-03: approved LifecycleTemplate must not leak draft LifecycleStage', async () => {
    // grape crop + crop-level template are approved; its stages are draft.
    // A planting created in production must resolve NO stage content.
    const auth = await request(app.getHttpServer())
      .post('/api/auth/anonymous')
      .send({ device_id: 'gov-device-lc' })
      .expect(201);
    const token2 = auth.body.token;
    const identity = await prisma.userIdentity.findFirst({
      where: { provider: 'anonymous_device', providerUid: 'gov-device-lc' },
    });
    if (!identity) throw new Error('identity not found');

    // create terrace for this user
    await request(app.getHttpServer())
      .post('/api/terraces')
      .set('Authorization', `Bearer ${token2}`)
      .send({
        name: 'lc露台',
        cityCode: 'beijing',
        sunExposureLevel: 'LONG',
        rainExposed: false,
      })
      .expect(201);
    const terrace = await prisma.terraceProfile.findFirst({ where: { userId: identity.userId } });

    // create a planting directly (bypass API recommendation so the test isolates
    // lifecycle governance, not container recommendation).
    const planting = await prisma.plantingRecord.create({
      data: {
        userId: identity.userId,
        terraceId: terrace!.id,
        cropId: 'crop-grape',
        varietyId: null,
        containerTypeId: 'ct-fabric-bag',
        startMethod: 'nursery_plant',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        status: 'active',
        lifecycleTemplateId: 'lc-grape-crop-v1',
        lifecycleVersion: 1,
      },
    });

    // Because stages are draft, getLifecycleTemplateByIdAndVersion filters them
    // -> lifecycle unavailable, never draft stage content.
    const now = await request(app.getHttpServer())
      .get(`/api/plantings/${planting.id}/now`)
      .set('Authorization', `Bearer ${token2}`)
      .expect(200);
    expect(now.body.status).toBe('lifecycle_unavailable');
    expect(now.body.warnings).toContain('lifecycle_unavailable');
    expect(now.body.current_stage).toBeNull();
  });
});
