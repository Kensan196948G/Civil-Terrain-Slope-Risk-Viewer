import { describe, expect, it } from "vitest";
import worker from "../index.js";
import type { Env, ExecutionContext } from "../env.js";

const executionContext: ExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
};

function callWorker(path: string, env: Env = {}): Promise<Response> {
  const request = new Request(`https://api.example.com${path}`);
  return worker.fetch(request, env, executionContext);
}

describe("GET /api/v1/capabilities", () => {
  it("returns implemented capabilities with metadata", async () => {
    const response = await callWorker("/api/v1/capabilities");

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { postgis: boolean; layers: string[]; exportFormats: string[] };
      meta: { requestId: string };
    };
    expect(body.data.postgis).toBe(false);
    expect(body.data.layers).toEqual(["std", "pale", "photo", "slope", "hillshade"]);
    expect(body.data.exportFormats).toEqual(["markdown", "csv", "json"]);
    expect(body.meta.requestId).toBeTypeOf("string");
  });
});

describe("GET /api/v1/sources", () => {
  it("returns GSI DEM sources with terms and resolution", async () => {
    const response = await callWorker("/api/v1/sources");

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: Array<{
        sourceKey: string;
        sourceName: string;
        termsUrl: string;
        resolutionM: number;
        cacheTtlSec: number;
      }>;
    };
    expect(body.data.length).toBeGreaterThanOrEqual(4);
    const dem5a = body.data.find((source) => source.sourceKey === "DEM5A");
    expect(dem5a).toBeDefined();
    expect(dem5a?.resolutionM).toBe(5);
    expect(dem5a?.termsUrl).toContain("gsi.go.jp");
    expect(dem5a?.cacheTtlSec).toBeGreaterThan(0);
  });
});
