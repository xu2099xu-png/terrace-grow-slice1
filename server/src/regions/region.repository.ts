import {
  ClimateAnchor,
  PopularCityRow,
  RegionCatalogRow,
  RegionClimateDirectMapping,
  RegionLevel,
} from './region.types';

export const REGION_REPOSITORY = 'REGION_REPOSITORY';

export interface RegionRepository {
  listRegions(params: {
    level: RegionLevel;
    parentAdminCode: string | null;
  }): Promise<RegionCatalogRow[]>;
  findRegion(adminCode: string): Promise<RegionCatalogRow | null>;
  listPopularCities(): Promise<PopularCityRow[]>;
  findLegacyCityCodeForDistrict(adminCode: string): Promise<string | null>;
  findDirectClimateMapping(adminCode: string): Promise<RegionClimateDirectMapping | null>;
  listClimateAnchors(): Promise<ClimateAnchor[]>;
}
