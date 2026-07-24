export type { TileXY, TilePixel } from "./tile-coordinate.js";
export {
  MAX_MERCATOR_LATITUDE,
  lonLatToTileXY,
  lonLatToTilePixel,
  coordinateToTileXY,
} from "./tile-coordinate.js";

export { decodeElevation } from "./dem-decode.js";

export type { DecodedPng } from "./png-codec.js";
export { decodePng, encodePng, rgbAt } from "./png-codec.js";

export type { Neighborhood3x3 } from "./slope.js";
export { calculateSlopeDeg } from "./slope.js";

export { METERS_PER_DEGREE_LAT, metersPerDegreeLon, haversineDistanceM } from "./geodesy.js";

export type {
  ElevationGrid,
  SlopeStatistics,
  TerrainClass,
  TerrainClassification,
  TerrainClassificationOptions,
} from "./grid-analysis.js";
export {
  DEFAULT_STEEP_SLOPE_THRESHOLD_DEG,
  computeSlopeGrid,
  slopeStatistics,
  classifyTerrain,
} from "./grid-analysis.js";

export type { ProfileSample, ProfileStatistics } from "./profile.js";
export { profileStatistics } from "./profile.js";
