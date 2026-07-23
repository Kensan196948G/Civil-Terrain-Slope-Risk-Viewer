import { describe, expect, it, vi } from "vitest";
import { fetchElevation } from "./elevation-client";

const TOKYO = { lat: 35.681236, lon: 139.767125 };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchElevation", () => {
  it("maps a 200 envelope to ok with the elevation point", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        data: {
          coordinate: TOKYO,
          elevationM: 3.2,
          source: "DEM5A",
          quality: { grade: "A", coverage: "FULL" },
          provenance: [
            {
              sourceName: "国土地理院 標高タイル DEM5A",
              sourceUrl: "https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/15/1/2.png",
              termsUrl: "https://maps.gsi.go.jp/development/ichiran.html",
              retrievedAt: "2026-07-17T00:00:00.000Z",
            },
          ],
        },
        meta: { requestId: "r", algorithmVersion: "0.1.0", generatedAt: "" },
      }),
    );

    const result = await fetchElevation(TOKYO, fetchImpl as unknown as typeof fetch);

    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.point.elevationM).toBe(3.2);
      expect(result.point.source).toBe("DEM5A");
    }
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining("lat=35.681236"));
  });

  it("maps 404 to no-coverage (distinct from errors: Unknown is not Safe)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(404, { code: "NO_COVERAGE" }));
    expect(await fetchElevation(TOKYO, fetchImpl as unknown as typeof fetch)).toEqual({
      kind: "no-coverage",
    });
  });

  it("maps 503 to unavailable", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(503, { code: "UPSTREAM_UNAVAILABLE" }));
    expect(await fetchElevation(TOKYO, fetchImpl as unknown as typeof fetch)).toEqual({
      kind: "unavailable",
    });
  });

  it("maps other HTTP failures and network errors to error", async () => {
    const http500 = vi.fn(async () => jsonResponse(500, { code: "INTERNAL_ERROR" }));
    expect(await fetchElevation(TOKYO, http500 as unknown as typeof fetch)).toMatchObject({
      kind: "error",
      message: "HTTP 500",
    });

    const network = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await fetchElevation(TOKYO, network as unknown as typeof fetch)).toMatchObject({
      kind: "error",
    });
  });

  it("treats a malformed 200 body as an error, not as data", async () => {
    const badShape = vi.fn(async () => jsonResponse(200, { data: { elevationM: "high" } }));
    expect(await fetchElevation(TOKYO, badShape as unknown as typeof fetch)).toMatchObject({
      kind: "error",
      message: "unexpected response shape",
    });

    const badJson = vi.fn(
      async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    expect(await fetchElevation(TOKYO, badJson as unknown as typeof fetch)).toMatchObject({
      kind: "error",
    });
  });
});
