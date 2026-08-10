import { Inject, Injectable } from '@nestjs/common';
import { TodayContextService } from '../calendar/today-context.service';
import {
  AgriRegionMatch,
  DistrictRegionContext,
} from '../regions/region.types';
import { AgriRegionResolverService } from '../regions/resolve-agri-region';
import { RegionDirectoryService } from '../regions/region-directory.service';
import { SeasonsService } from '../seasons/seasons.service';
import {
  DISTRICT_WEATHER_PROVIDER,
  DistrictWeatherProvider,
  PublicDistrictWeather,
  unavailableDistrictWeather,
} from '../weather/district-weather.interface';

export interface SeasonalHomePayload {
  today: Awaited<ReturnType<TodayContextService['getToday']>>;
  region: DistrictRegionContext | null;
  agri_region_match: AgriRegionMatch;
  weather: PublicDistrictWeather;
  seasonal: Awaited<ReturnType<SeasonsService['buildForClimateZone']>>;
}

@Injectable()
export class SeasonalHomeService {
  constructor(
    private readonly todayContext: TodayContextService,
    private readonly regions: RegionDirectoryService,
    private readonly agriRegionResolver: AgriRegionResolverService,
    @Inject(DISTRICT_WEATHER_PROVIDER)
    private readonly weather: DistrictWeatherProvider,
    private readonly seasons: SeasonsService,
  ) {}

  async home(adminCode: string, userId: string | null): Promise<SeasonalHomePayload> {
    const today = await this.todayContext.getToday();
    const [region, selectedRegion, match] = await Promise.all([
      this.regions.resolveDistrictRegion(adminCode),
      this.regions.findEnabledDistrict(adminCode),
      this.agriRegionResolver.resolve(adminCode),
    ]);

    if (!region || !selectedRegion || match.status === 'unsupported') {
      return {
        today,
        region: null,
        agri_region_match: match,
        weather: unavailableDistrictWeather(['地区不可用']).weather,
        seasonal: {
          date: today.date,
          location_status: 'unavailable',
          climate_zone_code: null,
          climate_data_status: 'unsupported',
          weather_data_status: 'unavailable',
          has_profile: false,
          items: [],
          warnings: ['地区不可用'],
        },
      };
    }

    const weather = await this.weather.fetchDistrictWeather({
      selectedAreaCode: match.selected_area_code,
      latitude: selectedRegion.centroidLat,
      longitude: selectedRegion.centroidLng,
      today: today.date,
    });
    const seasonal = await this.seasons.buildForClimateZone({
      climateZoneCode: match.climate_zone_code,
      userId,
      weatherDays: weather.dailyWeather,
      date: new Date(`${today.date}T00:00:00.000Z`),
    });

    return {
      today,
      region,
      agri_region_match: match,
      weather: weather.weather,
      seasonal,
    };
  }
}
