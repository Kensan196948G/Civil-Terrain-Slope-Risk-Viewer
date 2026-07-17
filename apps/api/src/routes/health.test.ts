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

describe("GET /api/v1/health/live", () => {
  it("returns 200 with a bare { status: ok } body", async () => {
    const response = await callWorker("/api/v1/health/live");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ status: "ok" });
  });
});

describe("GET /api/v1/health/ready", () => {
  it("returns 200 and status ok when the database is configured", async () => {
    const response = await callWorker("/api/v1/health/ready", {
      DATABASE_URL: "postgres://user:pass@db.example.com:5432/app",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      checks: { database: true },
    });
  });

  it("prefers the Hyperdrive connection string over DATABASE_URL", async () => {
    const response = await callWorker("/api/v1/health/ready", {
      HYPERDRIVE: { connectionString: "postgresql://user:pass@hyperdrive/app" },
    });

    expect(response.status).toBe(200);
  });

  it("returns a 503 Problem Details when no database is configured", async () => {
    const response = await callWorker("/api/v1/health/ready");

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("application/problem+json");

    const body = await response.json();
    expect(body.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(body.status).toBe(503);
  });

  it("returns 503 when the configured connection string is not PostgreSQL", async () => {
    const response = await callWorker("/api/v1/health/ready", {
      DATABASE_URL: "mysql://user:pass@db.example.com:3306/app",
    });

    expect(response.status).toBe(503);
  });
});
