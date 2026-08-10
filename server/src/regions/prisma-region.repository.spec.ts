import { describe, expect, it, vi } from 'vitest';
import { PrismaRegionRepository } from './prisma-region.repository';

const regionRow = (overrides: Record<string, unknown>) => ({
  adminCode: '110108',
  name: '海淀区',
  level: 'district',
  parentAdminCode: '110000',
  isMunicipality: false,
  enabled: true,
  catalogOrder: 1,
  dataVersion: 'mca-xzqh-mainland-2026-08-09',
  source: 'mca',
  centroidLng: 116.3,
  centroidLat: 39.9,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('PrismaRegionRepository', () => {
  it('reads popular cities from the real PopularCity Prisma model and keeps legacy code internal', async () => {
    const prisma = {
      popularCity: {
        findMany: vi.fn().mockResolvedValue([
          {
            legacyCityCode: 'beijing',
            displayAreaCode: '110000',
            displayName: '北京',
            kind: 'municipality',
            provinceAdminCode: '110000',
            provinceName: '北京市',
            cityAdminCode: null,
            cityName: null,
            catalogOrder: 1,
            enabled: true,
          },
        ]),
      },
    } as any;
    const repo = new PrismaRegionRepository(prisma);
    await expect(repo.listPopularCities()).resolves.toEqual([
      expect.objectContaining({
        legacyCityCode: 'beijing',
        displayAreaCode: '110000',
        kind: 'municipality',
      }),
    ]);
    expect(prisma.popularCity.findMany).toHaveBeenCalledWith({
      where: { enabled: true },
      orderBy: { catalogOrder: 'asc' },
    });
  });

  it('finds legacy code for a district under a municipality via province admin code', async () => {
    const prisma = {
      region: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(regionRow({ adminCode: '110108', parentAdminCode: '110000' }))
          .mockResolvedValueOnce(regionRow({
            adminCode: '110000',
            name: '北京市',
            level: 'province',
            parentAdminCode: null,
            isMunicipality: true,
          })),
      },
      popularCity: {
        findFirst: vi.fn().mockResolvedValue({ legacyCityCode: 'beijing' }),
      },
    } as any;
    const repo = new PrismaRegionRepository(prisma);
    await expect(repo.findLegacyCityCodeForDistrict('110108')).resolves.toBe('beijing');
    expect(prisma.popularCity.findFirst).toHaveBeenCalledWith({
      where: {
        enabled: true,
        kind: 'municipality',
        provinceAdminCode: '110000',
      },
      select: { legacyCityCode: true },
    });
  });

  it('finds legacy code for an ordinary district via parent city admin code', async () => {
    const prisma = {
      region: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(regionRow({ adminCode: '330106', parentAdminCode: '330100' }))
          .mockResolvedValueOnce(regionRow({
            adminCode: '330100',
            name: '杭州市',
            level: 'city',
            parentAdminCode: '330000',
            isMunicipality: false,
          })),
      },
      popularCity: {
        findFirst: vi.fn().mockResolvedValue({ legacyCityCode: 'hangzhou' }),
      },
    } as any;
    const repo = new PrismaRegionRepository(prisma);
    await expect(repo.findLegacyCityCodeForDistrict('330106')).resolves.toBe('hangzhou');
    expect(prisma.popularCity.findFirst).toHaveBeenCalledWith({
      where: {
        enabled: true,
        kind: 'city',
        cityAdminCode: '330100',
      },
      select: { legacyCityCode: true },
    });
  });

  it('returns null when enabled district is not in the popular legacy set', async () => {
    const prisma = {
      region: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(regionRow({ adminCode: '350102', parentAdminCode: '350100' }))
          .mockResolvedValueOnce(regionRow({
            adminCode: '350100',
            name: '福州市',
            level: 'city',
            parentAdminCode: '350000',
            isMunicipality: false,
          })),
      },
      popularCity: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as any;
    const repo = new PrismaRegionRepository(prisma);
    await expect(repo.findLegacyCityCodeForDistrict('350102')).resolves.toBeNull();
  });
});
