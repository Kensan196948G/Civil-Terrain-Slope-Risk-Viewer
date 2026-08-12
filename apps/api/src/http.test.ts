import { describe, expect, it } from "vitest";
import { applySecurityHeaders, jsonResponse } from "./http.js";

describe("applySecurityHeaders", () => {
  it("applies the standard security headers to every response", () => {
    const response = applySecurityHeaders(jsonResponse({ ok: true }, 200));

    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=63072000");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("allows Google Fonts styles and the MapLibre worker blob", () => {
    const csp = applySecurityHeaders(jsonResponse({ ok: true }, 200)).headers.get(
      "content-security-policy",
    )!;

    expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(csp).toContain("worker-src 'self' blob:");
    // 同一ディレクティブの重複はブラウザ互換の危険があるため許可しない。
    expect(csp.match(/style-src/g)?.length).toBe(1);
  });

  it("does not overwrite headers already set by a route handler", () => {
    const response = new Response("ok", { headers: { "x-content-type-options": "custom" } });
    const wrapped = applySecurityHeaders(response);

    expect(wrapped.headers.get("x-content-type-options")).toBe("custom");
  });
});
