import { describe, expect, it, vi } from "vitest";
import { UpstreamTileError, lookupElevation } from "@civil-terrain/adapters";
import type { ElevationLookupResult, TileFetcher } from "@civil-terrain/adapters";
import { encodePng } from "@civil-terrain/geo";
import type { Env, ExecutionContext } from "../env.js";
import type { RequestContext } from "../router.js";
import { ALGORITHM_VERSION, createElevationHandler } from "./elevation.js";

const EXECUTION_CONTEXT: ExecutionContext = {
  waitUntil: () => undefined,
  passThroughOnException: () => undefined,
};

function contextFor(query: string): RequestContext {
  const url = new URL(`https://api.example/api/v1/elevation${query}`);
  return {
    request: new Request(url),
    env: {} as Env,
    ctx: EXECUTION_CONTEXT,
    url,
    requestId: "req-elevation-test",
  };
}

const FOUND: ElevationLookupResult = {
  elevationM: 12.5,
  source: "DEM5C",
  coverage: "FULL",
  attempted: ["DEM5A", "DEM5B", "DEM5C"],
  provenance: [
    {
      sourceId: "gsi_dem5c_png",
      sourceName: "国土地理院 標高タイル DEM5C",
      sourceUrl: "https://cyberjapandata.gsi.go.jp/xyz/dem5c_png/15/29105/12903.png",
      termsUrl: "https://maps.gsi.go.jp/development/ichiran.html",
      retrievedAt: "2026-07-17T00:00:00.000Z",
      resolutionM: 5,
      processed: true,
    },
  ],
};

describe("createElevationHandler", () => {
  it("returns the elevation with quality and provenance in a SuccessEnvelope", async () => {
    const handler = createElevationHandler(() => Promise.resolve(FOUND));

    const response = await handler(contextFor("?lat=35.681236&lon=139.767125"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("x-request-id")).toBe("req-elevation-test");

    const body = (await response.json()) as {
      data: {
        coordinate: { lat: number; lon: number };
        elevationM: number;
        source: string;
        quality: { grade: string; coverage: string; sourceMix: Record<string, number> };
        provenance: unknown[];
      };
      meta: { requestId: string; algorithmVersion: string; generatedAt: string };
    };
    expect(body.data.coordinate).toEqual({ lat: 35.681236, lon: 139.767125 });
    expect(body.data.elevationM).toBe(12.5);
    expect(body.data.source).toBe("DEM5C");
    expect(body.data.quality).toMatchObject({ grade: "C", coverage: "FULL" });
    expect(body.data.quality.sourceMix).toMatchObject({ DEM5C: 1, DEM5A: 0 });
    expect(body.data.provenance).toHaveLength(1);
    expect(body.meta.requestId).toBe("req-elevation-test");
    expect(body.meta.algorithmVersion).toBe(ALGORITHM_VERSION);
    expect(new Date(body.meta.generatedAt).getTime()).not.toBeNaN();
  });

  it.each([
    ["", "missing both"],
    ["?lat=35.6", "missing lon"],
    ["?lat=abc&lon=139.7", "non-numeric lat"],
    ["?lat=91&lon=139.7", "latitude out of range"],
    ["?lat=35.6&lon=180.5", "longitude out of range"],
    ["?lat=NaN&lon=139.7", "NaN latitude"],
  ])("rejects invalid input %s (%s) with 400 INVALID_INPUT", async (query) => {
    const lookup = vi.fn();
    const handler = createElevationHandler(lookup);

    const response = await handler(contextFor(query));
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    const body = (await response.json()) as { code: string; requestId: string };
    expect(body.code).toBe("INVALID_INPUT");
    expect(body.requestId).toBe("req-elevation-test");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("maps a data-less lookup to 404 NO_COVERAGE without implying safety", async () => {
    const handler = createElevationHandler(() =>
      Promise.resolve({
        elevationM: null,
        source: null,
        coverage: "NONE",
        attempted: ["DEM5A", "DEM5B", "DEM5C", "DEM10B"],
        provenance: [],
      } satisfies ElevationLookupResult),
    );

    const response = await handler(contextFor("?lat=35.6&lon=139.7"));
    expect(response.status).toBe(404);
    const body = (await response.json()) as { code: string; detail: string };
    expect(body.code).toBe("NO_COVERAGE");
    expect(body.detail).toContain("DEM10B");
    expect(body.detail).toContain("安全を意味しません");
  });

  it("maps UpstreamTileError to 503 UPSTREAM_UNAVAILABLE", async () => {
    const handler = createElevationHandler(() =>
      Promise.reject(new UpstreamTileError("DEM5A: fetch failed", ["DEM5A"])),
    );

    const response = await handler(contextFor("?lat=35.6&lon=139.7"));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("propagates the request abort signal into the lookup context", async () => {
    const seen: { signal: AbortSignal | undefined } = { signal: undefined };
    const handler = createElevationHandler((_coordinate, ctx) => {
      seen.signal = ctx.signal;
      return Promise.resolve(FOUND);
    });

    const context = contextFor("?lat=35.6&lon=139.7");
    await handler(context);
    expect(seen.signal).toBe(context.request.signal);
  });

  it("rethrows unexpected errors for the top-level 500 handler", async () => {
    const handler = createElevationHandler(() => Promise.reject(new Error("boom")));
    await expect(handler(contextFor("?lat=35.6&lon=139.7"))).rejects.toThrow("boom");
  });

  it("serves a value end-to-end through the real lookup with a fixture tile", async () => {
    // Full pipeline: route -> lookupElevation -> PNG decode -> spec 8.2 decode.
    const uniform = Array.from({ length: 256 }, () =>
      Array.from({ length: 256 }, () => [0, 4, 226] as const),
    );
    const bytes = await encodePng(uniform);
    const fetcher: TileFetcher = () => Promise.resolve({ status: 200, bytes });
    const handler = createElevationHandler((coordinate, ctx) =>
      lookupElevation(coordinate, ctx, {
        fetcher,
        priority: ["DEM5A"],
        now: () => new Date("2026-07-17T00:00:00.000Z"),
      }),
    );

    const response = await handler(contextFor("?lat=35.681236&lon=139.767125"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { elevationM: number; source: string; provenance: { sourceUrl: string }[] };
    };
    expect(body.data.elevationM).toBe(12.5);
    expect(body.data.source).toBe("DEM5A");
    expect(body.data.provenance[0]?.sourceUrl).toContain("dem5a_png/15/");
  });
});
