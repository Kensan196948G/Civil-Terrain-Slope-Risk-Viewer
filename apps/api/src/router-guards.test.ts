import { describe, expect, it } from "vitest";
import { route } from "./router.js";
import type { RequestContext } from "./router.js";
import type { Env, ExecutionContext } from "./env.js";

const executionContext: ExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
};

function makeContext(path: string, headers: Record<string, string> = {}): RequestContext {
  const request = new Request(`https://api.example.com${path}`, { headers });
  return {
    request,
    env: {} as Env,
    ctx: executionContext,
    url: new URL(request.url),
    requestId: "test-request-id",
  };
}

describe("route guards: rate limiting", () => {
  it("returns 429 RATE_LIMITED with Retry-After when denied", async () => {
    const response = await route(makeContext("/api/v1/health/live"), {
      rateLimit: () => ({ allowed: false, retryAfterSec: 7 }),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("7");
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("RATE_LIMITED");
  });

  it("uses CF-Connecting-IP as the rate limit key", async () => {
    let seenKey: string | null = null;
    const context = makeContext("/api/v1/health/live", {
      "cf-connecting-ip": "203.0.113.10",
    });
    await route(context, {
      rateLimit: (key) => {
        seenKey = key;
        return { allowed: true, retryAfterSec: 0 };
      },
    });

    expect(seenKey).toBe("203.0.113.10");
  });
});

describe("route guards: Cloudflare Access JWT", () => {
  const deny = async (): Promise<{ ok: false; reason: "UNAUTHENTICATED"; detail: string }> => ({
    ok: false,
    reason: "UNAUTHENTICATED",
    detail: "認証が必要です。",
  });

  it("returns 401 UNAUTHENTICATED for a protected route when verification fails", async () => {
    const response = await route(makeContext("/api/v1/elevation?lat=35&lon=139"), {
      accessVerify: deny,
    });

    expect(response.status).toBe(401);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("UNAUTHENTICATED");
  });

  it("returns 403 FORBIDDEN when the token is valid but not for this application", async () => {
    const response = await route(makeContext("/api/v1/elevation?lat=35&lon=139"), {
      accessVerify: async () => ({
        ok: false,
        reason: "FORBIDDEN",
        detail: "このアプリケーションのトークンではありません。",
      }),
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("FORBIDDEN");
  });

  it("lets requests through when verification succeeds", async () => {
    const response = await route(makeContext("/api/v1/health/ready"), {
      accessVerify: async () => ({
        ok: true,
        claims: {
          sub: "user:1",
          email: "test@example.com",
          name: "Test",
          aud: "aud",
          exp: 1,
          iat: 0,
          iss: "https://example.cloudflareaccess.com",
          groups: [],
        },
      }),
    });

    // 認証は通過し、DB未設定の本来の応答 (503) に到達する。
    expect(response.status).toBe(503);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("does not protect public routes (openapi security: [])", async () => {
    const response = await route(makeContext("/api/v1/capabilities"), {
      accessVerify: deny,
    });

    expect(response.status).toBe(200);
  });

  it("fails closed on protected routes when Access configuration is incomplete", async () => {
    const response = await route(makeContext("/api/v1/elevation?lat=35&lon=139"), {
      accessConfigError: "CF_ACCESS_TEAM_DOMAIN と CF_ACCESS_AUD は両方設定してください。",
    });

    expect(response.status).toBe(503);
    const body = (await response.json()) as { code: string; detail: string };
    expect(body.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(body.detail).toContain("CF_ACCESS_TEAM_DOMAIN");
  });

  it("still allows public routes when Access configuration is incomplete", async () => {
    const response = await route(makeContext("/api/v1/capabilities"), {
      accessConfigError: "CF_ACCESS_TEAM_DOMAIN と CF_ACCESS_AUD は両方設定してください。",
    });

    expect(response.status).toBe(200);
  });
});

describe("route guards: RBAC", () => {
  const okClaims = {
    sub: "user:1",
    email: "test@example.com",
    name: "Test",
    aud: "aud",
    exp: 1,
    iat: 0,
    iss: "https://example.cloudflareaccess.com",
    groups: [] as readonly string[],
  };

  it("allows a viewer on viewer-level routes", async () => {
    const response = await route(makeContext("/api/v1/health/ready"), {
      accessVerify: async () => ({ ok: true, claims: okClaims }),
      resolveRole: () => "viewer",
    });

    // 認証・RBACを通過し、DB未設定の本来の応答 (503) に到達する。
    expect(response.status).toBe(503);
  });

  it("emits an audit event for allowed requests on protected routes", async () => {
    const events: Array<{ outcome: string; role?: string; path: string; status?: number }> = [];
    const response = await route(makeContext("/api/v1/health/ready"), {
      accessVerify: async () => ({ ok: true, claims: okClaims }),
      resolveRole: () => "viewer",
      audit: (event) => events.push(event),
    });

    expect(response.status).toBe(503);
    expect(events[0]?.outcome).toBe("allowed");
    expect(events[0]?.path).toBe("/health/ready");
    expect(events[0]?.status).toBe(503);
  });

  it("audits a path without the query string (coordinates stay out of logs)", async () => {
    const events: Array<{ outcome: string; path: string }> = [];
    await route(makeContext("/api/v1/health/live?foo=bar"), {
      rateLimit: () => ({ allowed: false, retryAfterSec: 5 }),
      audit: (event) => events.push(event),
    });

    expect(events[0]?.path).toBe("/health/live");
    expect(events[0]?.path).not.toContain("foo=bar");
  });
});
