/**
 * recommend-engine / perennial plan pipeline (v1.3 §5.2 Steps 1-7, v1.4 §4.2).
 * Pure orchestration: data bundles in, structured plan card JSON out. No AI anywhere.
 */
import { calculateSoilMix, SoilEngineInput, SoilResult } from '../soil-engine';
import { ContainerRecommendation, ContainerRequirementRow, ContainerTypeRow, recommendContainer } from './container';
import { assessSunlight, SunlightAssessment } from './sunlight';
import {
  ClimateZoneInput,
  PollinationCompatRow,
  PollinationProfileInput,
  PollinationResult,
  rankVarieties,
  RankedVariety,
  resolvePollination,
  VarietyInput,
} from './varieties';
import { assessWaterRisk, WaterRiskConfigRow, WaterRiskResult } from './water-risk';

export interface PlanInput {
  crop: {
    id: string;
    name: string;
    waterloggingSensitivity: number;
    requiresAcidification: boolean;
    startMethodNote: string | null;
    recommendedStartMethod: string;
  };
  environmentRequirement: { minSunHours: number } | null;
  terrace: {
    sunHoursMin: number;
    sunHoursMax: number;
    sunConfidence: string;
    rainExposed: boolean;
  };
  climateZone: ClimateZoneInput & { name: string };
  varieties: VarietyInput[];
  pollinationProfiles: PollinationProfileInput[];
  pollinationCompat: PollinationCompatRow[];
  containerRequirements: ContainerRequirementRow[];
  containerTypes: ContainerTypeRow[];
  selectedContainerTypeId?: string | null;
  selectedVarietyId?: string | null;
  soilInput: Omit<SoilEngineInput, 'modifiers'> & { modifiersByContainer: Record<string, any[]> };
  waterRiskConfig: WaterRiskConfigRow[];
}

export interface PlanCard {
  suitability: 'suitable' | 'borderline' | 'likely_unsuitable' | 'unsuitable';
  sunlight_status: SunlightAssessment & { hours_range: [number, number]; confidence: string };
  recommended_varieties: RankedVariety[];
  selected_variety_id: string | null;
  pollination: PollinationResult;
  container: (ContainerRecommendation & { selected_type_id: string | null }) | null;
  soil_mix: SoilResult | null;
  missing_materials: SoilResult['missing'];
  water_risk: WaterRiskResult | null;
  warnings: string[];
  next_action: string;
  reasons: string[];
}

export function buildPerennialPlan(input: PlanInput): PlanCard {
  const warnings: string[] = [];
  const reasons: string[] = [];

  // ---- Step 1-2: sunlight four-state judgment (no averaging!) ----
  const minSun = input.environmentRequirement?.minSunHours ?? 6;
  const sunlight = assessSunlight(
    {
      hoursMin: input.terrace.sunHoursMin,
      hoursMax: input.terrace.sunHoursMax,
      confidence: input.terrace.sunConfidence,
    },
    minSun,
  );
  const suitability: PlanCard['suitability'] =
    sunlight.status === 'MATCH'
      ? 'suitable'
      : sunlight.status === 'BORDERLINE'
        ? 'borderline'
        : sunlight.status === 'LIKELY_NO_MATCH'
          ? 'likely_unsuitable'
          : 'unsuitable';
  if (sunlight.message) warnings.push(sunlight.message);
  if (sunlight.status === 'LIKELY_NO_MATCH') {
    warnings.push('这是根据粗略信息推测的，观察清楚后可随时修改档案');
  }

  // ---- Step 3: variety ranking ----
  const ranked = rankVarieties(input.varieties, input.climateZone, sunlight);
  const selectedVarietyId =
    input.selectedVarietyId && ranked.some((v) => v.varietyId === input.selectedVarietyId)
      ? input.selectedVarietyId
      : (ranked[0]?.varietyId ?? null);

  // ---- pollination (structured, from data) ----
  const profile = input.pollinationProfiles.find((p) => p.varietyId === selectedVarietyId) ?? null;
  const pollination = resolvePollination(
    profile,
    input.pollinationCompat,
    input.varieties.map((v) => ({
      id: v.id,
      name: v.name,
      bloomGroup: input.pollinationProfiles.find((p) => p.varietyId === v.id)?.bloomGroup ?? null,
      sexType: input.pollinationProfiles.find((p) => p.varietyId === v.id)?.sexType ?? null,
    })),
  );
  if (pollination.need_two) warnings.push(pollination.note ?? '需要搭配授粉品种');

  // ---- Step 4: container from ContainerRequirement rows ----
  const container = recommendContainer(input.containerRequirements, input.containerTypes, selectedVarietyId);
  let selectedContainer: ContainerTypeRow | null = null;
  if (container) {
    const requested = input.selectedContainerTypeId
      ? input.containerTypes.find((t) => t.id === input.selectedContainerTypeId)
      : null;
    const inAvoid = requested && container.avoidTypes.some((t) => t.id === requested.id);
    selectedContainer =
      requested && !inAvoid
        ? requested
        : (container.preferredTypes[0] ?? container.acceptableTypes[0] ?? null);
    if (requested && inAvoid) {
      warnings.push(`${requested.name}排水/透气不达标，已改用更合适的容器`);
    }
  }

  // ---- Step 6: soil solve (before water risk iteration) ----
  let soil: SoilResult | null = null;
  let waterRisk: WaterRiskResult | null = null;
  if (container && selectedContainer) {
    const volumeL = Math.round(((container.volumeRange[0] + container.volumeRange[1]) / 2) * 10) / 10;
    const modifiers = input.soilInput.modifiersByContainer[selectedContainer.id] ?? [];
    soil = calculateSoilMix({ ...input.soilInput, modifiers, volumeL }, selectedContainer.name);
    reasons.push(...soil.reasons);

    // ---- Step 5: water risk; on high, re-solve once with raised drainage target ----
    waterRisk = assessWaterRisk(
      input.crop.waterloggingSensitivity,
      selectedContainer.drainage,
      soil.drainage_score,
      input.terrace.rainExposed,
      input.waterRiskConfig,
    );
    if (waterRisk.level === 'high' && soil.feasibility !== 'unavailable') {
      const raised = {
        ...input.soilInput,
        modifiers,
        volumeL,
        targets: {
          ...input.soilInput.targets,
          drainage: [
            Math.min(5, input.soilInput.targets.drainage[0] + 0.5),
            Math.min(5, input.soilInput.targets.drainage[1] + 0.5),
          ] as [number, number],
        },
      };
      const resolved = calculateSoilMix(raised, selectedContainer.name);
      if (resolved.feasibility !== 'unavailable') {
        soil = resolved;
        reasons.push('积水风险偏高，已提高排水材料比例重新计算');
        waterRisk = assessWaterRisk(
          input.crop.waterloggingSensitivity,
          selectedContainer.drainage,
          soil.drainage_score,
          input.terrace.rainExposed,
          input.waterRiskConfig,
        );
      }
    }
    if (waterRisk.level === 'high') {
      warnings.push('积水风险高，务必按建议调整');
    }
  }

  // ---- Step 7: structured output ----
  const topVariety = ranked[0];
  if (topVariety) reasons.push(...topVariety.reasons);

  const nextAction =
    suitability === 'unsuitable'
      ? '这个位置日照确实不够，建议先看看更耐阴的植物'
      : soil && soil.missing.length > 0
        ? `按缺料清单备齐 ${soil.missing.map((m) => m.material).join('、')} 后，即可买苗上盆`
        : '材料已齐，按配方配土后即可买苗上盆';

  return {
    suitability,
    sunlight_status: {
      ...sunlight,
      hours_range: [input.terrace.sunHoursMin, input.terrace.sunHoursMax],
      confidence: input.terrace.sunConfidence,
    },
    recommended_varieties: ranked,
    selected_variety_id: selectedVarietyId,
    pollination,
    container: container ? { ...container, selected_type_id: selectedContainer?.id ?? null } : null,
    soil_mix: soil,
    missing_materials: soil?.missing ?? [],
    water_risk: waterRisk,
    warnings,
    next_action: nextAction,
    reasons,
  };
}
