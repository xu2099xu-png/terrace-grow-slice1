import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { assessSunlight, estimateSunlightFromRules } from '../engines/recommend-engine/sunlight';
import { ClimateZone, SunEstimateRule, SunLevelMap } from '@prisma/client';

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
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async upsert(
    @CurrentUser() userId: string,
    @Body() body: {
      name?: string;
      cityCode: string;
      sunExposureLevel?: string;
      sunOrientationRaw?: string;
      sunTimeObsRaw?: string;
      orientation?: string;
      rainExposed?: boolean;
    },
  ) {
    const levelMap = await this.prisma.sunLevelMap.findMany();
    const rules = await this.prisma.sunEstimateRule.findMany();
    const zones = await this.prisma.climateZone.findMany();

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

    const zone = resolveZone(body.cityCode, zones);
    const existing = await this.prisma.terraceProfile.findFirst({ where: { userId } });
    const data = {
      userId,
      name: body.name || '我的露台',
      cityCode: body.cityCode,
      sunExposureLevel,
      sunHoursMin,
      sunHoursMax,
      sunSource,
      sunConfidence,
      sunOrientationRaw: body.sunOrientationRaw || null,
      sunTimeObsRaw: body.sunTimeObsRaw || null,
      orientation: body.orientation || null,
      rainExposed: body.rainExposed ?? false,
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
    return { ...profile, climateZone: zone?.name || null };
  }
}
