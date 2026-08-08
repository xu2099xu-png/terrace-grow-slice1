/**
 * seasonal-engine — pure functions for Slice 3 "这个季节种什么".
 * Independent from buildPerennialPlan (Slice 1/2 frozen).
 *
 * Pipeline: Eligibility (available_start_methods via sowing windows)
 * → Weather hard filters (two frozen rules)
 * → Optional sunlight enhancement (REUSES assessSunlight, never a second algo)
 * → Deterministic ranking.
 *
 * Date semantics: Asia/Shanghai calendar day, same date-only helper as Slice 2.
 */
import { assessSunlight } from '../recommend-engine/sunlight';
import { toShanghaiDate } from '../lifecycle-engine';

export type WeatherDataStatus = 'available' | 'partial' | 'unavailable';
export type WeatherAssessment =
  | 'suitable'
  | 'cold_risk'
  | 'temp_out_of_range'
  | 'frost_risk'
  | 'unknown';
export type SeasonStatus = 'in_window' | 'too_early' | 'too_late' | 'no_data';

export interface SowingWindowRow {
  cropId: string;
  climateZoneCode: string; // FK → ClimateZone.code
  startMethod: string; // nursery_plant | direct_seed (never 'either')
  windowKey: string; // stable id, e.g. spring_1 / autumn_1 (0..N windows)
  windowStart: string; // 'MM-DD', may cross year (e.g. '11-01')
  windowEnd: string; // 'MM-DD', inclusive
}

export interface SeasonalCropRow {
  id: string;
  name: string;
  recommendedStartMethod: string; // nursery_plant | direct_seed | either
  difficulty: number;
  containerFriendly: boolean;
  familyUse: number;
  yieldLevel: number;
  harvestDaysMin: number | null;
  harvestDaysMax: number | null;
  frostSensitive: boolean;
  tempMin: number | null;
  tempMax: number | null;
  minSunHours: number; // from EnvironmentRequirement, used for sunlight enhancement
}

export interface DailyWeatherRow {
  date: string; // Asia/Shanghai date 'yyyy-MM-dd'
  tempMinC?: number;
  tempMaxC?: number;
  frostRisk?: boolean | 'unknown';
}

export interface TerraceEnhancement {
  sunHoursMin: number;
  sunHoursMax: number;
  sunConfidence: string; // 'medium' | 'low'
}

export interface SeasonalItem {
  crop_id: string;
  crop_name: string;
  start_method: string; // display-preferred start method
  available_start_methods: string[]; // methods whose window hits today
  season_status: SeasonStatus;
  weather_assessment: WeatherAssessment;
  difficulty: number; // AC-14 short card
  score: number;
  rank: number;
  tags: string[];
  warnings: string[];
  reasons: string[];
}

export interface SeasonalEngineResult {
  climate_data_status: 'supported' | 'unsupported';
  weather_data_status: WeatherDataStatus;
  has_profile: boolean;
  items: SeasonalItem[];
  warnings: string[];
}

export interface SeasonalEngineInput {
  date: Date; // Asia/Shanghai calendar day
  climateZoneCode: string | null; // null → unsupported
  crops: SeasonalCropRow[];
  windows: SowingWindowRow[];
  weather: DailyWeatherRow[] | null; // today + next 2 days
  terrace?: TerraceEnhancement | null;
}

/** Day-of-year helpers for 'MM-DD' window matching (Asia/Shanghai based). */
function mmdd(date: Date): string {
  const { y, m, day } = toShanghaiDate(date);
  const mon = String(m + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${mon}-${d}`;
}

/** A 'MM-DD' window matches today, including year-crossing windows. */
function windowHits(windowStart: string, windowEnd: string, today: string): boolean {
  if (windowStart <= windowEnd) {
    return today >= windowStart && today <= windowEnd;
  }
  // year-crossing window: e.g. '11-01' .. '02-15'
  return today >= windowStart || today <= windowEnd;
}

/** Aggregate the recent-3-day weather into data status + temperature/frost facts. */
export function aggregateWeather(days: DailyWeatherRow[]): {
  weather_data_status: WeatherDataStatus;
  threeDayMeanC: number | null;
  frostRisk: boolean | 'unknown';
} {
  if (!days || days.length === 0) {
    return { weather_data_status: 'unavailable', threeDayMeanC: null, frostRisk: 'unknown' };
  }
  const means: number[] = [];
  let anyFrostTrue = false;
  let anyUnknown = false;
  let covered = 0;
  for (const d of days) {
    if (d.tempMinC !== undefined && d.tempMaxC !== undefined) {
      means.push((d.tempMinC + d.tempMaxC) / 2);
    }
    if (d.frostRisk !== undefined) {
      covered++;
      if (d.frostRisk === true) anyFrostTrue = true;
      if (d.frostRisk === 'unknown') anyUnknown = true;
    }
  }
  const threeDayMeanC = means.length > 0
    ? Math.round((means.reduce((a, b) => a + b, 0) / means.length) * 10) / 10
    : null;
  const fullTemp = means.length === days.length && days.length === 3;
  const fullFrost = covered === days.length && days.length === 3;
  const weather_data_status: WeatherDataStatus =
    fullTemp && fullFrost ? 'available' : days.length > 0 ? 'partial' : 'unavailable';
  let frostRisk: boolean | 'unknown' = 'unknown';
  if (fullFrost) {
    frostRisk = anyFrostTrue ? true : false;
  } else if (anyFrostTrue) {
    frostRisk = true;
  }
  return { weather_data_status, threeDayMeanC, frostRisk };
}

/** The set of concrete start methods a crop may attempt, given its overall method. */
function candidateMethods(crop: SeasonalCropRow): string[] {
  if (crop.recommendedStartMethod === 'either') {
    return ['direct_seed', 'nursery_plant'];
  }
  return [crop.recommendedStartMethod];
}

/**
 * Which concrete start methods have a window that hits today.
 * Invalid rows (e.g. startMethod='either' in windows) are never counted.
 */
function resolveAvailableMethods(
  crop: SeasonalCropRow,
  zoneCode: string,
  windows: SowingWindowRow[],
  today: string,
): string[] {
  const wanted = candidateMethods(crop);
  const hit = new Set<string>();
  for (const w of windows) {
    if (w.cropId !== crop.id || w.climateZoneCode !== zoneCode) continue;
    if (!wanted.includes(w.startMethod)) continue; // ignore invalid/either rows
    if (windowHits(w.windowStart, w.windowEnd, today)) hit.add(w.startMethod);
  }
  return wanted.filter((m) => hit.has(m));
}

/**
 * Weather assessment per crop. Only two frozen hard filters:
 *  - temperature clearly out of range (only when temp data is complete)
 *  - frost risk × frost_sensitive (only when frost data is complete)
 * Data that is partial/unavailable yields 'unknown' — never a default value.
 */
function assessWeatherForCrop(
  crop: SeasonalCropRow,
  agg: { weather_data_status: WeatherDataStatus; threeDayMeanC: number | null; frostRisk: boolean | 'unknown' },
): WeatherAssessment {
  if (agg.weather_data_status !== 'available') {
    return 'unknown'; // not enough reliable weather facts → no judgment
  }
  if (
    agg.threeDayMeanC !== null &&
    crop.tempMin !== null &&
    crop.tempMax !== null &&
    (agg.threeDayMeanC < crop.tempMin || agg.threeDayMeanC > crop.tempMax)
  ) {
    return 'temp_out_of_range';
  }
  if (agg.frostRisk === true && crop.frostSensitive) {
    return 'frost_risk';
  }
  return 'suitable';
}

/** Base score from the frozen product priorities (season-first is handled by eligibility). */
function baseScore(crop: SeasonalCropRow): number {
  let score = 0;
  score += (5 - crop.difficulty) * 10; // 新手容易 (difficulty 1 → 40)
  score += crop.containerFriendly ? 15 : 0; // 露台适合
  score += crop.familyUse * 5; // 家庭常见 / 好吃 (1-5)
  score += crop.yieldLevel * 5; // 产量
  if (crop.harvestDaysMin) score += Math.max(0, 40 - crop.harvestDaysMin); // 收获速度
  return score;
}

/** Build the seasonal recommendation list. */
export function buildSeasonalRecommendations(input: SeasonalEngineInput): SeasonalEngineResult {
  const warnings: string[] = [];

  // AC-09/AC-26: unsupported city terminates agricultural recommendation.
  if (!input.climateZoneCode) {
    return {
      climate_data_status: 'unsupported',
      weather_data_status: 'unavailable',
      has_profile: !!input.terrace,
      items: [],
      warnings: ['当前地区暂无种植数据'],
    };
  }

  const agg = input.weather
    ? aggregateWeather(input.weather)
    : { weather_data_status: 'unavailable' as WeatherDataStatus, threeDayMeanC: null, frostRisk: 'unknown' as const };
  const terrace = input.terrace ?? null;
  const today = mmdd(input.date);

  interface Candidate {
    crop: SeasonalCropRow;
    methods: string[];
    weatherAssessment: WeatherAssessment;
    reasons: string[];
    itemWarnings: string[];
    score: number;
  }
  const candidates: Candidate[] = [];

  for (const crop of input.crops) {
    // AC-24: only crops with at least one hitting window are candidates.
    const methods = resolveAvailableMethods(crop, input.climateZoneCode, input.windows, today);
    if (methods.length === 0) continue;

    const weatherAssessment = assessWeatherForCrop(crop, agg);
    let score = baseScore(crop);
    const reasons: string[] = [];
    const itemWarnings: string[] = [];

    reasons.push(`当前处于${methods.join('/')}窗口`);
    if (agg.weather_data_status !== 'unavailable') {
      if (weatherAssessment === 'temp_out_of_range') itemWarnings.push('近期温度可能超出适宜范围');
      if (weatherAssessment === 'frost_risk') itemWarnings.push('近期有霜冻风险');
      if (agg.weather_data_status === 'partial') itemWarnings.push('近期天气信息不完整');
    }

    // AC-29/AC-12: reuse frozen assessSunlight for terrace enhancement only.
    const sun = sunlightWeight(crop, terrace);
    if (sun.status !== 'MATCH' && sun.status !== 'NEUTRAL') {
      score *= sun.weight;
      if (sun.message) itemWarnings.push(sun.message);
    }

    candidates.push({ crop, methods, weatherAssessment, reasons, itemWarnings, score });
  }

  // AC-10: deterministic ranking. score DESC → difficulty ASC → crop_id ASC.
  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      a.crop.difficulty - b.crop.difficulty ||
      (a.crop.id < b.crop.id ? -1 : 1),
  );

  const items: SeasonalItem[] = candidates.map((c, idx) => ({
    crop_id: c.crop.id,
    crop_name: c.crop.name,
    start_method: c.methods.includes(c.crop.recommendedStartMethod)
      ? c.crop.recommendedStartMethod
      : c.methods[0],
    available_start_methods: c.methods,
    season_status: 'in_window',
    weather_assessment: c.weatherAssessment,
    difficulty: c.crop.difficulty,
    score: Math.round(c.score * 100) / 100,
    rank: idx + 1,
    tags: [],
    warnings: c.itemWarnings,
    reasons: c.reasons,
  }));

  return {
    climate_data_status: 'supported',
    weather_data_status: agg.weather_data_status,
    has_profile: !!terrace,
    items,
    warnings,
  };
}

/**
 * Sunlight enhancement — MUST reuse the frozen Slice 1 assessSunlight().
 * Returns the per-crop sunlight weight and message; 1 with no down-weighting
 * when the terrace is absent (neutral, never a fabricated profile).
 */
export function sunlightWeight(
  crop: SeasonalCropRow,
  terrace: TerraceEnhancement | null | undefined,
): { weight: number; status: string; message: string | null } {
  if (!terrace) {
    return { weight: 1, status: 'NEUTRAL', message: null };
  }
  const r = assessSunlight(
    {
      hoursMin: terrace.sunHoursMin,
      hoursMax: terrace.sunHoursMax,
      confidence: terrace.sunConfidence,
    },
    crop.minSunHours,
  );
  return { weight: r.weight, status: r.status, message: r.message };
}

export { assessSunlight, windowHits, mmdd };
