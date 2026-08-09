import { BadRequestException, Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AgriDataService } from '../agri-data.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { calculateSoilMix } from '../engines/soil-engine';
import { assessWaterRisk } from '../engines/recommend-engine/water-risk';
import { recommendContainer } from '../engines/recommend-engine/container';
import type { ContainerRequirementRow, ContainerTypeRow } from '../engines/recommend-engine/container';
import { CalculateSoilDto } from './dto/calculate-soil.dto';

@Controller('soil')
@UseGuards(AuthGuard)
export class SoilController {
  constructor(private readonly agri: AgriDataService) {}

  @Post('calculate')
  async calculate(
    @CurrentUser() userId: string,
    @Body() body: CalculateSoilDto,
  ) {
    const { crop_id: cropId, container_type_id: containerTypeId } = body;
    const selectedVarietyId = body.selected_variety_id || null;

    const container = await this.agri.getContainerType(containerTypeId);
    if (!container) throw new BadRequestException('Container not found');

    const modifiers = await this.agri.getContainerModifiers([container.id]);
    const template = await this.agri.getSoilRecipeTemplate(cropId, false);
    const fallbackTemplate = await this.agri.getSoilRecipeTemplate(cropId, true);
    const slots = template ? await this.agri.getSoilRecipeSlots(template.id) : [];
    const fallbackSlots = fallbackTemplate ? await this.agri.getSoilRecipeSlots(fallbackTemplate.id) : [];
    const materials = await this.agri.listMaterials();
    const rules = await this.agri.getMaterialCropRules(cropId);
    const substitutions = await this.agri.listMaterialSubstitutions();
    const inventory = await this.agri.getUserMaterialInventory(userId);
    const ownedIds = body.material_ids ?? inventory.map((i) => i.materialId);

    const crop = await this.agri.getCrop(cropId);
    const profile = await this.agri.getTerraceProfile(userId);
    const containerReqs = await this.agri.getContainerRequirements(cropId);
    const containerTypes = await this.agri.listContainerTypes();

    // Same container-selection rule as the main plan (variety-level override
    // wins over crop-level; single volume basis across first plan and recalcs).
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
    const containerRec = recommendContainer(containerRequirements, containerTypesRows, selectedVarietyId);

    // volume from the same recommendContainer source as buildPerennialPlan
    const volumeL = containerRec
      ? Math.round(((containerRec.volumeRange[0] + containerRec.volumeRange[1]) / 2) * 10) / 10
      : template?.baseVolumeL ?? 30;

    const soilResult = template
      ? calculateSoilMix(
          {
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
            ownedMaterialIds: ownedIds,
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
            modifiers: modifiers.map((m) => ({
              adjustTarget: m.adjustTarget as any,
              delta: m.delta,
              directionHint: m.directionHint as any,
            })),
            targets: (template.targetProperties as any) || { drainage: [3, 4.2], aeration: [2.8, 4], retention: [2.2, 3.2] },
            volumeL,
            requiresAcidification: crop?.requiresAcidification || false,
            phManagementNote: this.getPhManagementNote(crop),
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
          },
          container.name,
        )
      : null;

    let waterRisk: any = null;
    if (soilResult && container && profile) {
      const waterRiskConfig = await this.prismaWaterRiskConfig();
      waterRisk = assessWaterRisk(
        crop?.waterloggingSensitivity || 3,
        container.drainage,
        soilResult.drainage_score,
        profile.rainExposed,
        waterRiskConfig.map((r) => ({
          sensitivityBand: r.sensitivityBand,
          containerDrainageBand: r.containerDrainageBand,
          mixDrainageBand: r.mixDrainageBand,
          rainExposed: r.rainExposed,
          riskLevel: r.riskLevel,
          mitigation: (r.mitigation as string[]) || [],
        })),
      );
    }

    return { soil: soilResult, water_risk: waterRisk };
  }

  /** WaterRiskConfig has no reviewStatus — read via raw prisma through AgriDataService helper. */
  private async prismaWaterRiskConfig() {
    return this.agri.listWaterRiskConfig();
  }

  /** Get crop-aware pH management note (not from startMethodNote). */
  private getPhManagementNote(crop: any): string | null {
    if (!crop?.requiresAcidification) return null;
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
