import api from './client';

export const SELECTED_REGION_STORAGE_KEY = 'terrace:selected-region';

export type RegionLevel = 'province' | 'city' | 'district';

export interface RegionRow {
  admin_code: string;
  name: string;
  level: RegionLevel;
  parent_admin_code: string | null;
  is_municipality: boolean;
}

export interface PopularRegionRow {
  display_area_code: string;
  display_name: string;
  kind: 'city' | 'municipality';
  province_admin_code: string;
  province_name: string;
  city_admin_code: string | null;
  city_name: string | null;
}

export interface SelectedRegionMetadata {
  admin_code: string;
  name: string;
  province_name: string;
  city_name: string;
  selected_at: string;
}

export interface ResolvedLocationRegion {
  admin_code: string;
  name: string;
  level: 'district';
  province_name: string;
  city_name: string;
}

export interface SeasonalHomePayload {
  today: {
    date: string;
    weekday: string;
    timezone: string;
    lunar: {
      status: 'available' | 'unavailable';
      month: string | null;
      day: string | null;
    };
    solar_term: string | null;
  };
  region: {
    admin_code: string;
    name: string;
    province_name: string;
    city_name: string;
  } | null;
  agri_region_match: {
    status: string;
    selected_area_code: string;
    climate_area_code: string | null;
    climate_zone_code: string | null;
    proxy_used: boolean;
    proxy_name: string | null;
    distance_km: number | null;
  };
  weather: {
    status: 'available' | 'partial' | 'unavailable';
    source: string | null;
    observed_at: string | null;
    updated_at: string | null;
    cache_hit: boolean;
    attribution: {
      name: string | null;
      url: string | null;
      sources: string[];
    };
    summary: string;
    temperature_current_c: number | null;
    temperature_min_c: number | null;
    temperature_max_c: number | null;
    condition: string | null;
    precipitation_mm: number | null;
    precipitation_probability_percent: number | null;
    humidity_percent: number | null;
    wind: string | null;
    warnings: string[];
  };
  seasonal: {
    date: string;
    location_status: 'ok' | 'unavailable';
    climate_zone_code: string | null;
    climate_data_status: 'available' | 'unsupported';
    weather_data_status: 'available' | 'partial' | 'unavailable';
    has_profile: boolean;
    items: SeasonalRecommendationItem[];
    warnings: string[];
  };
}

export interface SeasonalRecommendationItem {
  crop_id: string;
  crop_name: string;
  available_start_methods?: string[];
  season_status?: string;
  weather_assessment?: string;
  difficulty?: number;
  warnings?: string[];
}

function buildRegionUrl(level: RegionLevel, parentAdminCode?: string | null): string {
  const params = new URLSearchParams({ level });
  if (parentAdminCode) {
    params.set('parent_admin_code', parentAdminCode);
  }
  return `/location/regions?${params.toString()}`;
}

export async function fetchRegions(level: RegionLevel, parentAdminCode?: string | null): Promise<RegionRow[]> {
  const res = await api.get(buildRegionUrl(level, parentAdminCode));
  return res.data;
}

export async function fetchPopularRegions(): Promise<PopularRegionRow[]> {
  const res = await api.get('/location/popular-cities');
  return res.data;
}

export async function resolveLocation(lat: number, lng: number): Promise<ResolvedLocationRegion | null> {
  const res = await api.post('/location/resolve', { lat, lng });
  if (!res.data) return null;
  if (res.data.region === null) return null;
  return res.data.region || res.data;
}

export async function fetchSeasonalHome(adminCode: string): Promise<SeasonalHomePayload> {
  const res = await api.get(`/seasonal/home?admin_code=${encodeURIComponent(adminCode)}`);
  return res.data;
}

export function toSelectedRegionMetadata(region: ResolvedLocationRegion | {
  admin_code: string;
  name: string;
  province_name: string;
  city_name: string;
}): SelectedRegionMetadata {
  return {
    admin_code: region.admin_code,
    name: region.name,
    province_name: region.province_name,
    city_name: region.city_name,
    selected_at: new Date().toISOString(),
  };
}

export function loadSelectedRegion(): SelectedRegionMetadata | null {
  try {
    const raw = window.localStorage.getItem(SELECTED_REGION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.admin_code !== 'string' ||
      typeof parsed?.name !== 'string' ||
      typeof parsed?.province_name !== 'string' ||
      typeof parsed?.city_name !== 'string' ||
      typeof parsed?.selected_at !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch (e) {
    return null;
  }
}

export function saveSelectedRegion(region: SelectedRegionMetadata): void {
  const metadata: SelectedRegionMetadata = {
    admin_code: region.admin_code,
    name: region.name,
    province_name: region.province_name,
    city_name: region.city_name,
    selected_at: region.selected_at,
  };
  window.localStorage.setItem(SELECTED_REGION_STORAGE_KEY, JSON.stringify(metadata));
}
