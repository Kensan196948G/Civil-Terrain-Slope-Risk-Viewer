import type { Coordinate } from "@civil-terrain/domain";
import { isValidCoordinate } from "@civil-terrain/domain";
import {
  UpstreamTileError,
  checkUrlSafety,
  lookupElevation,
  pointQualityFor,
} from "@civil-terrain/adapters";
import type { ElevationLookupResult, FetchContext, TileFetcher } from "@civil-terrain/adapters";
import type { RouteHandler } from "../router.js";
import { jsonResponse, problemResponse } from "../http.js";

/** Reported as ResponseMeta.algorithmVersion (openapi). Bump on logic changes. */
export const ALGORITHM_VERSION = "0.1.0";

/** The only host the elevation route is ever allowed to fetch from. */
const GSI_ALLOWED_HOSTS: readonly string[] = ["cyberjapandata.gsi.go.jp"];

/** Lookup port: the route depends on this signature, not on the transport. */
export type ElevationLookup = (
  coordinate: Coordinate,
  ctx: FetchContext,
) => Promise<ElevationLookupResult>;

function parseCoordinateParam(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * GET /elevation?lat=..&lon=.. (openapi getElevation, design spec 7.2).
 * The lookup is injected so tests can drive the route without any network.
 */
export function createElevationHandler(lookup: ElevationLookup): RouteHandler {
  return async (context) => {
    const lat = parseCoordinateParam(context.url.searchParams.get("lat"));
    const lon = parseCoordinateParam(context.url.searchParams.get("lon"));
    if (lat === null || lon === null || !isValidCoordinate({ lat, lon })) {
      return problemResponse("INVALID_INPUT", "lat / lon の指定が不正です。", {
        detail: "lat は -90〜90、lon は -180〜180 の数値で指定してください。",
        instance: context.url.pathname,
        requestId: context.requestId,
      });
    }
    const coordinate: Coordinate = { lat, lon };

    let result: ElevationLookupResult;
    try {
      // The request signal lets upstream tile fetches stop when the client
      // disconnects (Workers subrequest/CPU budget).
      result = await lookup(coordinate, {
        requestId: context.requestId,
        signal: context.request.signal,
      });
    } catch (error) {
      if (error instanceof UpstreamTileError) {
        return problemResponse("UPSTREAM_UNAVAILABLE", "標高データの取得に失敗しました。", {
          detail:
            "上流データソースへの問い合わせが失敗したため、データの有無を判定できません (Unknown is not Safe)。",
          instance: context.url.pathname,
          requestId: context.requestId,
        });
      }
      throw error; // Unexpected errors become 500 in the top-level handler.
    }

    if (result.elevationM === null || result.source === null) {
      return problemResponse("NO_COVERAGE", "対象地点に標高データがありません。", {
        detail: `確認したソース: ${result.attempted.join(", ")}。データが無いことは安全を意味しません。`,
        instance: context.url.pathname,
        requestId: context.requestId,
      });
    }

    return jsonResponse(
      {
        data: {
          coordinate,
          elevationM: result.elevationM,
          source: result.source,
          quality: pointQualityFor(result.source),
          provenance: result.provenance,
        },
        meta: {
          requestId: context.requestId,
          algorithmVersion: ALGORITHM_VERSION,
          generatedAt: new Date().toISOString(),
        },
      },
      200,
      context.requestId,
    );
  };
}

/**
 * Production transport: global fetch guarded by the GSI allowlist. Tile URLs
 * are built from constants plus clamped integers, so this check is defense in
 * depth rather than the only line (see adapters/gsi-dem.ts).
 */
const gsiTileFetcher: TileFetcher = async (url, ctx) => {
  const safety = checkUrlSafety(url, { allowedHosts: GSI_ALLOWED_HOSTS });
  if (!safety.allowed) {
    throw new Error(`Blocked outbound URL ${url.hostname}: ${safety.reason ?? "not allowed"}`);
  }
  const response = await fetch(
    url.toString(),
    ctx.signal !== undefined ? { signal: ctx.signal } : {},
  );
  const bytes = response.status === 200 ? new Uint8Array(await response.arrayBuffer()) : null;
  return { status: response.status, bytes };
};

export const handleElevation: RouteHandler = createElevationHandler((coordinate, ctx) =>
  lookupElevation(coordinate, ctx, { fetcher: gsiTileFetcher, now: () => new Date() }),
);
