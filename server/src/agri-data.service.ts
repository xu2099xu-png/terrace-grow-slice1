import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { GovernanceService } from './governance.service';

/**
 * Single governed data-access layer for agricultural facts.
 *
 * Every query that can feed the recommendation engine or a public API goes
 * through this service so that the governance gate (`reviewStatus = approved`,
 * or draft only under APP_ENV=development && ALLOW_DRAFT_FIXTURES=true) is
 * applied uniformly — including nested relations (traits, attributes,
 * environment requirements, crop rules, container requirements, substitutions).
 *
 * Models WITHOUT a reviewStatus field (user data, config tables such as
 * SunLevelMap / WaterRiskConfig / SoilRecipeSlot, etc.) are intentionally not
 * wrapped in a governance filter.
 */
@Injectable()
export class AgriDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly governance: GovernanceService,
  ) {}

  /** @internal review-status predicate for tables that carry the field. */
  private get review() {
    return this.governance.reviewStatusFilter();
  }

  // ---------- catalog ----------

  async listCrops(lifeType?: string) {
    return this.prisma.crop.findMany({
      where: { ...(lifeType ? { lifeType } : {}), ...this.review },
      include: { environmentRequirement: { where: this.review } },
    });
  }

  async getCrop(cropId: string) {
    return this.prisma.crop.findUnique({
      where: { id: cropId, ...this.review },
    });
  }

  async getCropEnvironmentRequirement(cropId: string) {
    return this.prisma.environmentRequirement.findFirst({
      where: { ownerId: cropId, ownerType: 'crop', ...this.review },
    });
  }

  async listVarieties(cropId: string) {
    const [varieties, approvedAttributes] = await Promise.all([
      this.prisma.variety.findMany({
        where: { cropId, ...this.review },
        include: { traits: { where: this.review, include: { attribute: true } } },
      }),
      this.prisma.attributeDefinition.findMany({ where: this.review }),
    ]);
    // 1-1 relation `attribute` cannot carry a Prisma `where`; filter in memory
    // so a draft attribute never leaks through an approved parent.
    const approvedAttrIds = new Set(approvedAttributes.map((a) => a.id));
    return varieties.map((v) => ({
      ...v,
      traits: v.traits.filter((t) => approvedAttrIds.has(t.attributeId)),
    }));
  }

  // ---------- recommendation pipeline ----------

  async getPollinationProfiles(varietyIds: string[]) {
    if (varietyIds.length === 0) return [];
    return this.prisma.pollinationProfile.findMany({
      where: { varietyId: { in: varietyIds }, ...this.review },
    });
  }

  async getPollinationCompatibilities(varietyIds: string[]) {
    if (varietyIds.length === 0) return [];
    return this.prisma.pollinationCompatibility.findMany({
      where: { varietyId: { in: varietyIds }, ...this.review },
    });
  }

  async getContainerRequirements(cropId: string) {
    return this.prisma.containerRequirement.findMany({
      where: { cropId, ...this.review },
    });
  }

  async listContainerTypes() {
    return this.prisma.containerType.findMany({ where: this.review });
  }

  async getContainerType(id: string) {
    return this.prisma.containerType.findUnique({
      where: { id, ...this.review },
    });
  }

  async getContainerModifiers(containerTypeIds: string[]) {
    if (containerTypeIds.length === 0) return [];
    return this.prisma.containerModifier.findMany({
      where: { containerTypeId: { in: containerTypeIds }, ...this.review },
    });
  }

  async listMaterials() {
    return this.prisma.substrateMaterial.findMany({ where: this.review });
  }

  /**
   * Materials + their crop rules. `cropId` is an explicit input when the
   * caller wants rules scoped to one crop (e.g. the H5 plan page); when
   * omitted, all approved rules are returned with their cropId preserved.
   */
  async listMaterialsWithRules(cropId?: string) {
    const ruleWhere = cropId
      ? { cropId, ...this.review }
      : { ...this.review };
    return this.prisma.substrateMaterial.findMany({
      where: this.review,
      include: { cropRules: { where: ruleWhere } },
    });
  }

  async getMaterialCropRules(cropId: string) {
    return this.prisma.materialCropRule.findMany({
      where: { cropId, ...this.review },
    });
  }

  async listMaterialSubstitutions() {
    return this.prisma.materialSubstitution.findMany({ where: this.review });
  }

  async getSoilRecipeTemplate(cropId: string, isFallback: boolean) {
    return this.prisma.soilRecipeTemplate.findFirst({
      where: { cropId, isFallback, ...this.review },
    });
  }

  /** SoilRecipeSlot has NO reviewStatus field — never governance-filtered. */
  async getSoilRecipeSlots(templateId: string) {
    return this.prisma.soilRecipeSlot.findMany({ where: { templateId } });
  }

  /** WaterRiskConfig is configuration data (no reviewStatus field). */
  async listWaterRiskConfig() {
    return this.prisma.waterRiskConfig.findMany();
  }

  // ---------- lifecycle (Slice 2) ----------

  /**
   * Select the governed lifecycle template for a crop+variety+startMethod.
   * Priority: variety-level > crop-level; highest active version wins.
   */
  async getLifecycleTemplate(cropId: string, varietyId: string | null, startMethod: string) {
    if (varietyId) {
      const v = await this.prisma.lifecycleTemplate.findFirst({
        where: { cropId, varietyId, startMethod, active: true, ...this.review },
        orderBy: { version: 'desc' },
        include: { stages: { where: this.review, orderBy: { order: 'asc' } } },
      });
      if (v && v.stages.length > 0) return v;
    }
    return this.prisma.lifecycleTemplate.findFirst({
      where: { cropId, varietyId: null, startMethod, active: true, ...this.review },
      orderBy: { version: 'desc' },
      include: { stages: { where: this.review, orderBy: { order: 'asc' } } },
    });
  }

  /**
   * Get the template pinned by a planting (by template id + version).
   * Governance applies: a template that later loses approval must not serve.
   */
  async getLifecycleTemplateByIdAndVersion(templateId: string, version: number) {
    return this.prisma.lifecycleTemplate.findFirst({
      where: { id: templateId, version, ...this.review },
      include: { stages: { where: this.review, orderBy: { order: 'asc' } } },
    });
  }

  // ---------- user-owned data (no governance field) ----------

  async getUserMaterialInventory(userId: string) {
    const rows = await this.prisma.userMaterialInventory.findMany({
      where: { userId },
      include: { material: true },
    });
    // Read-side governance gate: an inventory entry backed by a draft material
    // must never surface (e.g. its name leaking via /materials/mine).
    const approvedIds = new Set(
      (
        await this.prisma.substrateMaterial.findMany({
          where: this.review,
          select: { id: true },
        })
      ).map((m) => m.id),
    );
    return rows.filter((r) => approvedIds.has(r.materialId));
  }

  async setUserMaterialInventory(userId: string, materialIds: string[]) {
    await this.prisma.userMaterialInventory.deleteMany({ where: { userId } });
    if (!materialIds || materialIds.length === 0) return { ok: true };
    // Write-side governance gate: only governed materials may enter the
    // inventory; draft material ids are dropped, never persisted.
    const allowed = await this.prisma.substrateMaterial.findMany({
      where: { id: { in: materialIds }, ...this.review },
      select: { id: true },
    });
    if (allowed.length === 0) return { ok: true };
    await this.prisma.userMaterialInventory.createMany({
      data: allowed.map((m) => ({ userId, materialId: m.id, level: 'enough' })),
      skipDuplicates: true,
    });
    return { ok: true };
  }

  async getTerraceProfile(userId: string) {
    return this.prisma.terraceProfile.findFirst({ where: { userId } });
  }

  // ---------- seasonal (Slice 3) ----------

  /** city_code → ClimateZone via structured cityCodes JSON array (AC-08). */
  async getClimateZoneByCity(cityCode: string) {
    return this.prisma.climateZone.findFirst({
      where: { cityCodes: { array_contains: cityCode } },
    });
  }

  /** Supported cities derived from climate mapping (AC-30). */
  async listSupportedCities(): Promise<{ city_code: string; city_name: string }[]> {
    const zones = await this.prisma.climateZone.findMany({ select: { cityCodes: true } });
    const { CITY_METADATA } = await import('./location/city-metadata');
    const out: { city_code: string; city_name: string }[] = [];
    const seen = new Set<string>();
    for (const z of zones) {
      for (const code of (z.cityCodes as unknown as string[]) || []) {
        if (!seen.has(code)) {
          seen.add(code);
          out.push({ city_code: code, city_name: CITY_METADATA[code]?.name ?? code });
        }
      }
    }
    return out.sort((a, b) => a.city_code.localeCompare(b.city_code));
  }

  /** Governed seasonal crops (Slice 3 catalog rows). */
  async listSeasonalCrops() {
    return this.prisma.crop.findMany({
      where: { lifeType: 'seasonal', ...this.review },
    });
  }

  /** Governed sowing calendars for a zone + optional crop/method set. */
  async listSowingCalendars(climateZoneCode: string, cropIds?: string[], startMethod?: string) {
    return this.prisma.sowingCalendar.findMany({
      where: {
        climateZoneCode,
        ...(cropIds && cropIds.length ? { cropId: { in: cropIds } } : {}),
        ...(startMethod ? { startMethod } : {}),
        ...this.review,
      },
    });
  }

  /** Crop detail for the unified catalog (AC-15). */
  async getCropDetail(cropId: string, climateZoneCode?: string) {
    return this.prisma.crop.findUnique({
      where: { id: cropId, ...this.review },
      include: {
        environmentRequirement: { where: this.review },
        // closure-6: when a climate zone is given, only return that zone's
        // sowing windows (the detail page is scoped to the user's region).
        sowingCalendars: {
          where: { ...(climateZoneCode ? { climateZoneCode } : {}), ...this.review },
        },
      },
    });
  }
}
