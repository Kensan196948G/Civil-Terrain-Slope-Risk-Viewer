import type { Coordinate } from "@civil-terrain/domain";

/**
 * XYZ / Web Mercator tile coordinate (design spec 8.1).
 */
export interface TileXY {
  readonly x: number;
  readonly y: number;
}

/**
 * Web Mercator valid latitude bound. Latitudes beyond this are clamped because
 * the projection diverges toward the poles.
 */
export const MAX_MERCATOR_LATITUDE = 85.05112878;

function clampLatitude(lat: number): number {
  if (lat > MAX_MERCATOR_LATITUDE) return MAX_MERCATOR_LATITUDE;
  if (lat < -MAX_MERCATOR_LATITUDE) return -MAX_MERCATOR_LATITUDE;
  return lat;
}

/**
 * Convert a lon/lat pair to an XYZ tile index at the given zoom level.
 * Out-of-range latitudes are clamped to the Web Mercator bound before projection.
 */
export function lonLatToTileXY(lon: number, lat: number, zoom: number): TileXY {
  const n = 2 ** zoom;
  const phi = (clampLatitude(lat) * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) * n) / 2);
  return { x, y };
}

/**
 * Convenience wrapper accepting the domain `Coordinate` type.
 */
export function coordinateToTileXY(coordinate: Coordinate, zoom: number): TileXY {
  return lonLatToTileXY(coordinate.lon, coordinate.lat, zoom);
}
