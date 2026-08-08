import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AgriDataService } from '../agri-data.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { buildPerennialPlan, PlanInput } from '../engines/recommend-engine/plan';
import type { ContainerRequirementRow, ContainerTypeRow } from '../engines/recommend-engine/container';
import type { PollinationCompatRow, PollinationProfileInput, VarietyInput } from '../engines/recommend-engine/varieties';
import type { WaterRiskConfigRow } from '../engines/recommend-engine/water-risk';
import type { SoilEngineInput } from '../engines/soil-engine';

@Controller('recommendations')
@UseGuards(AuthGuard)
export class RecommendationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agri: AgriDataService,
  ) {}

  @Post('perennial')
  async perennial(
    @CurrentUser() userId: string,
    @Body() body: {
      crop_id: string;
      selected_container_type_id?: string;
      selected_variety_id?: string;
    },
  ) {
    const cropId = body.crop_id;

    const profile = await this.agri.getTerraceProfile(userId);
    if (!profile) return { error: 'No terrace profile' };

    const zones = await this.prisma.climateZone.findMany();
    const zone = zones.find((z) => (z.cityCodes as string[]).includes(profile.cityCode)) || null;

    const crop = await this.agri.getCrop(cropId);
    if (!crop) return { error: 'Crop not found' };

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

    const waterRiskConfig = await this.prisma.waterRiskConfig.findMany();

    const inventory = await this.agri.getUserMaterialInventory(userId);

    const modifiers = await this.agri.getContainerModifiers(containerTypes.map((t) => t.id));

    // ---- build PlanInput ----
    const varietyInputs: VarietyInput[] = varieties.map((v) => {
      const traits: Record<string, number> = {};
      for (const t of v.traits) {
        if (t.valueNumber != null) traits[t.attribute.key] = t.valueNumber;
      }
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

    const pollinationProfiles: PollinationProfileInput[] = profiles.map((p) => ({
      varietyId: p.varietyId,
      sexType: p.sexType,
      selfFertility: p.selfFertility,
      crossRequired: p.crossRequired,
      bloomGroup: p.bloomGroup,
      notes: p.notes,
    }));

    const pollinationCompat: PollinationCompatRow[] = compat.map((c) => ({
      varietyId: c.varietyId,
      partnerVarietyId: c.partnerVarietyId,
      compatibility: c.compatibility,
    }));

    const containerRequirements: ContainerRequirementRow[] = containerReqs.map((r) => ({
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
    }));

    const containerTypesRows: ContainerTypeRow[] = containerTypes.map((t) => ({
      id: t.id,
      name: t.name,
      drainage: t.drainage,
      aeration: t.aeration,
      waterRetention: t.waterRetention,
    }));

    const modifiersByContainer: Record<string, any[]> = {};
    for (const m of modifiers) {
      if (!modifiersByContainer[m.containerTypeId]) modifiersByContainer[m.containerTypeId] = [];
      modifiersByContainer[m.containerTypeId].push({
        adjustTarget: m.adjustTarget as any,
        delta: m.delta,
        directionHint: m.directionHint as any,
      });
    }

    const soilInput: Omit<SoilEngineInput, 'modifiers'> & { modifiersByContainer: Record<string, any[]> } = {
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
    };

    const waterRiskConfigRows: WaterRiskConfigRow[] = waterRiskConfig.map((r) => ({
      sensitivityBand: r.sensitivityBand,
      containerDrainageBand: r.containerDrainageBand,
      mixDrainageBand: r.mixDrainageBand,
      rainExposed: r.rainExposed,
      riskLevel: r.riskLevel,
      mitigation: (r.mitigation as string[]) || [],
    }));

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
        ? {
            name: zone.name,
            chillHoursEstimate: zone.chillHoursEstimate,
            heatLevel: zone.heatLevel,
          }
        : {
            name: '未知气候区',
            chillHoursEstimate: 0,
            heatLevel: 0,
          },
      varieties: varietyInputs,
      pollinationProfiles,
      pollinationCompat,
      containerRequirements,
      containerTypes: containerTypesRows,
      selectedContainerTypeId: body.selected_container_type_id || null,
      selectedVarietyId: body.selected_variety_id || null,
      soilInput,
      waterRiskConfig: waterRiskConfigRows,
    };

    const planCard = buildPerennialPlan(planInput);
    return planCard;
  }

  /** Get crop-aware pH management note (not from startMethodNote). */
  private getPhManagementNote(crop: any): string | null {
    if (!crop.requiresAcidification) return null;
    // Use acidityNeed to generate appropriate pH management note
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
