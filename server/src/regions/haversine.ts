const EARTH_RADIUS_KM = 6371.0088;

function toRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

export function haversineDistanceKm(
  from: { lng: number; lat: number },
  to: { lng: number; lat: number },
): number {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const a = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function roundDistanceKm(distance: number): number {
  return Math.round((distance + Number.EPSILON) * 10) / 10;
}
