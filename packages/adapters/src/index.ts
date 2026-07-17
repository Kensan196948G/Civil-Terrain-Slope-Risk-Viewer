export type { RawArtifact, FetchContext, NormalizeContext, DataAdapter } from "./data-adapter.js";

export type { UrlSafetyOptions, UrlSafetyResult } from "./url-safety.js";
export { checkUrlSafety } from "./url-safety.js";

export type { CacheKeyParams } from "./cache-key.js";
export { buildCacheKey } from "./cache-key.js";

export type {
  GsiDemSourceSpec,
  TileFetchResult,
  TileFetcher,
  ElevationLookupDeps,
  ElevationLookupResult,
} from "./gsi-dem.js";
export {
  GSI_DEM_SOURCES,
  DEFAULT_DEM_PRIORITY,
  GSI_TILE_BASE_URL,
  GSI_TERMS_URL,
  buildGsiDemTileUrl,
  lookupElevation,
  pointQualityFor,
  UpstreamTileError,
} from "./gsi-dem.js";
