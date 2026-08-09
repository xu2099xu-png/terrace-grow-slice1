import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AppConfigService } from './config/runtime-config';

/**
 * Unified governance filter for agricultural data tables.
 * Only allows draft fixture data when APP_ENV=development AND ALLOW_DRAFT_FIXTURES=true.
 */
@Injectable()
export class GovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /** Check if draft fixtures are allowed in current environment. */
  private allowDraft(): boolean {
    return (
      this.config.value.appEnv === 'development' &&
      this.config.value.allowDraftFixtures
    );
  }

  /** Filter for tables WITH reviewStatus field (crop, variety, material, etc.). */
  reviewStatusFilter(): Record<string, any> {
    return this.allowDraft() ? {} : { reviewStatus: 'approved' };
  }

  /** Filter for WaterRiskConfig (no reviewStatus field — data is config, not content). */
  waterRiskConfigFilter(): Record<string, any> {
    return {}; // WaterRiskConfig is configuration data, not agricultural content
  }

  /** Check if a table has reviewStatus field. */
  hasReviewStatus(tableName: string): boolean {
    const tablesWithReviewStatus = [
      'crop', 'variety', 'attributeDefinition', 'varietyTrait',
      'pollinationProfile', 'pollinationCompatibility', 'environmentRequirement',
      'containerType', 'containerModifier', 'containerRequirement',
      'substrateMaterial', 'materialCropRule', 'materialSubstitution',
      'soilRecipeTemplate', 'lifecycleTemplate', 'lifecycleStage', 'factEvidence',
      'sowingCalendar',
    ];
    return tablesWithReviewStatus.includes(tableName);
  }
}
