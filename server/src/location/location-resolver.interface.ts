/** DI token for the LocationResolver abstraction. */
export const LOCATION_RESOLVER = 'LOCATION_RESOLVER';

/** LocationResolver — thin abstraction: device coordinates → city_code. */
export interface CityResult {
  city_code: string;
  city_name: string;
}

export interface LocationResolver {
  resolveCity(lat: number, lng: number): Promise<CityResult | null>;
}
