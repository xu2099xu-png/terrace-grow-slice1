import { Injectable, Logger, Optional } from '@nestjs/common';
import { CityResult, DistrictLocationResult, LocationResolver } from './location-resolver.interface';
import { findCityByPlaceName } from './city-metadata';
import { AppConfigService } from '../config/runtime-config';
import { RegionDirectoryService } from '../regions/region-directory.service';

/**
 * Real HTTP reverse-geocode adapter (AMap 高德).
 *
 * Provider contract (closure-3): the raw AMap administrative shape
 * (province/city/district — e.g. 北京市 / '' / 海淀区) is normalized to OUR
 * canonical internal city_code (beijing) before returning. We never leak a
 * third-party district string as a city_code.
 *
 * Not configured / unknown place → null (frontend falls back to manual pick).
 */
@Injectable()
export class HttpLocationResolver implements LocationResolver {
  private readonly logger = new Logger(HttpLocationResolver.name);

  constructor(
    private readonly config: AppConfigService,
    @Optional() private readonly regions?: RegionDirectoryService,
  ) {}

  async resolveCity(lat: number, lng: number): Promise<CityResult | null> {
    const key = this.config.value.locationApiKey;
    if (!key) {
      this.logger.warn('LOCATION_API_KEY not configured — location unavailable');
      return null;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const url =
        'https://restapi.amap.com/v3/geocode/regeo?' +
        `location=${lng},${lat}&key=${key}`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return null;
      const json: any = await res.json();
      if (json?.status !== '1') return null;
      const comp = json?.regeocode?.addressComponent;
      if (!comp) return null;
      // Direct municipalities have empty `city`; province/district carry the name.
      const city = findCityByPlaceName([comp.city, comp.province, comp.district]);
      if (!city) return null;
      return { city_code: city.city_code, city_name: city.city_name };
    } catch (e) {
      this.logger.warn(`location resolve failed: ${(e as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async resolveDistrict(lat: number, lng: number): Promise<DistrictLocationResult | null> {
    if (this.config.value.locationProvider === 'off') return null;
    const key = this.config.value.locationProviderApiKey ?? this.config.value.locationApiKey;
    const baseUrl = this.config.value.locationProviderBaseUrl ?? 'https://restapi.amap.com';
    if (!key) {
      this.logger.warn('LOCATION_PROVIDER_API_KEY not configured - location unavailable');
      return null;
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.config.value.locationProviderTimeoutMs,
    );
    try {
      const url = new URL('/v3/geocode/regeo', baseUrl);
      url.searchParams.set('location', `${lng},${lat}`);
      url.searchParams.set('key', key);
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return null;
      const json: any = await res.json();
      if (json?.status !== '1') return null;
      const adcode = json?.regeocode?.addressComponent?.adcode;
      if (typeof adcode !== 'string' || !/^\d{6}$/.test(adcode)) return null;
      return await this.regions?.resolveDistrictRegion(adcode) ?? null;
    } catch (e) {
      this.logger.warn(`district location resolve failed: ${(e as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
