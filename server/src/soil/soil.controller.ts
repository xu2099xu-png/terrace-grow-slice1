import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { GovernanceService } from '../governance.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { calculateSoilMix } from '../engines/soil-engine';
import { assessWaterRisk } from '../engines/recommend-engine/water-risk';

@Controller('soil')
@UseGuards(AuthGuard)
export class SoilController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly governance: GovernanceService,
  ) {}

  @Post('calculate')
  async calculate(
    @CurrentUser() userId: string,
    @Body() body: { crop_id: string; container_type_id: string; material_ids?: string[] },
  ) {
    const cropId = body.crop_id;
    const reviewFilter = this.governance.reviewStatusFilter();

    const container = await this.prisma.containerType.findUnique({
      where: { id: body.container_type_id, ...reviewFilter },
    });
    const modifiers = container
      ? await this.prisma.containerModifier.findMany({ where: { containerTypeId: container.id, ...reviewFilter } })
      : [];
    const template = await this.prisma.soilRecipeTemplate.findFirst({
      where: { cropId, isFallback: false, ...reviewFilter },
    });
    const fallbackTemplate = await this.prisma.soilRecipeTemplate.findFirst({
      where: { cropId, isFallback: true, ...reviewFilter },
    });
    const slots = template
      ? await this.prisma.soilRecipeSlot.findMany({ where: { templateId: template.id } })
      : [];
    const fallbackSlots = fallbackTemplate
      ? await this.prisma.soilRecipeSlot.findMany({ where: { templateId: fallbackTemplate.id } })
      : [];
    const materials = await this.prisma.substrateMaterial.findMany({ where: reviewFilter });
    const rules = await this.prisma.materialCropRule.findMany({ where: { cropId, ...reviewFilter } });
    const substitutions = await this.prisma.materialSubstitution.findMany({ where: reviewFilter });
    const inventory = await this.prisma.userMaterialInventory.findMany({ where: { userId } });
    const ownedIds = body.material_ids ?? inventory.map((i) => i.materialId);

    const crop = await this.prisma.crop.findUnique({ where: { id: cropId, ...reviewFilter } });
    const profile = await this.prisma.terraceProfile.findFirst({ where: { userId } });
    const containerReqs = await this.prisma.containerRequirement.findMany({ where: { cropId, ...reviewFilter } });

    // volume from container requirement range (midpoint), fallback to template baseVolumeL
    let volumeL = template?.baseVolumeL ?? 30;
    if (containerReqs.length > 0) {
      const preferredMin = Math.max(...containerReqs.map((r) => r.preferredVolumeMinL));
      const preferredMax = Math.min(...containerReqs.map((r) => r.preferredVolumeMaxL));
      volumeL = Math.round(((preferredMin + Math.max(preferredMin, preferredMax)) / 2) * 10) / 10;
    }

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
          container?.name,
        )
      : null;

    let waterRisk: any = null;
    if (soilResult && container && profile) {
      const waterRiskConfig = await this.prisma.waterRiskConfig.findMany();
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
