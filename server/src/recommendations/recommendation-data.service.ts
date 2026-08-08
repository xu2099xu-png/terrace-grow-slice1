import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AgriDataService } from '../agri-data.service';
import { buildPerennialPlan, PlanInput, PlanCard } from '../engines/recommend-engine/plan';

/**
 * Shared recommendation assembly. Single implementation used by both
 * RecommendationController and PlantingsService — no duplicated PlanInput
 * wiring (audit: double-implementation is banned).
 */
@Injectable()
export class RecommendationDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agri: AgriDataService,
  ) {}

  async build(
    userId: string,
    cropId: string,
    opts: { selected_container_type_id?: string | null; selected_variety_id?: string | null } = {},
  ): Promise<PlanCard | null> {
    const profile = await this.agri.getTerraceProfile(userId);
    if (!profile) return null;

    const zones = await this.prisma.climateZone.findMany();
    const zone = zones.find((z) => (z.cityCodes as string[]).includes(profile.cityCode)) || null;

    const crop = await this.agri.getCrop(cropId);
    if (!crop) return null;

    const envReq = await this.agri.getCropEnvironmentRequirement(cropId);
    const varieties = await this.agri.listVarieties(cropId);
    const profiles = await this.agri.getPollinationProfiles(varieties.map((v) => v.id));
    const compat = await this.agri.getPollinationCompatibilities(varieties.map((v) => v.id));
    const containerReqs = await this.agri.getContainerRequirements(cropId);
    const containerTypes = await this.agri.listContainerTypes();
    const materials = await this.agri.listMaterials();
    const rules = await this.agri.getMaterialCropRules(cropId);
    const substitutions = await this.agri.listMaterialSubstitutions();
    const template = await this.agri.getSoilRecipeTemplate(cropId, false);
    const fallbackTemplate = await this.agri.getSoilRecipeTemplate(cropId, true);
    const slots = template ? await this.agri.getSoilRecipeSlots(template.id) : [];
    const fallbackSlots = fallbackTemplate ? await this.agri.getSoilRecipeSlots(fallbackTemplate.id) : [];
    const waterRiskConfig = await this.agri.listWaterRiskConfig();
    const inventory = await this.agri.getUserMaterialInventory(userId);
    const modifiers = await this.agri.getContainerModifiers(containerTypes.map((t) => t.id));

    const varietyInputs = varieties.map((v) => {
      const traits: Record<string, number> = {};
      for (const t of v.traits) if (t.valueNumber != null) traits[t.attribute.key] = t.valueNumber;
      return {
        id: v.id,
        name: v.name,
        maturePeriod: v.maturePeriod,
        plantHabit: v.plantHabit,
        containerFit: v.containerFit,
        traits: {
          chill_hours_min: traits['chill_hours_min'],
          heat_tolerance: traits['heat_tolerance'],
          shade_tolerance: traits['shade_tolerance'],
        },
      };
    });

    const modifiersByContainer: Record<string, any[]> = {};
    for (const m of modifiers) {
      if (!modifiersByContainer[m.containerTypeId]) modifiersByContainer[m.containerTypeId] = [];
      modifiersByContainer[m.containerTypeId].push({
        adjustTarget: m.adjustTarget,
        delta: m.delta,
        directionHint: m.directionHint,
      });
    }

    const planInput: PlanInput = {
      crop: {
        id: crop.id,
        name: crop.name,
        waterloggingSensitivity: crop.waterloggingSensitivity,
        requiresAcidification: crop.requiresAcidification,
        startMethodNote: crop.startMethodNote,
        recommendedStartMethod: crop.recommendedStartMethod,
      },
      environmentRequirement: envReq ? { minSunHours: envReq.minSunHours } : null,
      terrace: {
        sunHoursMin: profile.sunHoursMin,
        sunHoursMax: profile.sunHoursMax,
        sunConfidence: profile.sunConfidence,
        rainExposed: profile.rainExposed,
      },
      climateZone: zone
        ? { name: zone.name, chillHoursEstimate: zone.chillHoursEstimate, heatLevel: zone.heatLevel }
        : { name: '未知气候区', chillHoursEstimate: 0, heatLevel: 0 },
      varieties: varietyInputs,
      pollinationProfiles: profiles.map((p) => ({
        varietyId: p.varietyId,
        sexType: p.sexType,
        selfFertility: p.selfFertility,
        crossRequired: p.crossRequired,
        bloomGroup: p.bloomGroup,
        notes: p.notes,
      })),
      pollinationCompat: compat.map((c) => ({
        varietyId: c.varietyId,
        partnerVarietyId: c.partnerVarietyId,
        compatibility: c.compatibility,
      })),
      containerRequirements: containerReqs.map((r) => ({
        id: r.id,
        cropId: r.cropId,
        varietyId: r.varietyId,
        minVolumeL: r.minVolumeL,
        preferredVolumeMinL: r.preferredVolumeMinL,
        preferredVolumeMaxL: r.preferredVolumeMaxL,
        minDepthCm: r.minDepthCm,
        minWidthCm: r.minWidthCm,
        minDrainageLevel: r.minDrainageLevel,
        minAerationLevel: r.minAerationLevel,
        preferredContainerTypeIds: (r.preferredContainerTypeIds as string[]) || [],
        avoidContainerTypeIds: (r.avoidContainerTypeIds as string[]) || [],
        supportRequired: r.supportRequired,
        repotYears: r.repotYears,
        reason: r.reason,
      })),
      containerTypes: containerTypes.map((t) => ({
        id: t.id,
        name: t.name,
        drainage: t.drainage,
        aeration: t.aeration,
        waterRetention: t.waterRetention,
      })),
      selectedContainerTypeId: opts.selected_container_type_id ?? null,
      selectedVarietyId: opts.selected_variety_id ?? null,
      // soilInput fields carry DB string enums; engine types are narrow unions.
      // Original RecommendationController used `as any`; keep the same tolerance.
      soilInput: {
        slots: slots.map((s) => ({
          functionGroup: s.functionGroup as any,
          minPct: s.minPct,
          maxPct: s.maxPct,
          preferredMaterials: (s.preferredMaterials as string[]) || [],
          required: s.required,
        })),
        materials: materials.map((m) => ({
          id: m.id,
          name: m.name,
          functionGroup: m.functionGroup as any,
          drainage: m.drainage,
          aeration: m.aeration,
          waterRetention: m.waterRetention,
          acidifying: m.acidifying,
          costLevel: m.costLevel,
        })),
        ownedMaterialIds: inventory.map((i) => i.materialId),
        cropRules: Object.fromEntries(rules.map((r) => [r.materialId, r.level as any])),
        ruleReasons: Object.fromEntries(rules.filter((r) => r.reason).map((r) => [r.materialId, r.reason!])),
        substitutions: substitutions.map((s) => ({
          fromId: s.materialFromId,
          toId: s.materialToId,
          scope: s.scope as any,
          compatibility: s.compatibility,
          penalty: s.penalty,
          conditions: s.conditions,
        })),
        modifiersByContainer,
        targets: (template?.targetProperties as any) || { drainage: [3, 4.2], aeration: [2.8, 4], retention: [2.2, 3.2] },
        volumeL: template?.baseVolumeL ?? 30,
        requiresAcidification: crop.requiresAcidification,
        phManagementNote: this.getPhManagementNote(crop),
        forbiddenPairs: [],
        fallbackTemplate: fallbackTemplate && fallbackSlots.length > 0
          ? {
              slots: fallbackSlots.map((s) => ({
                functionGroup: s.functionGroup as any,
                minPct: s.minPct,
                maxPct: s.maxPct,
                preferredMaterials: (s.preferredMaterials as string[]) || [],
                required: s.required,
              })),
              targets: (fallbackTemplate.targetProperties as any) || { drainage: [2.5, 4.5], aeration: [2.5, 4.5], retention: [2.0, 3.5] },
            }
          : undefined,
      } as any,
      waterRiskConfig: waterRiskConfig.map((r) => ({
        sensitivityBand: r.sensitivityBand,
        containerDrainageBand: r.containerDrainageBand,
        mixDrainageBand: r.mixDrainageBand,
        rainExposed: r.rainExposed,
        riskLevel: r.riskLevel,
        mitigation: (r.mitigation as string[]) || [],
      })),
    };

    return buildPerennialPlan(planInput);
  }

  private getPhManagementNote(crop: any): string | null {
    if (!crop.requiresAcidification) return null;
    switch (crop.acidityNeed) {
      case 'acid_required':
        return '该作物喜酸性土壤，建议定期检测 pH 并适时调酸';
      case 'slightly_acid':
        return '该作物偏好微酸性土壤，注意避免土壤碱化';
      default:
        return null;
    }
  }
}
