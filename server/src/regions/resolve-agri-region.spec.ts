import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { haversineDistanceKm } from './haversine';
import { AgriRegionResolverService } from './resolve-agri-region';
import { InMemoryRegionRepository } from './test-region-repository';
import { ClimateAnchor, RegionCatalogRow, RegionClimateDirectMapping } from './region.types';

const region = (
  adminCode: string,
  name: string,
  centroidLng: number,
  centroidLat: number,
  enabled = true,
): RegionCatalogRow => ({
  adminCode,
  name,
  level: 'district',
  parentAdminCode: '110000',
  isMunicipality: false,
  enabled,
  catalogOrder: Number(adminCode),
  dataVersion: 'mca-xzqh-mainland-2026-08-09',
  source: 'mca',
  centroidLng,
  centroidLat,
});

const direct = (adminCode: string, climateZoneCode = 'north_china'): RegionClimateDirectMapping => ({
  adminCode,
  climateZoneCode,
  source: 'slice6-test',
  reviewStatus: 'approved',
  confidence: 5,
  version: 1,
});

const anchor = (
  adminCode: string,
  centroidLng: number,
  centroidLat: number,
  reviewStatus = 'approved',
  enabled = true,
): ClimateAnchor => ({
  adminCode,
  climateZoneCode: `zone-${adminCode}`,
  centroidLng,
  centroidLat,
  enabled,
  source: 'slice6-test',
  reviewStatus,
  confidence: 5,
  version: 1,
});

describe('AgriRegionResolverService', () => {
  it('computes Haversine distance in kilometers', () => {
    const distance = haversineDistanceKm(
      { lng: -74.006, lat: 40.7128 },
      { lng: -0.1278, lat: 51.5074 },
    );
    expect(distance).toBeCloseTo(5570.2, 1);
  });

  it('returns direct mapping with same selected and climate area code', async () => {
    const service = new AgriRegionResolverService(new InMemoryRegionRepository(
      [region('110101', '东城区', 116.4, 39.9)],
      [],
      [direct('110101')],
    ));
    await expect(service.resolve('110101')).resolves.toEqual({
      status: 'direct',
      selected_area_code: '110101',
      climate_area_code: '110101',
      climate_zone_code: 'north_china',
      proxy_used: false,
      proxy_name: null,
      distance_km: 0,
    });
  });

  it('returns unsupported only for well-formed unknown or disabled admin codes', async () => {
    const service = new AgriRegionResolverService(new InMemoryRegionRepository([
      region('110101', '东城区', 116.4, 39.9, false),
    ]));
    await expect(service.resolve('999999')).resolves.toMatchObject({
      status: 'unsupported',
      selected_area_code: '999999',
      climate_area_code: null,
    });
    await expect(service.resolve('110101')).resolves.toMatchObject({
      status: 'unsupported',
      selected_area_code: '110101',
    });
    await expect(service.resolve('abc')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('excludes disabled and draft anchors from nearest proxy selection', async () => {
    const service = new AgriRegionResolverService(new InMemoryRegionRepository(
      [
        region('130102', '长安区', 114.5, 38.0),
        region('110105', '朝阳区', 116.45, 39.92),
        region('120101', '和平区', 117.2, 39.1),
      ],
      [],
      [],
      [
        anchor('120101', 114.51, 38.01, 'draft', true),
        anchor('110105', 116.45, 39.92, 'approved', false),
        anchor('110105', 116.45, 39.92, 'approved', true),
      ],
    ));
    await expect(service.resolve('130102')).resolves.toMatchObject({
      status: 'nearest_proxy',
      selected_area_code: '130102',
      climate_area_code: '110105',
      climate_zone_code: 'zone-110105',
      proxy_used: true,
      proxy_name: '朝阳区',
    });
  });

  it('breaks equal-distance ties by climate area code ascending', async () => {
    const service = new AgriRegionResolverService(new InMemoryRegionRepository(
      [
        region('130102', '长安区', 0, 0),
        region('110105', '朝阳区', 0, 1),
        region('120101', '和平区', 0, -1),
      ],
      [],
      [],
      [
        anchor('120101', 0, -1),
        anchor('110105', 0, 1),
      ],
    ));
    await expect(service.resolve('130102')).resolves.toMatchObject({
      status: 'nearest_proxy',
      climate_area_code: '110105',
    });
  });
});
