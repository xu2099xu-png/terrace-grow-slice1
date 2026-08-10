/** DI token for the LocationResolver abstraction. */
export const LOCATION_RESOLVER = 'LOCATION_RESOLVER';

/** LocationResolver — thin abstraction: device coordinates → city_code. */
export interface CityResult {
  city_code: string;
  city_name: string;
}

export interface DistrictLocationResult {
  admin_code: string;
  name: string;
  level: 'district';
  province_name: string;
  city_name: string;
}

export interface LocationResolver {
  resolveCity(lat: number, lng: number): Promise<CityResult | null>;
  resolveDistrict?(lat: number, lng: number): Promise<DistrictLocationResult | null>;
}
