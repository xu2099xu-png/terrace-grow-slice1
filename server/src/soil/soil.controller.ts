import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { calculateSoilMix } from '../engines/soil-engine';
import { assessWaterRisk } from '../engines/recommend-engine/water-risk';

function draftFilter(): any {
  const allowDraft = process.env.ALLOW_DRAFT_FIXTURES === 'true';
  return allowDraft ? {} : { reviewStatus: 'approved' };
}

@Controller('soil')
@UseGuards(AuthGuard)
export class SoilController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('calculate')
  async calculate(
    @CurrentUser() userId: string,
    @Body() body: { crop_id: string; container_type_id: string; material_ids?: string[] },
  ) {
    const cropId = body.crop_id;
    const container = await this.prisma.containerType.findUnique({
      where: { id: body.container_type_id, ...draftFilter() },
    });
    const modifiers = container
      ? await this.prisma.containerModifier.findMany({ where: { containerTypeId: container.id, ...draftFilter() } })
      : [];
    const template = await this.prisma.soilRecipeTemplate.findFirst({
      where: { cropId, ...draftFilter() },
    });
    const slots = template
      ? await this.prisma.soilRecipeSlot.findMany({ where: { templateId: template.id } })
      : [];
    const materials = await this.prisma.substrateMaterial.findMany({ where: draftFilter() });
    const rules = await this.prisma.materialCropRule.findMany({ where: { cropId, ...draftFilter() } });
    const substitutions = await this.prisma.materialSubstitution.findMany({ where: draftFilter() });
    const inventory = await this.prisma.userMaterialInventory.findMany({ where: { userId } });
    const ownedIds = body.material_ids ?? inventory.map((i) => i.materialId);

    const crop = await this.prisma.crop.findUnique({ where: { id: cropId, ...draftFilter() } });
    const profile = await this.prisma.terraceProfile.findFirst({ where: { userId } });
    const containerReqs = await this.prisma.containerRequirement.findMany({ where: { cropId, ...draftFilter() } });

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
            phManagementNote: crop?.startMethodNote ?? null,
          },
          container?.name,
        )
      : null;

    let waterRisk: any = null;
    if (soilResult && container && profile) {
      const waterRiskConfig = await this.prisma.waterRiskConfig.findMany({ where: draftFilter() });
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
}
