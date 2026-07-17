import { describe, expect, it } from "vitest";
import worker from "./index.js";
import type { Env, ExecutionContext } from "./env.js";

const executionContext: ExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
};

const env: Env = {};

function callWorker(path: string, method = "GET"): Promise<Response> {
  const request = new Request(`https://api.example.com${path}`, { method });
  return worker.fetch(request, env, executionContext);
}

describe("routing", () => {
  it("returns a 400 Problem Details for an unknown path", async () => {
    const response = await callWorker("/api/v1/does-not-exist");

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/problem+json");

    const body = await response.json();
    expect(body.code).toBe("INVALID_INPUT");
    expect(body.requestId).toBeTypeOf("string");
  });

  it("does not match a health endpoint under the wrong method", async () => {
    const response = await callWorker("/api/v1/health/live", "POST");

    expect(response.status).toBe(400);
  });

  it("stamps an x-request-id header on responses", async () => {
    const response = await callWorker("/api/v1/health/live");

    expect(response.headers.get("x-request-id")).toBeTypeOf("string");
  });
});
