import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TodayContext } from '../calendar/calendar.types';
import { RegionDirectoryService } from '../regions/region-directory.service';
import { AgriRegionResolverService } from '../regions/resolve-agri-region';
import { InMemoryRegionRepository } from '../regions/test-region-repository';
import {
  ClimateAnchor,
  RegionCatalogRow,
  RegionClimateDirectMapping,
} from '../regions/region.types';
import {
  DistrictWeatherProvider,
  DistrictWeatherRequest,
  DistrictWeatherResult,
  unavailableDistrictWeather,
} from '../weather/district-weather.interface';
import { SeasonsService } from '../seasons/seasons.service';
import { SeasonalHomeService } from './seasonal-home.service';

const today: TodayContext = {
  date: '2026-08-10',
  weekday: '一',
  timezone: 'Asia/Shanghai',
  lunar: { status: 'available', month: '六', day: '廿八' },
  solar_term: null,
};

function region(row: Partial<RegionCatalogRow> & Pick<RegionCatalogRow, 'adminCode' | 'name' | 'level'>): RegionCatalogRow {
  return {
    parentAdminCode: null,
    isMunicipality: false,
    enabled: true,
    catalogOrder: Number(row.adminCode),
    dataVersion: 'slice6-test',
    source: 'slice6-test',
    centroidLng: 0,
    centroidLat: 0,
    ...row,
  };
}

function direct(adminCode: string): RegionClimateDirectMapping {
  return {
    adminCode,
    climateZoneCode: 'north_china',
    source: 'slice6-test',
    reviewStatus: 'approved',
    confidence: 5,
    version: 1,
  };
}

function anchor(adminCode: string, lng: number, lat: number): ClimateAnchor {
  return {
    adminCode,
    climateZoneCode: 'north_china',
    centroidLng: lng,
    centroidLat: lat,
    enabled: true,
    source: 'slice6-test',
    reviewStatus: 'approved',
    confidence: 5,
    version: 1,
  };
}

function makeService() {
  const rows = [
    region({ adminCode: '110000', name: '北京市', level: 'province', isMunicipality: true }),
    region({ adminCode: '110101', name: '东城区', level: 'district', parentAdminCode: '110000', centroidLng: 116.42, centroidLat: 39.93 }),
    region({ adminCode: '110105', name: '朝阳区', level: 'district', parentAdminCode: '110000', centroidLng: 116.45, centroidLat: 39.92 }),
    region({ adminCode: '130000', name: '河北省', level: 'province' }),
    region({ adminCode: '130100', name: '石家庄市', level: 'city', parentAdminCode: '130000' }),
    region({ adminCode: '130102', name: '长安区', level: 'district', parentAdminCode: '130100', centroidLng: 114.54, centroidLat: 38.04 }),
  ];
  const repository = new InMemoryRegionRepository(
    rows,
    [],
    [direct('110101')],
    [anchor('110105', 116.45, 39.92)],
  );
  const weatherRequests: DistrictWeatherRequest[] = [];
  const weather: DistrictWeatherProvider = {
    fetchDistrictWeather: vi.fn(async (request: DistrictWeatherRequest) => {
      weatherRequests.push(request);
      const result: DistrictWeatherResult = {
        weather: {
          ...unavailableDistrictWeather().weather,
          status: 'available',
          source: 'mock',
          updated_at: '2026-08-10T00:00:00.000Z',
          summary: '晴 18-26°C',
          temperature_min_c: 18,
          temperature_max_c: 26,
        },
        dailyWeather: [
          { date: '2026-08-10', tempMinC: 18, tempMaxC: 26, frostRisk: false },
          { date: '2026-08-11', tempMinC: 18, tempMaxC: 26, frostRisk: false },
          { date: '2026-08-12', tempMinC: 18, tempMaxC: 26, frostRisk: false },
        ],
      };
      return result;
    }),
  };
  const seasonInputs: any[] = [];
  const seasons = {
    buildForClimateZone: vi.fn(async (input: any) => {
      seasonInputs.push(input);
      return {
        date: today.date,
        location_status: 'ok',
        climate_zone_code: input.climateZoneCode,
        climate_data_status: 'available',
        weather_data_status: 'available',
        has_profile: false,
        items: [{ crop_id: 'crop-lettuce' }],
        warnings: [],
      };
    }),
  } as unknown as SeasonsService;

  return {
    service: new SeasonalHomeService(
      { getToday: vi.fn(async () => today) } as any,
      new RegionDirectoryService(repository),
      new AgriRegionResolverService(repository),
      weather,
      seasons,
    ),
    weatherRequests,
    seasonInputs,
    weather,
  };
}

describe('SeasonalHomeService', () => {
  it('aggregates direct district seasonal home without leaking legacy city_code', async () => {
    const { service, weatherRequests, seasonInputs } = makeService();
    const payload = await service.home('110101', null);

    expect(payload.region).toMatchObject({
      admin_code: '110101',
      province_name: '北京市',
      city_name: '北京市',
    });
    expect(payload.agri_region_match).toMatchObject({
      status: 'direct',
      selected_area_code: '110101',
      climate_area_code: '110101',
      proxy_used: false,
      distance_km: 0,
    });
    expect(weatherRequests[0]).toMatchObject({ selectedAreaCode: '110101' });
    expect(seasonInputs[0]).toMatchObject({ climateZoneCode: 'north_china', userId: null });
    expect(payload.seasonal).not.toHaveProperty('city_code');
  });

  it('uses climate proxy for seasonal recommendations but selected district for weather', async () => {
    const { service, weatherRequests, seasonInputs } = makeService();
    const payload = await service.home('130102', 'user-1');

    expect(payload.agri_region_match).toMatchObject({
      status: 'nearest_proxy',
      selected_area_code: '130102',
      climate_area_code: '110105',
      proxy_used: true,
      proxy_name: '朝阳区',
      climate_zone_code: 'north_china',
    });
    expect(weatherRequests).toHaveLength(1);
    expect(weatherRequests[0]).toMatchObject({
      selectedAreaCode: '130102',
      latitude: 38.04,
      longitude: 114.54,
    });
    expect(seasonInputs[0]).toMatchObject({
      climateZoneCode: 'north_china',
      userId: 'user-1',
    });
  });

  it('returns neutral unsupported payload for well-formed unknown admin code', async () => {
    const { service, weather, seasonInputs } = makeService();
    const payload = await service.home('999999', null);

    expect(payload.region).toBeNull();
    expect(payload.agri_region_match).toEqual({
      status: 'unsupported',
      selected_area_code: '999999',
      climate_area_code: null,
      climate_zone_code: null,
      proxy_used: false,
      proxy_name: null,
      distance_km: null,
    });
    expect(payload.weather).toMatchObject({
      status: 'unavailable',
      warnings: ['地区不可用'],
    });
    expect(payload.seasonal).toMatchObject({
      location_status: 'unavailable',
      climate_zone_code: null,
      climate_data_status: 'unsupported',
      weather_data_status: 'unavailable',
      has_profile: false,
      items: [],
      warnings: ['地区不可用'],
    });
    expect(weather.fetchDistrictWeather).not.toHaveBeenCalled();
    expect(seasonInputs).toEqual([]);
  });

  it('rejects syntactically invalid admin code before aggregation', async () => {
    const { service } = makeService();
    await expect(service.home('abc', null)).rejects.toBeInstanceOf(BadRequestException);
  });
});
