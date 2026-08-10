export type RegionLevel = 'province' | 'city' | 'district';

export interface RegionCatalogRow {
  adminCode: string;
  name: string;
  level: RegionLevel;
  parentAdminCode: string | null;
  isMunicipality: boolean;
  enabled: boolean;
  catalogOrder: number;
  dataVersion: string;
  source: string;
  centroidLng: number;
  centroidLat: number;
}

export interface PublicRegionRow {
  admin_code: string;
  name: string;
  level: RegionLevel;
  parent_admin_code: string | null;
  is_municipality: boolean;
}

export interface PopularCityRow {
  legacyCityCode: string;
  displayAreaCode: string;
  displayName: string;
  kind: 'city' | 'municipality';
  provinceAdminCode: string;
  provinceName: string;
  cityAdminCode: string | null;
  cityName: string | null;
  catalogOrder: number;
  enabled: boolean;
}

export interface PublicPopularCityRow {
  display_area_code: string;
  display_name: string;
  kind: 'city' | 'municipality';
  province_admin_code: string;
  province_name: string;
  city_admin_code: string | null;
  city_name: string | null;
}

export interface DistrictRegionContext {
  admin_code: string;
  name: string;
  level: 'district';
  province_name: string;
  city_name: string;
}

export interface RegionClimateDirectMapping {
  adminCode: string;
  climateZoneCode: string;
  source: string;
  reviewStatus: string;
  confidence: number;
  version: number;
}

export interface ClimateAnchor {
  adminCode: string;
  climateZoneCode: string;
  centroidLng: number;
  centroidLat: number;
  enabled: boolean;
  source: string;
  reviewStatus: string;
  confidence: number;
  version: number;
}

export type AgriRegionMatchStatus = 'direct' | 'nearest_proxy' | 'unsupported';

export interface AgriRegionMatch {
  status: AgriRegionMatchStatus;
  selected_area_code: string;
  climate_area_code: string | null;
  climate_zone_code: string | null;
  proxy_used: boolean;
  proxy_name: string | null;
  distance_km: number | null;
}
