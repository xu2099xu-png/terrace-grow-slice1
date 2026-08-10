import {
  ClimateAnchor,
  PopularCityRow,
  RegionCatalogRow,
  RegionClimateDirectMapping,
  RegionLevel,
} from './region.types';
import { RegionRepository } from './region.repository';

export class InMemoryRegionRepository implements RegionRepository {
  constructor(
    private readonly rows: RegionCatalogRow[],
    private readonly popular: PopularCityRow[] = [],
    private readonly directMappings: RegionClimateDirectMapping[] = [],
    private readonly anchors: ClimateAnchor[] = [],
  ) {}

  async listRegions(params: {
    level: RegionLevel;
    parentAdminCode: string | null;
  }): Promise<RegionCatalogRow[]> {
    return this.rows
      .filter((row) => row.enabled)
      .filter((row) => row.level === params.level)
      .filter((row) => row.parentAdminCode === params.parentAdminCode)
      .sort((a, b) => a.catalogOrder - b.catalogOrder);
  }

  async findRegion(adminCode: string): Promise<RegionCatalogRow | null> {
    return this.rows.find((row) => row.adminCode === adminCode) ?? null;
  }

  async listPopularCities(): Promise<PopularCityRow[]> {
    return this.popular
      .filter((row) => row.enabled)
      .sort((a, b) => a.catalogOrder - b.catalogOrder);
  }

  async findLegacyCityCodeForDistrict(adminCode: string): Promise<string | null> {
    const district = await this.findRegion(adminCode);
    if (!district?.enabled || district.level !== 'district' || !district.parentAdminCode) {
      return null;
    }
    const parent = await this.findRegion(district.parentAdminCode);
    if (!parent?.enabled) return null;
    if (parent.level === 'province' && parent.isMunicipality) {
      return this.popular.find((row) => (
        row.enabled
        && row.kind === 'municipality'
        && row.provinceAdminCode === parent.adminCode
      ))?.legacyCityCode ?? null;
    }
    if (parent.level === 'city') {
      return this.popular.find((row) => (
        row.enabled
        && row.kind === 'city'
        && row.cityAdminCode === parent.adminCode
      ))?.legacyCityCode ?? null;
    }
    return null;
  }

  async findDirectClimateMapping(adminCode: string): Promise<RegionClimateDirectMapping | null> {
    return this.directMappings.find((row) => row.adminCode === adminCode) ?? null;
  }

  async listClimateAnchors(): Promise<ClimateAnchor[]> {
    return [...this.anchors];
  }
}
