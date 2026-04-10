/**
 * backend/src/services/geo.service.ts
 * 
 * Geospatial calculation service.
 * ⚠️ JANGAN ubah Haversine formula.
 */

interface Coord {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_METERS = 6371000;

/**
 * Haversine Distance — standard great-circle distance formula.
 * 
 * ⚠️ JANGAN ubah formula ini — ia adalah standard geospatial.
 * 
 * @returns Distance in meters
 */
export function haversineDistance(coord1: Coord, coord2: Coord): number {
  const R = EARTH_RADIUS_METERS;
  const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
  const dLon = (coord2.lon - coord1.lon) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(coord1.lat * Math.PI / 180) *
    Math.cos(coord2.lat * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculate impossible travel velocity.
 * @returns velocity in km/h
 */
export function calculateVelocity(
  prevCoord: Coord,
  currCoord: Coord,
  prevTimestamp: number,
  currTimestamp: number
): number {
  const distanceMeters = haversineDistance(prevCoord, currCoord);
  const timeDiffHours = Math.abs(currTimestamp - prevTimestamp) / (1000 * 60 * 60);

  if (timeDiffHours === 0) return Infinity;

  return (distanceMeters / 1000) / timeDiffHours;
}
