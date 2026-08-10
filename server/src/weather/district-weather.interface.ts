import { DailyWeather } from './weather-provider.interface';

export const DISTRICT_WEATHER_PROVIDER = 'DISTRICT_WEATHER_PROVIDER';

export type DistrictWeatherStatus = 'available' | 'partial' | 'unavailable';

export interface WeatherAttribution {
  name: string | null;
  url: string | null;
  sources: string[];
}

export interface PublicDistrictWeather {
  status: DistrictWeatherStatus;
  source: string | null;
  observed_at: string | null;
  updated_at: string | null;
  cache_hit: boolean;
  attribution: WeatherAttribution;
  summary: string;
  temperature_current_c: number | null;
  temperature_min_c: number | null;
  temperature_max_c: number | null;
  condition: string | null;
  precipitation_mm: number | null;
  precipitation_probability_percent: number | null;
  humidity_percent: number | null;
  wind: string | null;
  warnings: string[];
}

export interface DistrictWeatherResult {
  weather: PublicDistrictWeather;
  dailyWeather: DailyWeather[];
}

export interface DistrictWeatherRequest {
  selectedAreaCode: string;
  latitude: number;
  longitude: number;
  today: string;
  now?: Date;
}

export interface DistrictWeatherProvider {
  fetchDistrictWeather(request: DistrictWeatherRequest): Promise<DistrictWeatherResult>;
}

export function unavailableDistrictWeather(warnings: string[] = []): DistrictWeatherResult {
  return {
    weather: {
      status: 'unavailable',
      source: null,
      observed_at: null,
      updated_at: null,
      cache_hit: false,
      attribution: {
        name: null,
        url: null,
        sources: [],
      },
      summary: '',
      temperature_current_c: null,
      temperature_min_c: null,
      temperature_max_c: null,
      condition: null,
      precipitation_mm: null,
      precipitation_probability_percent: null,
      humidity_percent: null,
      wind: null,
      warnings,
    },
    dailyWeather: [],
  };
}
