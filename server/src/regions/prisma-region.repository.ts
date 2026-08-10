import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  ClimateAnchor,
  PopularCityRow,
  RegionCatalogRow,
  RegionClimateDirectMapping,
  RegionLevel,
} from './region.types';
import { RegionRepository } from './region.repository';

function mapRegion(row: any): RegionCatalogRow {
  return {
    adminCode: row.adminCode,
    name: row.name,
    level: row.level,
    parentAdminCode: row.parentAdminCode ?? null,
    isMunicipality: row.isMunicipality,
    enabled: row.enabled,
    catalogOrder: row.catalogOrder,
    dataVersion: row.dataVersion,
    source: row.source,
    centroidLng: row.centroidLng,
    centroidLat: row.centroidLat,
  };
}

function mapPopular(row: any): PopularCityRow {
  return {
    legacyCityCode: row.legacyCityCode,
    displayAreaCode: row.displayAreaCode,
    displayName: row.displayName,
    kind: row.kind,
    provinceAdminCode: row.provinceAdminCode,
    provinceName: row.provinceName,
    cityAdminCode: row.cityAdminCode ?? null,
    cityName: row.cityName ?? null,
    catalogOrder: row.catalogOrder,
    enabled: row.enabled,
  };
}

function mapDirect(row: any): RegionClimateDirectMapping {
  return {
    adminCode: row.adminCode,
    climateZoneCode: row.climateZoneCode,
    source: row.source,
    reviewStatus: row.reviewStatus,
    confidence: row.confidence,
    version: row.version,
  };
}

function mapAnchor(row: any): ClimateAnchor {
  return {
    adminCode: row.adminCode,
    climateZoneCode: row.climateZoneCode,
    centroidLng: row.centroidLng,
    centroidLat: row.centroidLat,
    enabled: row.enabled,
    source: row.source,
    reviewStatus: row.reviewStatus,
    confidence: row.confidence,
    version: row.version,
  };
}

@Injectable()
export class PrismaRegionRepository implements RegionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get directMappingDelegate(): any | null {
    return (this.prisma as any).regionClimateMapping ?? null;
  }

  private get anchorDelegate(): any | null {
    return (this.prisma as any).climateAnchor ?? null;
  }

  async listRegions(params: {
    level: RegionLevel;
    parentAdminCode: string | null;
  }): Promise<RegionCatalogRow[]> {
    const rows = await this.prisma.region.findMany({
      where: {
        enabled: true,
        level: params.level,
        parentAdminCode: params.parentAdminCode,
      },
      orderBy: { catalogOrder: 'asc' },
    });
    return rows.map(mapRegion);
  }

  async findRegion(adminCode: string): Promise<RegionCatalogRow | null> {
    const row = await this.prisma.region.findUnique({ where: { adminCode } });
    return row ? mapRegion(row) : null;
  }

  async listPopularCities(): Promise<PopularCityRow[]> {
    const rows = await this.prisma.popularCity.findMany({
      where: { enabled: true },
      orderBy: { catalogOrder: 'asc' },
    });
    return rows.map(mapPopular);
  }

  async findLegacyCityCodeForDistrict(adminCode: string): Promise<string | null> {
    const district = await this.prisma.region.findUnique({ where: { adminCode } });
    if (!district?.enabled || district.level !== 'district' || !district.parentAdminCode) {
      return null;
    }
    const parent = await this.prisma.region.findUnique({
      where: { adminCode: district.parentAdminCode },
    });
    if (!parent?.enabled) return null;

    if (parent.level === 'province' && parent.isMunicipality) {
      const popular = await this.prisma.popularCity.findFirst({
        where: {
          enabled: true,
          kind: 'municipality',
          provinceAdminCode: parent.adminCode,
        },
        select: { legacyCityCode: true },
      });
      return popular?.legacyCityCode ?? null;
    }

    if (parent.level === 'city') {
      const popular = await this.prisma.popularCity.findFirst({
        where: {
          enabled: true,
          kind: 'city',
          cityAdminCode: parent.adminCode,
        },
        select: { legacyCityCode: true },
      });
      return popular?.legacyCityCode ?? null;
    }
    return null;
  }

  async findDirectClimateMapping(adminCode: string): Promise<RegionClimateDirectMapping | null> {
    const delegate = this.directMappingDelegate;
    if (!delegate) return null;
    const row = await delegate.findUnique({ where: { adminCode } });
    return row ? mapDirect(row) : null;
  }

  async listClimateAnchors(): Promise<ClimateAnchor[]> {
    const delegate = this.anchorDelegate;
    if (!delegate) return [];
    const rows = await delegate.findMany({
      where: { enabled: true },
      orderBy: { adminCode: 'asc' },
    });
    return rows.map(mapAnchor);
  }
}
