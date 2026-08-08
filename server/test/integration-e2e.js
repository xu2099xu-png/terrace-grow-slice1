// DEV_FIXTURE data requires APP_ENV=development AND ALLOW_DRAFT_FIXTURES=true.
// Tests always run against the isolated test DB, never the dev DB.
process.env.APP_ENV = 'development';
process.env.ALLOW_DRAFT_FIXTURES = 'true';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://terrace:terrace@localhost:5433/terrace_grow_test?schema=public';

const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { AppModule } = require('../dist/src/app.module');

async function run() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableCors({ origin: true, credentials: true });
  await app.init();

  // 1. anonymous auth
  let res = await request(app.getHttpServer())
    .post('/api/auth/anonymous')
    .send({ device_id: 'test-device-1' })
    .expect(201);
  const token = res.body.token;

  // 2. create terrace with direct sunlight
  res = await request(app.getHttpServer())
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
  if (res.body.sunHoursMin < 6) throw new Error(`sunHoursMin expected >=6, got ${res.body.sunHoursMin}`);
  if (res.body.sunConfidence !== 'medium') throw new Error('expected medium confidence');

  // 2b. rainExposed is required at the API boundary
  res = await request(app.getHttpServer())
    .post('/api/terraces')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: '缺字段露台',
      cityCode: 'beijing',
      sunExposureLevel: 'LONG',
    })
    .expect(400);
  if (!String(res.body.message).includes('rainExposed')) throw new Error('expected rainExposed error message');

  // 3. get terrace profile
  res = await request(app.getHttpServer())
    .get('/api/terraces/mine')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  if (res.body.name !== '测试露台') throw new Error('terrace name mismatch');
  if (!res.body.climateZone) throw new Error('expected climateZone to be truthy');

  // 4. list perennial crops (includes blueberry)
  res = await request(app.getHttpServer())
    .get('/api/crops?life_type=perennial')
    .expect(200);
  const blueberry = res.body.find(c => c.name === '蓝莓');
  if (!blueberry) throw new Error('blueberry not found');
  if (!blueberry.environmentRequirement) throw new Error('expected environmentRequirement');

  // 5. list blueberry varieties
  res = await request(app.getHttpServer())
    .get('/api/crops/crop-blueberry/varieties')
    .expect(200);
  if (res.body.length < 3) throw new Error(`expected >=3 varieties, got ${res.body.length}`);

  // 6. full recommendation for blueberry (MATCH sunlight)
  res = await request(app.getHttpServer())
    .post('/api/recommendations/perennial')
    .set('Authorization', `Bearer ${token}`)
    .send({ crop_id: 'crop-blueberry' })
    .expect(201);
  if (res.body.suitability !== 'suitable') throw new Error(`expected suitable, got ${res.body.suitability}`);
  if (res.body.sunlight_status.status !== 'MATCH') throw new Error(`expected MATCH, got ${res.body.sunlight_status.status}`);
  if (!res.body.recommended_varieties || res.body.recommended_varieties.length === 0) throw new Error('expected recommended_varieties');
  if (!res.body.selected_variety_id) throw new Error('expected selected_variety_id');
  if (!res.body.container) throw new Error('expected container');
  if (!res.body.soil_mix) throw new Error('expected soil_mix');
  if (res.body.soil_mix.feasibility !== 'optimal') throw new Error(`expected optimal feasibility, got ${res.body.soil_mix.feasibility}`);
  if (!res.body.water_risk) throw new Error('expected water_risk');
  if (!res.body.next_action.includes('买苗上盆')) throw new Error('expected next_action to include 买苗上盆');

  // 7. list materials with blueberry rules
  res = await request(app.getHttpServer())
    .get('/api/materials')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const peat = res.body.find(m => m.name === '泥炭');
  if (!peat) throw new Error('泥炭 not found');
  if (peat.cropRules.length === 0) throw new Error('expected cropRules for peat');

  // 8. save user material inventory
  res = await request(app.getHttpServer())
    .put('/api/users/me/materials')
    .set('Authorization', `Bearer ${token}`)
    .send({ material_ids: ['mat-peat', 'mat-coco', 'mat-perlite'] })
    .expect(200);
  if (!res.body.ok) throw new Error('expected ok');

  // 9. recalculate soil with owned materials
  res = await request(app.getHttpServer())
    .post('/api/soil/calculate')
    .set('Authorization', `Bearer ${token}`)
    .send({ crop_id: 'crop-blueberry', container_type_id: 'ct-plastic-pot' })
    .expect(201);
  if (!res.body.soil) throw new Error('expected soil');
  if (!res.body.soil.feasibility) throw new Error('expected soil.feasibility');
  if (!res.body.soil.mix) throw new Error('expected soil.mix');
  if (!res.body.water_risk) throw new Error('expected water_risk');

  // 10. unsure sunlight auxiliary path (north + unknown)
  res = await request(app.getHttpServer())
    .post('/api/auth/anonymous')
    .send({ device_id: 'test-device-2' })
    .expect(201);
  const token2 = res.body.token;

  res = await request(app.getHttpServer())
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
  if (res.body.sunHoursMin > 3) throw new Error(`expected low sunHoursMin, got ${res.body.sunHoursMin}`);
  if (res.body.sunConfidence !== 'low') throw new Error('expected low confidence');

  res = await request(app.getHttpServer())
    .post('/api/recommendations/perennial')
    .set('Authorization', `Bearer ${token2}`)
    .send({ crop_id: 'crop-blueberry' })
    .expect(201);
  if (res.body.suitability !== 'likely_unsuitable') throw new Error(`expected likely_unsuitable, got ${res.body.suitability}`);
  if (res.body.sunlight_status.status !== 'LIKELY_NO_MATCH') throw new Error(`expected LIKELY_NO_MATCH`);
  if (!res.body.warnings.includes('日照可能不足，建议先确认')) throw new Error('expected warning');

  // 10b. unknown city: no fake variety selection
  res = await request(app.getHttpServer())
    .post('/api/auth/anonymous')
    .send({ device_id: 'test-device-2b' })
    .expect(201);
  const token2b = res.body.token;
  res = await request(app.getHttpServer())
    .post('/api/terraces')
    .set('Authorization', `Bearer ${token2b}`)
    .send({
      name: '未知城市露台',
      cityCode: 'unknown_city_xyz',
      sunExposureLevel: 'LONG',
      rainExposed: false,
    })
    .expect(201);
  res = await request(app.getHttpServer())
    .post('/api/recommendations/perennial')
    .set('Authorization', `Bearer ${token2b}`)
    .send({ crop_id: 'crop-blueberry' })
    .expect(201);
  if (res.body.selected_variety_id !== null) throw new Error(`unknown-city selected_variety_id must be null, got ${res.body.selected_variety_id}`);
  if (!res.body.warnings.some((w) => String(w).includes('气候信息不足'))) throw new Error('expected unknown-climate warning');

  // 11. BORDERLINE sunlight (east + morning)
  res = await request(app.getHttpServer())
    .post('/api/auth/anonymous')
    .send({ device_id: 'test-device-3' })
    .expect(201);
  const token3 = res.body.token;

  res = await request(app.getHttpServer())
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

  res = await request(app.getHttpServer())
    .post('/api/recommendations/perennial')
    .set('Authorization', `Bearer ${token3}`)
    .send({ crop_id: 'crop-blueberry' })
    .expect(201);
  if (res.body.suitability !== 'borderline') throw new Error(`expected borderline, got ${res.body.suitability}`);
  if (res.body.sunlight_status.status !== 'BORDERLINE') throw new Error(`expected BORDERLINE`);

  // 11b. soil recalc keeps variety-level container requirement (northblue 20-30L)
  res = await request(app.getHttpServer())
    .post('/api/terraces')
    .set('Authorization', `Bearer ${token3}`)
    .send({
      name: '品种级容器露台',
      cityCode: 'beijing',
      sunExposureLevel: 'LONG',
      rainExposed: false,
    })
    .expect(201);
  res = await request(app.getHttpServer())
    .post('/api/recommendations/perennial')
    .set('Authorization', `Bearer ${token3}`)
    .send({ crop_id: 'crop-blueberry', selected_variety_id: 'var-northblue' })
    .expect(201);
  if (res.body.container.volumeRange[0] !== 20 || res.body.container.volumeRange[1] !== 30) {
    throw new Error('expected northblue variety-level container 20-30L');
  }
  res = await request(app.getHttpServer())
    .post('/api/soil/calculate')
    .set('Authorization', `Bearer ${token3}`)
    .send({
      crop_id: 'crop-blueberry',
      container_type_id: 'ct-fabric-bag',
      selected_variety_id: 'var-northblue',
      material_ids: ['mat-peat', 'mat-coco', 'mat-perlite'],
    })
    .expect(201);
  const totalLiters = res.body.soil.mix.reduce((s, m) => s + m.liters, 0);
  if (Math.round(totalLiters) !== 25) throw new Error(`expected 25L for northblue recalc, got ${totalLiters}`);

  // 11c. materials for a different cropId do not return blueberry rules
  res = await request(app.getHttpServer())
    .get('/api/materials?crop_id=crop-grape-future')
    .set('Authorization', `Bearer ${token3}`)
    .expect(200);
  if (res.body.length === 0) throw new Error('expected materials list');
  for (const m of res.body) {
    if (m.cropRules.length !== 0) throw new Error(`cropRules must be empty for other crop, got ${JSON.stringify(m.cropRules)}`);
  }

  console.log('All integration tests passed!');
  await app.close();
}

run().catch(err => {
  console.error('Integration test failed:', err);
  process.exit(1);
});
