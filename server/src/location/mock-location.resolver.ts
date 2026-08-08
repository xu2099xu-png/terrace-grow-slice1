import { Injectable } from '@nestjs/common';
import { CityResult, LocationResolver } from './location-resolver.interface';

/** Deterministic mock: nearest known seeded city, or null when far away. */
@Injectable()
export class MockLocationResolver implements LocationResolver {
  private readonly cities: Array<{ code: string; name: string; lat: number; lng: number }> = [
    { code: 'beijing', name: '北京', lat: 39.9, lng: 116.4 },
    { code: 'tianjin', name: '天津', lat: 39.1, lng: 117.2 },
    { code: 'shanghai', name: '上海', lat: 31.2, lng: 121.5 },
    { code: 'hangzhou', name: '杭州', lat: 30.2, lng: 120.2 },
    { code: 'nanjing', name: '南京', lat: 32.1, lng: 118.8 },
    { code: 'suzhou', name: '苏州', lat: 31.3, lng: 120.6 },
    { code: 'guangzhou', name: '广州', lat: 23.1, lng: 113.3 },
    { code: 'shenzhen', name: '深圳', lat: 22.5, lng: 114.1 },
  ];

  async resolveCity(lat: number, lng: number): Promise<CityResult | null> {
    let best: { code: string; name: string; dist: number } | null = null;
    for (const c of this.cities) {
      const dist = Math.abs(c.lat - lat) + Math.abs(c.lng - lng);
      if (!best || dist < best.dist) {
        best = { code: c.code, name: c.name, dist };
      }
    }
    // >2 degrees away from every seeded city → treat as unresolved (AC-02)
    if (!best || best.dist > 2) return null;
    return { city_code: best.code, city_name: best.name };
  }
}
