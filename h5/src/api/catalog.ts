import api from './client';

export interface EnvironmentRequirement {
  id: string;
  minSunHours?: number | null;
  tempMin?: number | null;
  tempMax?: number | null;
  optimalTempMin?: number | null;
  optimalTempMax?: number | null;
  frostSensitive?: boolean | null;
}

export interface CropSummary {
  id: string;
  name: string;
  latinName?: string | null;
  lifeType?: string;
  category?: string;
  difficulty?: number | null;
  familyUse?: number | null;
  yieldLevel?: number | null;
  harvestDaysMin?: number | null;
  harvestDaysMax?: number | null;
  containerFriendly?: boolean;
  recommendedStartMethod?: string | null;
  startMethodNote?: string | null;
  waterloggingSensitivity?: number | null;
  acidityNeed?: string | null;
  requiresAcidification?: boolean;
  coverImage?: string | null;
  environmentRequirement?: EnvironmentRequirement[];
  sowingCalendars?: unknown[];
  [key: string]: unknown;
}

export interface VarietySummary {
  id: string;
  name: string;
  maturePeriod?: string | null;
  plantHabit?: string | null;
  containerFit?: number | null;
  traits?: {
    key: string;
    valueNumber?: number | null;
    valueMin?: number | null;
    valueMax?: number | null;
  }[];
}

export async function fetchCrops(lifeType?: string): Promise<CropSummary[]> {
  const suffix = lifeType ? `?life_type=${encodeURIComponent(lifeType)}` : '';
  const res = await api.get(`/crops${suffix}`);
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchCropDetail(
  cropId: string,
  params: { city_code?: string } = {},
): Promise<CropSummary> {
  const query = params.city_code ? `?city_code=${encodeURIComponent(params.city_code)}` : '';
  const res = await api.get(`/crops/${encodeURIComponent(cropId)}${query}`);
  return res.data;
}

export async function fetchCropVarieties(cropId: string): Promise<VarietySummary[]> {
  const res = await api.get(`/crops/${encodeURIComponent(cropId)}/varieties`);
  return Array.isArray(res.data) ? res.data : [];
}
