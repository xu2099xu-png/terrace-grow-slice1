import { describe, expect, it } from 'vitest';
import { RegionDirectoryService } from './region-directory.service';
import { InMemoryRegionRepository } from './test-region-repository';
import { PopularCityRow, RegionCatalogRow } from './region.types';

const rows: RegionCatalogRow[] = [
  {
    adminCode: '110000',
    name: '北京市',
    level: 'province',
    parentAdminCode: null,
    isMunicipality: true,
    enabled: true,
    catalogOrder: 1,
    dataVersion: 'mca-xzqh-mainland-2026-08-09',
    source: 'mca',
    centroidLng: 116.4,
    centroidLat: 39.9,
  },
  {
    adminCode: '110108',
    name: '海淀区',
    level: 'district',
    parentAdminCode: '110000',
    isMunicipality: false,
    enabled: true,
    catalogOrder: 2,
    dataVersion: 'mca-xzqh-mainland-2026-08-09',
    source: 'mca',
    centroidLng: 116.3,
    centroidLat: 39.9,
  },
  {
    adminCode: '330000',
    name: '浙江省',
    level: 'province',
    parentAdminCode: null,
    isMunicipality: false,
    enabled: true,
    catalogOrder: 3,
    dataVersion: 'mca-xzqh-mainland-2026-08-09',
    source: 'mca',
    centroidLng: 120,
    centroidLat: 30,
  },
  {
    adminCode: '330100',
    name: '杭州市',
    level: 'city',
    parentAdminCode: '330000',
    isMunicipality: false,
    enabled: true,
    catalogOrder: 4,
    dataVersion: 'mca-xzqh-mainland-2026-08-09',
    source: 'mca',
    centroidLng: 120.2,
    centroidLat: 30.2,
  },
  {
    adminCode: '330106',
    name: '西湖区',
    level: 'district',
    parentAdminCode: '330100',
    isMunicipality: false,
    enabled: true,
    catalogOrder: 5,
    dataVersion: 'mca-xzqh-mainland-2026-08-09',
    source: 'mca',
    centroidLng: 120.1,
    centroidLat: 30.2,
  },
];

const popular: PopularCityRow[] = [
  {
    legacyCityCode: 'hangzhou',
    displayAreaCode: '330100',
    displayName: '杭州',
    kind: 'city',
    provinceAdminCode: '330000',
    provinceName: '浙江省',
    cityAdminCode: '330100',
    cityName: '杭州市',
    catalogOrder: 2,
    enabled: true,
  },
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
];

describe('RegionDirectoryService', () => {
  const service = new RegionDirectoryService(new InMemoryRegionRepository(rows, popular));

  it('returns public region rows sorted by catalog order without disabled metadata', async () => {
    await expect(service.listRegions('province', null)).resolves.toEqual([
      {
        admin_code: '110000',
        name: '北京市',
        level: 'province',
        parent_admin_code: null,
        is_municipality: true,
      },
      {
        admin_code: '330000',
        name: '浙江省',
        level: 'province',
        parent_admin_code: null,
        is_municipality: false,
      },
    ]);
  });

  it('returns no fake city row under a municipality parent', async () => {
    await expect(service.listRegions('city', '110000')).resolves.toEqual([]);
    await expect(service.listRegions('district', '110000')).resolves.toMatchObject([
      { admin_code: '110108', name: '海淀区', level: 'district' },
    ]);
  });

  it('emits popular city and municipality rows with exact display code rules', async () => {
    const rows = await service.listPopularCities();
    expect(rows).toEqual([
      {
        display_area_code: '110000',
        display_name: '北京',
        kind: 'municipality',
        province_admin_code: '110000',
        province_name: '北京市',
        city_admin_code: null,
        city_name: null,
      },
      {
        display_area_code: '330100',
        display_name: '杭州',
        kind: 'city',
        province_admin_code: '330000',
        province_name: '浙江省',
        city_admin_code: '330100',
        city_name: '杭州市',
      },
    ]);
    expect(rows[0]).not.toHaveProperty('legacyCityCode');
    expect(rows[0]).not.toHaveProperty('legacy_city_code');
  });

  it('resolves district display context for ordinary cities and municipalities', async () => {
    await expect(service.resolveDistrictRegion('110108')).resolves.toEqual({
      admin_code: '110108',
      name: '海淀区',
      level: 'district',
      province_name: '北京市',
      city_name: '北京市',
    });
    await expect(service.resolveDistrictRegion('330106')).resolves.toEqual({
      admin_code: '330106',
      name: '西湖区',
      level: 'district',
      province_name: '浙江省',
      city_name: '杭州市',
    });
  });

  it('finds legacy city code for enabled districts without hardcoded city mappings', async () => {
    await expect(service.findLegacyCityCodeForDistrict('110108')).resolves.toBe('beijing');
    await expect(service.findLegacyCityCodeForDistrict('330106')).resolves.toBe('hangzhou');
    await expect(service.findLegacyCityCodeForDistrict('999999')).resolves.toBeNull();
  });
});
