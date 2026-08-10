import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AgriRegionMatch, ClimateAnchor, RegionCatalogRow } from './region.types';
import { REGION_REPOSITORY, RegionRepository } from './region.repository';
import { haversineDistanceKm, roundDistanceKm } from './haversine';

export const ADMIN_CODE_PATTERN = /^\d{6}$/;

function unsupported(adminCode: string): AgriRegionMatch {
  return {
    status: 'unsupported',
    selected_area_code: adminCode,
    climate_area_code: null,
    climate_zone_code: null,
    proxy_used: false,
    proxy_name: null,
    distance_km: null,
  };
}

function isApproved(value: { reviewStatus: string; enabled?: boolean }): boolean {
  return value.reviewStatus === 'approved' && value.enabled !== false;
}

function compareAnchors(
  selected: RegionCatalogRow,
  left: ClimateAnchor,
  right: ClimateAnchor,
): number {
  const leftDistance = haversineDistanceKm(
    { lng: selected.centroidLng, lat: selected.centroidLat },
    { lng: left.centroidLng, lat: left.centroidLat },
  );
  const rightDistance = haversineDistanceKm(
    { lng: selected.centroidLng, lat: selected.centroidLat },
    { lng: right.centroidLng, lat: right.centroidLat },
  );
  if (Math.abs(leftDistance - rightDistance) > 1e-9) {
    return leftDistance - rightDistance;
  }
  return left.adminCode.localeCompare(right.adminCode);
}

@Injectable()
export class AgriRegionResolverService {
  constructor(
    @Inject(REGION_REPOSITORY) private readonly regions: RegionRepository,
  ) {}

  async resolve(adminCode: string): Promise<AgriRegionMatch> {
    if (!ADMIN_CODE_PATTERN.test(adminCode)) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        errors: [{
          path: 'admin_code',
          code: 'matches',
          message: 'admin_code must be a 6-digit administrative code',
        }],
      });
    }

    const selected = await this.regions.findRegion(adminCode);
    if (!selected?.enabled || selected.level !== 'district') {
      return unsupported(adminCode);
    }

    const direct = await this.regions.findDirectClimateMapping(adminCode);
    if (direct && direct.reviewStatus === 'approved') {
      return {
        status: 'direct',
        selected_area_code: selected.adminCode,
        climate_area_code: selected.adminCode,
        climate_zone_code: direct.climateZoneCode,
        proxy_used: false,
        proxy_name: null,
        distance_km: 0,
      };
    }

    const anchors = (await this.regions.listClimateAnchors())
      .filter(isApproved)
      .sort((a, b) => compareAnchors(selected, a, b));
    const best = anchors[0];
    if (!best) return unsupported(adminCode);
    const proxyRegion = await this.regions.findRegion(best.adminCode);
    const distance = haversineDistanceKm(
      { lng: selected.centroidLng, lat: selected.centroidLat },
      { lng: best.centroidLng, lat: best.centroidLat },
    );
    return {
      status: 'nearest_proxy',
      selected_area_code: selected.adminCode,
      climate_area_code: best.adminCode,
      climate_zone_code: best.climateZoneCode,
      proxy_used: true,
      proxy_name: proxyRegion?.name ?? null,
      distance_km: roundDistanceKm(distance),
    };
  }
}
