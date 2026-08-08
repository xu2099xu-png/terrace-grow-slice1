import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import {
  buildSeasonalRecommendations,
  aggregateWeather,
  windowHits,
  mmdd,
  sunlightWeight,
  SeasonalCropRow,
  SowingWindowRow,
  DailyWeatherRow,
} from '../src/engines/seasonal-engine';

// ---------------------------------------------------------------------------
// Slice 3 Gate — RED tests first (AC v1.1 frozen).
// Most engine assertions call buildSeasonalRecommendations(), which is
// deliberately NOT implemented yet so these fail until Coding lands.
// ---------------------------------------------------------------------------

const carrot: SeasonalCropRow = {
  id: 'crop-carrot', name: '胡萝卜', recommendedStartMethod: 'direct_seed',
  difficulty: 1, containerFriendly: true, familyUse: 5, yieldLevel: 3,
  harvestDaysMin: 70, harvestDaysMax: 100, frostSensitive: false,
  tempMin: 5, tempMax: 30, minSunHours: 4,
};
const lettuce: SeasonalCropRow = {
  id: 'crop-lettuce', name: '生菜', recommendedStartMethod: 'either',
  difficulty: 1, containerFriendly: true, familyUse: 5, yieldLevel: 3,
  harvestDaysMin: 30, harvestDaysMax: 45, frostSensitive: false,
  tempMin: 2, tempMax: 28, minSunHours: 3,
};
const tomato: SeasonalCropRow = {
  id: 'crop-tomato', name: '番茄', recommendedStartMethod: 'nursery_plant',
  difficulty: 1, containerFriendly: true, familyUse: 5, yieldLevel: 4,
  harvestDaysMin: 60, harvestDaysMax: 90, frostSensitive: true,
  tempMin: 10, tempMax: 35, minSunHours: 6,
};
const peanut: SeasonalCropRow = {
  id: 'crop-peanut', name: '花生', recommendedStartMethod: 'direct_seed',
  difficulty: 2, containerFriendly: false, familyUse: 4, yieldLevel: 3,
  harvestDaysMin: 100, harvestDaysMax: 130, frostSensitive: true,
  tempMin: 15, tempMax: 35, minSunHours: 6,
};

const carrotSpring: SowingWindowRow = { cropId: 'crop-carrot', climateZoneCode: 'north_china', startMethod: 'direct_seed', windowKey: 'spring', windowStart: '03-01', windowEnd: '04-30' };
const carrotAutumn: SowingWindowRow = { cropId: 'crop-carrot', climateZoneCode: 'north_china', startMethod: 'direct_seed', windowKey: 'autumn', windowStart: '08-20', windowEnd: '09-30' };
const lettuceDirectSeed: SowingWindowRow = { cropId: 'crop-lettuce', climateZoneCode: 'north_china', startMethod: 'direct_seed', windowKey: 'summer', windowStart: '08-01', windowEnd: '09-30' };
const lettuceNursery: SowingWindowRow = { cropId: 'crop-lettuce', climateZoneCode: 'north_china', startMethod: 'nursery_plant', windowKey: 'autumn', windowStart: '09-01', windowEnd: '10-30' };
const tomatoWinter: SowingWindowRow = { cropId: 'crop-tomato', climateZoneCode: 'north_china', startMethod: 'nursery_plant', windowKey: 'winter_seed', windowStart: '11-01', windowEnd: '02-15' };
const peanutSummer: SowingWindowRow = { cropId: 'crop-peanut', climateZoneCode: 'north_china', startMethod: 'direct_seed', windowKey: 'summer', windowStart: '04-01', windowEnd: '06-30' };

const fullWeather: DailyWeatherRow[] = [
  { date: '2026-08-15', tempMinC: 18, tempMaxC: 26, frostRisk: false },
  { date: '2026-08-16', tempMinC: 19, tempMaxC: 27, frostRisk: false },
  { date: '2026-08-17', tempMinC: 18, tempMaxC: 25, frostRisk: false },
];

function input(
  date: Date,
  crops: SeasonalCropRow[],
  windows: SowingWindowRow[],
  weather: DailyWeatherRow[] | null = null,
  terrace?: any,
) {
  return { date, climateZoneCode: 'north_china', crops, windows, weather, terrace: terrace ?? null };
}

describe('Slice 3 Gate — seasonal engine invariants (RED first)', () => {
  // 1. multi-window: spring + autumn coexist; summer must not match
  it('multi-window: summer date is NOT in_window, autumn date is', () => {
    const summer = buildSeasonalRecommendations(
      input(new Date('2026-07-01T04:00:00.000Z'), [carrot], [carrotSpring, carrotAutumn]),
    );
    expect(summer.items.find((i) => i.crop_id === 'crop-carrot')).toBeUndefined();

    const autumn = buildSeasonalRecommendations(
      input(new Date('2026-09-01T04:00:00.000Z'), [carrot], [carrotSpring, carrotAutumn]),
    );
    const item = autumn.items.find((i) => i.crop_id === 'crop-carrot');
    expect(item).toBeDefined();
    expect(item!.season_status).toBe('in_window');
    expect(item!.available_start_methods).toEqual(['direct_seed']);
  });

  // 2. SowingCalendar startMethod must never be 'either' (engine invariant)
  it('SowingCalendar startMethod never yields "either" as a usable method', () => {
    const badWindow: SowingWindowRow = { cropId: 'crop-lettuce', climateZoneCode: 'north_china', startMethod: 'either', windowKey: 'x', windowStart: '01-01', windowEnd: '12-31' };
    const res = buildSeasonalRecommendations(
      input(new Date('2026-08-15T04:00:00.000Z'), [lettuce], [lettuceDirectSeed, badWindow]),
    );
    const item = res.items.find((i) => i.crop_id === 'crop-lettuce');
    expect(item).toBeDefined();
    expect(item!.available_start_methods).not.toContain('either');
  });

  // 3. available_start_methods computed from windows that actually hit today
  it('available_start_methods only includes methods whose window hits today', () => {
    const aug15 = buildSeasonalRecommendations(
      input(new Date('2026-08-15T04:00:00.000Z'), [lettuce], [lettuceDirectSeed, lettuceNursery]),
    );
    const item = aug15.items.find((i) => i.crop_id === 'crop-lettuce');
    expect(item!.available_start_methods).toEqual(['direct_seed']);

    const sep15 = buildSeasonalRecommendations(
      input(new Date('2026-09-15T04:00:00.000Z'), [lettuce], [lettuceDirectSeed, lettuceNursery]),
    );
    const sepItem = sep15.items.find((i) => i.crop_id === 'crop-lettuce');
    expect(sepItem!.available_start_methods).toEqual(['direct_seed', 'nursery_plant']);
  });

  // 5. weather unavailable → recommendations still exist
  it('weather unavailable still yields recommendations', () => {
    const res = buildSeasonalRecommendations(
      input(new Date('2026-04-01T04:00:00.000Z'), [carrot], [carrotSpring], null),
    );
    expect(res.weather_data_status).toBe('unavailable');
    expect(res.items.length).toBeGreaterThan(0);
  });

  // 6. partial temperature → no temperature hard filter
  it('partial temperature does not hard-filter a crop', () => {
    const partial = [{ date: '2026-08-15', tempMinC: -5, tempMaxC: 0 }];
    const res = buildSeasonalRecommendations(
      input(new Date('2026-08-15T04:00:00.000Z'), [lettuce], [lettuceDirectSeed], partial),
    );
    const item = res.items.find((i) => i.crop_id === 'crop-lettuce');
    expect(item).toBeDefined(); // kept despite cold partial data
    expect(item!.weather_assessment).toBe('unknown');
    expect(res.weather_data_status).toBe('partial');
  });

  // 7. frost unknown is never false
  it('aggregateWeather: missing frost data → frostRisk unknown, never false', () => {
    const agg = aggregateWeather([{ date: '2026-08-15', tempMinC: 10, tempMaxC: 20 }]);
    expect(agg.frostRisk).toBe('unknown');
  });
  it('engine: frost_unknown + frost_sensitive crop is NOT filtered as if no frost', () => {
    const weatherNoFrost = fullWeather.map((d) => ({ date: d.date, tempMinC: d.tempMinC, tempMaxC: d.tempMaxC }));
    const res = buildSeasonalRecommendations(
      input(new Date('2026-01-10T04:00:00.000Z'), [tomato], [tomatoWinter], weatherNoFrost),
    );
    const item = res.items.find((i) => i.crop_id === 'crop-tomato');
    expect(item).toBeDefined();
    expect(item!.weather_assessment).toBe('unknown');
  });

  // 8. weather_data_status and weather_assessment are independent
  it('weather_data_status partial + weather_assessment unknown is a legal pair', () => {
    const res = buildSeasonalRecommendations(
      input(new Date('2026-08-15T04:00:00.000Z'), [lettuce], [lettuceDirectSeed], [{ date: '2026-08-15', tempMinC: 18, tempMaxC: 26 }]),
    );
    expect(res.weather_data_status).toBe('partial');
    const item = res.items.find((i) => i.crop_id === 'crop-lettuce');
    expect(item!.weather_assessment).toBe('unknown');
  });

  // 9. deterministic ranking
  it('equal-score crops keep stable order across runs', () => {
    const a = buildSeasonalRecommendations(
      input(new Date('2026-05-01T04:00:00.000Z'), [tomato, peanut], [peanutSummer], null),
    );
    const b = buildSeasonalRecommendations(
      input(new Date('2026-05-01T04:00:00.000Z'), [tomato, peanut], [peanutSummer], null),
    );
    expect(a.items.map((i) => i.crop_id)).toEqual(b.items.map((i) => i.crop_id));
    expect(a.items.every((i) => typeof i.rank === 'number' && i.rank > 0)).toBe(true);
  });

  // 13. Asia/Shanghai boundary: 00:10 Beijing is already the next day
  it('Asia/Shanghai 00:10 is next calendar day (08-01 window hit)', () => {
    const d = new Date('2026-07-31T16:10:00.000Z'); // Beijing 2026-08-01 00:10
    expect(mmdd(d)).toBe('08-01');
    const res = buildSeasonalRecommendations(
      input(d, [lettuce], [lettuceDirectSeed]),
    );
    expect(res.items.some((i) => i.crop_id === 'crop-lettuce' && i.season_status === 'in_window')).toBe(true);
  });

  // 14. year-crossing window
  it('year-crossing window matches winter date, not late spring', () => {
    expect(windowHits('11-01', '02-15', '01-10')).toBe(true);
    expect(windowHits('11-01', '02-15', '03-01')).toBe(false);
    const res = buildSeasonalRecommendations(
      input(new Date('2026-01-10T04:00:00.000Z'), [tomato], [tomatoWinter]),
    );
    expect(res.items.some((i) => i.crop_id === 'crop-tomato' && i.season_status === 'in_window')).toBe(true);
  });

  // 15. no terrace → neutral, no fabricated sunlight
  it('no terrace → has_profile=false, no fabricated sunlight filter', () => {
    const res = buildSeasonalRecommendations(
      input(new Date('2026-04-01T04:00:00.000Z'), [carrot], [carrotSpring]),
    );
    expect(res.has_profile).toBe(false);
    expect(res.items.some((i) => i.crop_id === 'crop-carrot')).toBe(true);
  });

  // 16. terrace enhances ranking via sunlight weight
  it('terrace enhances ranking (sunlight down-weights shade crop)', () => {
    const base = buildSeasonalRecommendations(
      input(new Date('2026-04-01T04:00:00.000Z'), [carrot, lettuce], [carrotSpring, lettuceDirectSeed], null),
    );
    const shaded = buildSeasonalRecommendations(
      input(new Date('2026-04-01T04:00:00.000Z'), [carrot, lettuce], [carrotSpring, lettuceDirectSeed], null, {
        sunHoursMin: 0, sunHoursMax: 2, sunConfidence: 'medium',
      }),
    );
    expect(shaded.has_profile).toBe(true);
    const baseCarrot = base.items.find((i) => i.crop_id === 'crop-carrot')!.score;
    const shadedCarrot = shaded.items.find((i) => i.crop_id === 'crop-carrot')!.score;
    expect(shadedCarrot).toBeLessThan(baseCarrot); // sun-loving carrot down-weighted
  });

  // 11. sunlight enhancement reuses frozen assessSunlight
  it('sunlightWeight matches frozen assessSunlight semantics', () => {
    expect(sunlightWeight(carrot, { sunHoursMin: 6, sunHoursMax: 9, sunConfidence: 'medium' }).status).toBe('MATCH');
    expect(sunlightWeight(carrot, { sunHoursMin: 0, sunHoursMax: 2, sunConfidence: 'medium' }).status).toBe('NO_MATCH');
    expect(sunlightWeight(carrot, null).status).toBe('NEUTRAL');
  });

  // 17. three-day complete weather → temperature rule takes effect
  it('three-day complete weather: temp clearly out of range → temp_out_of_range', () => {
    const coldFull = [
      { date: '2026-01-10', tempMinC: 0, tempMaxC: 2, frostRisk: false },
      { date: '2026-01-11', tempMinC: 1, tempMaxC: 3, frostRisk: false },
      { date: '2026-01-12', tempMinC: 0, tempMaxC: 2, frostRisk: false },
    ];
    const res = buildSeasonalRecommendations(
      input(new Date('2026-01-10T04:00:00.000Z'), [tomato], [tomatoWinter], coldFull),
    );
    const item = res.items.find((i) => i.crop_id === 'crop-tomato');
    expect(res.weather_data_status).toBe('available');
    expect(item).toBeDefined();
    expect(item!.weather_assessment).toBe('temp_out_of_range'); // 3-day mean ~1.3°C < tomato tempMin 10
  });

  // 17b. three-day complete weather within range → suitable
  it('three-day complete weather within range → suitable', () => {
    const res = buildSeasonalRecommendations(
      input(new Date('2026-08-15T04:00:00.000Z'), [lettuce], [lettuceDirectSeed], fullWeather),
    );
    const item = res.items.find((i) => i.crop_id === 'crop-lettuce');
    expect(res.weather_data_status).toBe('available');
    expect(item!.weather_assessment).toBe('suitable');
  });
});

describe('Slice 3 Gate — API contracts (RED first)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // 4. unknown city → unsupported + items=[]
  it('unknown city → climate_data_status=unsupported, items=[]', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/seasons/now?city_code=nowhere-city')
      .expect(200);
    expect(res.body.climate_data_status).toBe('unsupported');
    expect(res.body.items).toEqual([]);
  });

  // 12. supported-cities data-driven
  it('supported-cities comes from climate mapping data', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/location/supported-cities')
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const codes = res.body.map((c: any) => c.city_code);
    expect(codes).toContain('beijing'); // seeded climate zone mapping
    expect(codes).not.toContain('nowhere-city');
  });

  // 10. draft SowingCalendar must not leak in production
  it('production: draft seasonal crops are not served', async () => {
    const prevAppEnv = process.env.APP_ENV;
    const prevAllowDraft = process.env.ALLOW_DRAFT_FIXTURES;
    process.env.APP_ENV = 'production';
    process.env.ALLOW_DRAFT_FIXTURES = 'true';
    try {
      const prodModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
      const prodApp = prodModule.createNestApplication();
      prodApp.setGlobalPrefix('api');
      await prodApp.init();
      try {
        const res = await request(prodApp.getHttpServer())
          .get('/api/seasons/now?city_code=beijing')
          .expect(200);
        // all seasonal crops are draft → production serves none of them
        const draftIds = ['crop-tomato', 'crop-carrot', 'crop-peanut', 'crop-lettuce'];
        for (const id of draftIds) {
          expect(res.body.items.find((i: any) => i.crop_id === id)).toBeUndefined();
        }
      } finally {
        await prodApp.close();
      }
    } finally {
      process.env.APP_ENV = prevAppEnv;
      process.env.ALLOW_DRAFT_FIXTURES = prevAllowDraft;
    }
  });
});

describe('Slice 3 Gate — DB invariants (SowingCalendar)', () => {
  let app: INestApplication;
  let prisma: any;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('15. DB rejects SowingCalendar with startMethod=either (CHECK)', async () => {
    await expect(
      prisma.sowingCalendar.create({
        data: {
          cropId: 'crop-lettuce',
          climateZoneCode: 'north_china',
          startMethod: 'either',
          windowKey: 'bad',
          windowStart: '01-01',
          windowEnd: '01-31',
        },
      }),
    ).rejects.toThrow(/check constraint/i);
  });

  it('13. DB allows two independent windows for the same crop/zone/method', async () => {
    const keys = [`s3db-spring-${Date.now()}`, `s3db-autumn-${Date.now()}`];
    try {
      await prisma.sowingCalendar.create({
        data: {
          cropId: 'crop-lettuce',
          climateZoneCode: 'north_china',
          startMethod: 'direct_seed',
          windowKey: keys[0],
          windowStart: '03-01',
          windowEnd: '04-30',
        },
      });
      await prisma.sowingCalendar.create({
        data: {
          cropId: 'crop-lettuce',
          climateZoneCode: 'north_china',
          startMethod: 'direct_seed',
          windowKey: keys[1],
          windowStart: '08-20',
          windowEnd: '09-30',
        },
      });
    } finally {
      await prisma.sowingCalendar.deleteMany({
        where: { windowKey: { in: keys } },
      });
    }
  });

  it('13b. duplicate windowKey for same crop/zone/method is rejected', async () => {
    const key = `s3db-dup-${Date.now()}`;
    try {
      await prisma.sowingCalendar.create({
        data: {
          cropId: 'crop-lettuce',
          climateZoneCode: 'north_china',
          startMethod: 'direct_seed',
          windowKey: key,
          windowStart: '03-01',
          windowEnd: '04-30',
        },
      });
      await expect(
        prisma.sowingCalendar.create({
          data: {
            cropId: 'crop-lettuce',
            climateZoneCode: 'north_china',
            startMethod: 'direct_seed',
            windowKey: key,
            windowStart: '08-20',
            windowEnd: '09-30',
          },
        }),
      ).rejects.toThrow(/unique constraint/i);
    } finally {
      await prisma.sowingCalendar.deleteMany({ where: { windowKey: key } });
    }
  });
});
