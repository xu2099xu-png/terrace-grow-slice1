import { Controller, Get, Post, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { estimateSunlightFromRules } from '../engines/recommend-engine/sunlight';
import { ClimateZone, SunEstimateRule, SunLevelMap } from '@prisma/client';
import { UpsertTerraceDto } from './dto/upsert-terrace.dto';
import { RegionDirectoryService } from '../regions/region-directory.service';
import { AgriRegionResolverService } from '../regions/resolve-agri-region';

function levelFromDirect(sunExposureLevel: string, levelMap: SunLevelMap[]): { hoursMin: number; hoursMax: number; confidence: string } | null {
  const row = levelMap.find((l) => l.level === sunExposureLevel);
  if (!row) return null;
  return { hoursMin: row.hoursMin, hoursMax: row.hoursMax, confidence: 'medium' };
}

function resolveZone(cityCode: string, zones: ClimateZone[]): ClimateZone | null {
  return zones.find((z) => (z.cityCodes as string[]).includes(cityCode)) || null;
}

@Controller('terraces')
@UseGuards(AuthGuard)
export class TerraceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly regions: RegionDirectoryService,
    private readonly agriRegions: AgriRegionResolverService,
  ) {}

  @Post()
  async upsert(
    @CurrentUser() userId: string,
    @Body() body: UpsertTerraceDto,
  ) {
    const levelMap = await this.prisma.sunLevelMap.findMany();
    const rules = await this.prisma.sunEstimateRule.findMany();

    let sunHoursMin = 0, sunHoursMax = 0, sunSource = 'unknown', sunConfidence = 'low';
    let sunExposureLevel = body.sunExposureLevel || 'UNKNOWN';

    if (sunExposureLevel && sunExposureLevel !== 'UNKNOWN') {
      const direct = levelFromDirect(sunExposureLevel, levelMap);
      if (direct) {
        sunHoursMin = direct.hoursMin;
        sunHoursMax = direct.hoursMax;
        sunSource = 'self_reported';
        sunConfidence = direct.confidence;
      }
    } else if (body.sunOrientationRaw || body.sunTimeObsRaw) {
      const est = estimateSunlightFromRules(
        body.sunOrientationRaw || 'unknown',
        body.sunTimeObsRaw || 'unknown',
        rules.map((r) => ({ orientation: r.orientation, timeObs: r.timeObs, level: r.level, hoursMin: r.hoursMin, hoursMax: r.hoursMax, confidence: r.confidence })),
      );
      if (est) {
        sunHoursMin = est.hoursMin;
        sunHoursMax = est.hoursMax;
        sunSource = 'assisted_estimate';
        sunConfidence = est.confidence;
        sunExposureLevel = est.level; // persist assisted estimate level
      }
    } else {
      const fallback = levelMap.find((l) => l.level === 'UNKNOWN')!;
      sunHoursMin = fallback.hoursMin;
      sunHoursMax = fallback.hoursMax;
      sunSource = 'unknown';
      sunConfidence = 'low';
    }

    let cityCode = body.cityCode ?? null;
    let regionAdminCode = body.regionAdminCode ?? null;
    let needsDistrictConfirmation = body.needsDistrictConfirmation ?? false;

    if (regionAdminCode) {
      const district = await this.regions.findEnabledDistrict(regionAdminCode);
      if (!district) {
        throw new BadRequestException('regionAdminCode must be an enabled district admin code');
      }
      const match = await this.agriRegions.resolve(regionAdminCode);
      if (match.status === 'unsupported' || !match.climate_area_code) {
        throw new BadRequestException('regionAdminCode cannot resolve to a supported agricultural district');
      }
      const legacyCityCode = await this.regions.findLegacyCityCodeForDistrict(district.adminCode);
      if (!legacyCityCode) {
        throw new BadRequestException('regionAdminCode cannot resolve to a legacy cityCode');
      }
      cityCode = legacyCityCode;
      needsDistrictConfirmation = false;
    }

    if (!cityCode) {
      throw new BadRequestException('cityCode or confirmed regionAdminCode is required');
    }
    const existing = await this.prisma.terraceProfile.findFirst({ where: { userId } });
    const data = {
      userId,
      name: body.name || '我的露台',
      cityCode,
      regionAdminCode,
      needsDistrictConfirmation,
      sunExposureLevel,
      sunHoursMin,
      sunHoursMax,
      sunSource,
      sunConfidence,
      sunOrientationRaw: body.sunOrientationRaw || null,
      sunTimeObsRaw: body.sunTimeObsRaw || null,
      orientation: body.orientation || null,
      rainExposed: body.rainExposed,
    };

    if (existing) {
      return this.prisma.terraceProfile.update({ where: { id: existing.id }, data });
    }
    return this.prisma.terraceProfile.create({ data });
  }

  @Get('mine')
  async mine(@CurrentUser() userId: string) {
    const profile = await this.prisma.terraceProfile.findFirst({ where: { userId } });
    if (!profile) return null;
    const zones = await this.prisma.climateZone.findMany();
    const zone = resolveZone(profile.cityCode, zones);
    const regionContext = profile.regionAdminCode && !profile.needsDistrictConfirmation
      ? await this.regions.resolveDistrictRegion(profile.regionAdminCode)
      : null;
    const region = regionContext
      ? {
          admin_code: regionContext.admin_code,
          name: regionContext.name,
          province_name: regionContext.province_name,
          city_name: regionContext.city_name,
        }
      : null;
    return { ...profile, climateZone: zone?.name || null, region };
  }
}
