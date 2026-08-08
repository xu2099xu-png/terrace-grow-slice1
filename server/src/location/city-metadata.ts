/**
 * Server-side city metadata — the canonical source binding an internal
 * city_code to its display name and coordinates. Data-driven (not if/else
 * scattered in controllers) and shared by supported-cities, the weather
 * adapter (QWeather coordinates) and the location adapter (AMap reverse map).
 *
 * No City database table by design (Slice 3 scope).
 */
export const CITY_METADATA: Record<string, { name: string; lng: number; lat: number }> = {
  beijing: { name: '北京', lng: 116.41, lat: 39.92 },
  tianjin: { name: '天津', lng: 117.2, lat: 39.1 },
  shanghai: { name: '上海', lng: 121.47, lat: 31.23 },
  hangzhou: { name: '杭州', lng: 120.16, lat: 30.29 },
  nanjing: { name: '南京', lng: 118.8, lat: 32.06 },
  suzhou: { name: '苏州', lng: 120.62, lat: 31.32 },
  ningbo: { name: '宁波', lng: 121.55, lat: 29.87 },
  hefei: { name: '合肥', lng: 117.23, lat: 31.82 },
  wuxi: { name: '无锡', lng: 120.31, lat: 31.57 },
  guangzhou: { name: '广州', lng: 113.26, lat: 23.13 },
  shenzhen: { name: '深圳', lng: 114.06, lat: 22.55 },
  fuzhou: { name: '福州', lng: 119.3, lat: 26.08 },
  xiamen: { name: '厦门', lng: 118.09, lat: 24.48 },
  nanning: { name: '南宁', lng: 108.32, lat: 22.82 },
  shijiazhuang: { name: '石家庄', lng: 114.51, lat: 38.04 },
  jinan: { name: '济南', lng: 117.12, lat: 36.65 },
  zhengzhou: { name: '郑州', lng: 113.63, lat: 34.75 },
};

/** Strip province/city/district suffixes to match canonical names. */
export function normalizePlaceName(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw
    .replace(/[省市自治区特别行政区]+$/, '')
    .replace(/^(内蒙古|广西|西藏|宁夏|新疆)/, (m) => m)
    .trim();
}

/** Reverse lookup: a Chinese place name (北京/海淀区/杭州市) → canonical code. */
export function findCityByPlaceName(
  names: Array<string | undefined | null>,
): { city_code: string; city_name: string } | null {
  for (const raw of names) {
    const n = normalizePlaceName(raw);
    if (!n) continue;
    for (const [code, meta] of Object.entries(CITY_METADATA)) {
      // exact match, or district-level prefix match (e.g. 朝阳区 under 北京)
      if (n === meta.name || n.startsWith(meta.name) || meta.name.startsWith(n)) {
        return { city_code: code, city_name: meta.name };
      }
    }
  }
  return null;
}
