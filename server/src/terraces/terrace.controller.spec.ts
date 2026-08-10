import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TerraceController } from './terrace.controller';

function makeController() {
  const create = vi.fn(async ({ data }) => ({ id: 'terrace-1', ...data }));
  const update = vi.fn(async ({ data }) => ({ id: 'terrace-1', ...data }));
  const prisma = {
    sunLevelMap: {
      findMany: vi.fn(async () => [
        { level: 'UNKNOWN', hoursMin: 0, hoursMax: 0 },
        { level: 'LONG', hoursMin: 6, hoursMax: 8 },
      ]),
    },
    sunEstimateRule: { findMany: vi.fn(async () => []) },
    climateZone: {
      findMany: vi.fn(async () => [
        { name: '华东', cityCodes: ['hangzhou', 'shanghai'] },
        { name: '华北', cityCodes: ['beijing'] },
      ]),
    },
    terraceProfile: {
      findFirst: vi.fn(async () => null),
      create,
      update,
    },
  };
  const regions = {
    findEnabledDistrict: vi.fn(async (adminCode: string) => ({
      adminCode,
      name: '长安区',
      level: 'district',
      enabled: true,
    })),
    findLegacyCityCodeForDistrict: vi.fn(async (adminCode: string) => {
      if (adminCode === '130102') return 'shijiazhuang';
      if (adminCode === '110105') return 'beijing';
      return null;
    }),
    resolveDistrictRegion: vi.fn(async (adminCode: string) => ({
      admin_code: adminCode,
      name: '上城区',
      level: 'district',
      province_name: '浙江省',
      city_name: '杭州市',
    })),
  };
  const agriRegions = {
    resolve: vi.fn(async () => ({
      status: 'nearest_proxy',
      selected_area_code: '130102',
      climate_area_code: '110105',
      climate_zone_code: 'north_china',
      proxy_used: true,
      proxy_name: '朝阳区',
      distance_km: 12.3,
    })),
  };
  return {
    controller: new TerraceController(prisma as any, regions as any, agriRegions as any),
    prisma: prisma as any,
    regions: regions as any,
    agriRegions: agriRegions as any,
  };
}

describe('TerraceController Slice 6 region profile support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts nearest_proxy district without cityCode and derives legacy cityCode from selected identity', async () => {
    const { controller, prisma, regions, agriRegions } = makeController();

    await controller.upsert('user-1', {
      regionAdminCode: '130102',
      needsDistrictConfirmation: true,
      sunExposureLevel: 'LONG',
      rainExposed: false,
    } as any);

    expect(agriRegions.resolve).toHaveBeenCalledWith('130102');
    expect(regions.findLegacyCityCodeForDistrict).toHaveBeenCalledWith('130102');
    expect(prisma.terraceProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        cityCode: 'shijiazhuang',
        regionAdminCode: '130102',
        needsDistrictConfirmation: false,
      }),
    });
  });

  it('requires either legacy cityCode or confirmed district', async () => {
    const { controller } = makeController();

    await expect(controller.upsert('user-1', {
      sunExposureLevel: 'LONG',
      rainExposed: false,
    } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps legacy cityCode-only upsert compatible', async () => {
    const { controller, prisma, agriRegions } = makeController();

    await controller.upsert('user-1', {
      cityCode: 'shanghai',
      sunExposureLevel: 'LONG',
      rainExposed: false,
    } as any);

    expect(agriRegions.resolve).not.toHaveBeenCalled();
    expect(prisma.terraceProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cityCode: 'shanghai',
        regionAdminCode: null,
        needsDistrictConfirmation: false,
      }),
    });
  });

  it('fails closed when confirmed district cannot map to a frozen legacy cityCode', async () => {
    const { controller, agriRegions } = makeController();
    agriRegions.resolve.mockResolvedValueOnce({
      status: 'direct',
      selected_area_code: '350102',
      climate_area_code: '350102',
      climate_zone_code: 'south_china',
      proxy_used: false,
      proxy_name: null,
      distance_km: 0,
    });

    await expect(controller.upsert('user-1', {
      regionAdminCode: '350102',
      sunExposureLevel: 'LONG',
      rainExposed: false,
    } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns exact region display object for confirmed district profile', async () => {
    const { controller, prisma } = makeController();
    prisma.terraceProfile.findFirst.mockResolvedValueOnce({
      id: 'terrace-1',
      userId: 'user-1',
      cityCode: 'hangzhou',
      regionAdminCode: '330102',
      needsDistrictConfirmation: false,
    });

    const payload = await controller.mine('user-1');
    expect(payload).not.toBeNull();
    expect(payload).toMatchObject({
      cityCode: 'hangzhou',
      climateZone: '华东',
      region: {
        admin_code: '330102',
        name: '上城区',
        province_name: '浙江省',
        city_name: '杭州市',
      },
    });
    expect(payload!.region).not.toHaveProperty('level');
  });

  it('keeps backfilled city-level profile region null while district confirmation is pending', async () => {
    const { controller, prisma, regions } = makeController();
    prisma.terraceProfile.findFirst.mockResolvedValueOnce({
      id: 'terrace-1',
      userId: 'user-1',
      cityCode: 'hangzhou',
      regionAdminCode: '330100',
      needsDistrictConfirmation: true,
    });

    await expect(controller.mine('user-1')).resolves.toMatchObject({
      cityCode: 'hangzhou',
      climateZone: '华东',
      region: null,
    });
    expect(regions.resolveDistrictRegion).not.toHaveBeenCalled();
  });
});
