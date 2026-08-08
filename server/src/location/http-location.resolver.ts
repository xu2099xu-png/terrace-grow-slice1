import { Injectable, Logger } from '@nestjs/common';
import { CityResult, LocationResolver } from './location-resolver.interface';

/** Real HTTP reverse-geocode adapter (placeholder). Not configured → null. */
@Injectable()
export class HttpLocationResolver implements LocationResolver {
  private readonly logger = new Logger(HttpLocationResolver.name);

  async resolveCity(lat: number, lng: number): Promise<CityResult | null> {
    const key = process.env.LOCATION_API_KEY;
    if (!key) {
      this.logger.warn('LOCATION_API_KEY not configured — location unavailable');
      return null;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const url =
        'https://restapi.amap.com/v3/geocode/regeo?' +
        `location=${lng},${lat}&key=${key}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const json: any = await res.json();
      const province = json?.regeocode?.addressComponent?.province || '';
      const district = json?.regeocode?.addressComponent?.district || '';
      if (!district && !province) return null;
      return { city_code: district || province, city_name: district || province };
    } catch (e) {
      this.logger.warn(`location resolve failed: ${(e as Error).message}`);
      return null;
    }
  }
}
