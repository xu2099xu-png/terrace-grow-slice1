import { Injectable, Inject } from '@nestjs/common';
import { AgriDataService } from '../agri-data.service';
import {
  WEATHER_PROVIDER,
  WeatherProvider,
  fetchWeatherSafely,
} from '../weather/weather-provider.interface';
import { toShanghaiDateString } from '../engines/lifecycle-engine';
import {
  buildSeasonalRecommendations,
  DailyWeatherRow,
  SeasonalCropRow,
  SowingWindowRow,
  SeasonalEngineResult,
} from '../engines/seasonal-engine';
import { AppConfigService } from '../config/runtime-config';

export interface SeasonalRecommendationPayload {
  date: string;
  location_status: 'ok' | 'unavailable';
  climate_zone_code: string | null;
  climate_data_status: 'available' | 'unsupported';
  weather_data_status: 'available' | 'partial' | 'unavailable';
  has_profile: boolean;
  items: SeasonalEngineResult['items'];
  warnings: string[];
}

interface AssembledSeasonalRecommendations {
  climate_data_status: SeasonalEngineResult['climate_data_status'];
  weather_data_status: SeasonalEngineResult['weather_data_status'];
  has_profile: boolean;
  items: SeasonalEngineResult['items'];
  warnings: string[];
}

@Injectable()
export class SeasonsService {
  constructor(
    private readonly agri: AgriDataService,
    @Inject(WEATHER_PROVIDER) private readonly weatherProvider: WeatherProvider,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Seasonal recommendation entry point (AC-01..).
   * userId may be null (anonymous) — terrace enhancement is optional (AC-12).
   */
  async now(cityCode: string, userId: string | null): Promise<any> {
    const date = this.getSeasonDate();
    const today = toShanghaiDateString(date);

    const zone = await this.agri.getClimateZoneByCity(cityCode);
    if (!zone) {
      return {
        date: today,
        city_code: cityCode,
        location_status: 'ok',
        climate_zone_code: null,
        climate_data_status: 'unsupported',
        weather_data_status: 'unavailable',
        has_profile: false,
        items: [],
        warnings: ['当前地区的种植数据还在完善'],
      };
    }

    const [crops, windows, weatherDays, terrace] = await Promise.all([
      this.agri.listSeasonalCrops(),
      this.agri.listSowingCalendars(zone.code),
      fetchWeatherSafely(
        this.weatherProvider,
        cityCode,
        today,
        this.config.value.weatherProviderTimeoutMs,
      ),
      userId ? this.agri.getTerraceProfile(userId) : null,
    ]);

    const assembled = await this.assembleForClimateZone({
      climateZoneCode: zone.code,
      date,
      weatherDays,
      crops,
      windows,
      terrace,
    });

    return {
      date: today,
      city_code: cityCode,
      location_status: 'ok',
      climate_zone_code: zone.code,
      climate_data_status: assembled.climate_data_status,
      weather_data_status: assembled.weather_data_status,
      has_profile: assembled.has_profile,
      items: assembled.items,
      warnings: assembled.warnings,
    };
  }

  async buildForClimateZone(input: {
    climateZoneCode: string | null;
    userId: string | null;
    weatherDays?: DailyWeatherRow[] | null;
    date?: Date;
  }): Promise<SeasonalRecommendationPayload> {
    const date = input.date ?? this.getSeasonDate();
    const today = toShanghaiDateString(date);
    if (!input.climateZoneCode) {
      return {
        date: today,
        location_status: 'unavailable',
        climate_zone_code: null,
        climate_data_status: 'unsupported',
        weather_data_status: 'unavailable',
        has_profile: false,
        items: [],
        warnings: ['地区不可用'],
      };
    }

    const [crops, windows, terrace] = await Promise.all([
      this.agri.listSeasonalCrops(),
      this.agri.listSowingCalendars(input.climateZoneCode),
      input.userId ? this.agri.getTerraceProfile(input.userId) : null,
    ]);

    const assembled = await this.assembleForClimateZone({
      climateZoneCode: input.climateZoneCode,
      date,
      weatherDays: input.weatherDays ?? null,
      crops,
      windows,
      terrace,
    });

    return {
      date: today,
      location_status: 'ok',
      climate_zone_code: input.climateZoneCode,
      climate_data_status: assembled.climate_data_status === 'supported' ? 'available' : 'unsupported',
      weather_data_status: assembled.weather_data_status,
      has_profile: assembled.has_profile,
      items: assembled.items,
      warnings: assembled.warnings,
    };
  }

  private getSeasonDate(): Date {
    // SEASON_DATE is a test/E2E hook to fix "today" deterministically.
    // Without it the real Asia/Shanghai calendar day is used.
    return this.config.value.seasonDate
      ? new Date(`${this.config.value.seasonDate}T00:00:00.000Z`)
      : new Date();
  }

  private async assembleForClimateZone(input: {
    climateZoneCode: string;
    date: Date;
    weatherDays: DailyWeatherRow[] | null;
    crops: Awaited<ReturnType<AgriDataService['listSeasonalCrops']>>;
    windows: Awaited<ReturnType<AgriDataService['listSowingCalendars']>>;
    terrace: Awaited<ReturnType<AgriDataService['getTerraceProfile']>> | null;
  }): Promise<AssembledSeasonalRecommendations> {
    const cropRows: SeasonalCropRow[] = input.crops.map((c) => ({
      id: c.id,
      name: c.name,
      recommendedStartMethod: c.recommendedStartMethod,
      difficulty: c.difficulty,
      containerFriendly: c.containerFriendly,
      familyUse: c.familyUse,
      yieldLevel: c.yieldLevel,
      harvestDaysMin: c.harvestDaysMin,
      harvestDaysMax: c.harvestDaysMax,
      // Unknown until a governed EnvironmentRequirement is found — never fake
      // defaults (closure-5): no fabricated 6h sun / frostSensitive=false.
      frostSensitive: null,
      tempMin: null,
      tempMax: null,
      minSunHours: null,
    }));

    // Enrich with governed environment requirement facts (stays null when
    // missing / draft-filtered → engine treats it as unknown, no filter).
    const envs = await Promise.all(
      input.crops.map((c) => this.agri.getCropEnvironmentRequirement(c.id)),
    );
    envs.forEach((env, i) => {
      if (env) {
        cropRows[i].frostSensitive = env.frostSensitive;
        cropRows[i].tempMin = env.tempMin ?? null;
        cropRows[i].tempMax = env.tempMax ?? null;
        cropRows[i].minSunHours = env.minSunHours;
      }
    });

    const windowRows: SowingWindowRow[] = input.windows.map((w) => ({
      cropId: w.cropId,
      climateZoneCode: w.climateZoneCode,
      startMethod: w.startMethod,
      windowKey: w.windowKey,
      windowStart: w.windowStart,
      windowEnd: w.windowEnd,
    }));

    const result: SeasonalEngineResult = buildSeasonalRecommendations({
      date: input.date,
      climateZoneCode: input.climateZoneCode,
      crops: cropRows,
      windows: windowRows,
      weather: input.weatherDays,
      terrace: input.terrace
        ? {
            sunHoursMin: input.terrace.sunHoursMin,
            sunHoursMax: input.terrace.sunHoursMax,
            sunConfidence: input.terrace.sunConfidence,
          }
        : null,
    });

    return {
      climate_data_status: result.climate_data_status,
      weather_data_status: result.weather_data_status,
      has_profile: result.has_profile,
      items: result.items,
      warnings: result.warnings,
    };
  }
}
