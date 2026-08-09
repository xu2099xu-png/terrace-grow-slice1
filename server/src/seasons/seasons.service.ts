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
  SeasonalCropRow,
  SowingWindowRow,
  SeasonalEngineResult,
} from '../engines/seasonal-engine';
import { AppConfigService } from '../config/runtime-config';

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
    // SEASON_DATE is a test/E2E hook to fix "today" deterministically.
    // Without it the real Asia/Shanghai calendar day is used.
    const date = this.config.value.seasonDate
      ? new Date(`${this.config.value.seasonDate}T00:00:00.000Z`)
      : new Date();
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

    const cropRows: SeasonalCropRow[] = crops.map((c) => ({
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
      crops.map((c) => this.agri.getCropEnvironmentRequirement(c.id)),
    );
    envs.forEach((env, i) => {
      if (env) {
        cropRows[i].frostSensitive = env.frostSensitive;
        cropRows[i].tempMin = env.tempMin ?? null;
        cropRows[i].tempMax = env.tempMax ?? null;
        cropRows[i].minSunHours = env.minSunHours;
      }
    });

    const windowRows: SowingWindowRow[] = windows.map((w) => ({
      cropId: w.cropId,
      climateZoneCode: w.climateZoneCode,
      startMethod: w.startMethod,
      windowKey: w.windowKey,
      windowStart: w.windowStart,
      windowEnd: w.windowEnd,
    }));

    const result: SeasonalEngineResult = buildSeasonalRecommendations({
      date,
      climateZoneCode: zone.code,
      crops: cropRows,
      windows: windowRows,
      weather: weatherDays,
      terrace: terrace
        ? {
            sunHoursMin: terrace.sunHoursMin,
            sunHoursMax: terrace.sunHoursMax,
            sunConfidence: terrace.sunConfidence,
          }
        : null,
    });

    return {
      date: today,
      city_code: cityCode,
      location_status: 'ok',
      climate_zone_code: zone.code,
      climate_data_status: result.climate_data_status,
      weather_data_status: result.weather_data_status,
      has_profile: result.has_profile,
      items: result.items,
      warnings: result.warnings,
    };
  }
}
