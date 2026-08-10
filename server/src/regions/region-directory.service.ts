import { Inject, Injectable } from '@nestjs/common';
import {
  DistrictRegionContext,
  PublicPopularCityRow,
  PublicRegionRow,
  RegionCatalogRow,
  RegionLevel,
} from './region.types';
import { REGION_REPOSITORY, RegionRepository } from './region.repository';

function toPublicRegion(row: RegionCatalogRow): PublicRegionRow {
  return {
    admin_code: row.adminCode,
    name: row.name,
    level: row.level,
    parent_admin_code: row.parentAdminCode,
    is_municipality: row.isMunicipality,
  };
}

@Injectable()
export class RegionDirectoryService {
  constructor(
    @Inject(REGION_REPOSITORY) private readonly regions: RegionRepository,
  ) {}

  async listRegions(level: RegionLevel, parentAdminCode: string | null): Promise<PublicRegionRow[]> {
    const rows = await this.regions.listRegions({ level, parentAdminCode });
    return rows.map(toPublicRegion);
  }

  async listPopularCities(): Promise<PublicPopularCityRow[]> {
    const rows = await this.regions.listPopularCities();
    return rows
      .filter((row) => row.enabled)
      .sort((a, b) => a.catalogOrder - b.catalogOrder)
      .map((row) => ({
        display_area_code: row.displayAreaCode,
        display_name: row.displayName,
        kind: row.kind,
        province_admin_code: row.provinceAdminCode,
        province_name: row.provinceName,
        city_admin_code: row.kind === 'municipality' ? null : row.cityAdminCode,
        city_name: row.kind === 'municipality' ? null : row.cityName,
      }));
  }

  async findLegacyCityCodeForDistrict(adminCode: string): Promise<string | null> {
    return this.regions.findLegacyCityCodeForDistrict(adminCode);
  }

  async findEnabledDistrict(adminCode: string): Promise<RegionCatalogRow | null> {
    const row = await this.regions.findRegion(adminCode);
    if (!row?.enabled || row.level !== 'district') return null;
    return row;
  }

  async resolveDistrictRegion(adminCode: string): Promise<DistrictRegionContext | null> {
    const district = await this.findEnabledDistrict(adminCode);
    if (!district) return null;
    const parent = district.parentAdminCode
      ? await this.regions.findRegion(district.parentAdminCode)
      : null;
    if (!parent?.enabled) return null;

    if (parent.level === 'province' && parent.isMunicipality) {
      return {
        admin_code: district.adminCode,
        name: district.name,
        level: 'district',
        province_name: parent.name,
        city_name: parent.name,
      };
    }

    if (parent.level !== 'city' || !parent.parentAdminCode) return null;
    const province = await this.regions.findRegion(parent.parentAdminCode);
    if (!province?.enabled || province.level !== 'province') return null;
    return {
      admin_code: district.adminCode,
      name: district.name,
      level: 'district',
      province_name: province.name,
      city_name: parent.name,
    };
  }
}
