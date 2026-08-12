import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicDir = existsSync(resolve("apps/web/public"))
  ? resolve("apps/web/public")
  : resolve("public");

describe("PWA manifest", () => {
  it("is valid JSON with the required install metadata", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(publicDir, "manifest.webmanifest"), "utf8"),
    ) as Record<string, unknown>;

    expect(manifest["name"]).toBe("Civil Terrain & Slope Risk Viewer");
    expect(manifest["short_name"]).toBe("Terrain Risk");
    expect(manifest["start_url"]).toBe("/");
    expect(manifest["scope"]).toBe("/");
    expect(manifest["display"]).toBe("standalone");
    expect(manifest["lang"]).toBe("ja");
  });

  it("references generated PNG icons of the declared sizes", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(publicDir, "manifest.webmanifest"), "utf8"),
    ) as { icons?: readonly { src?: string; sizes?: string }[] };

    const sizes = new Set((manifest.icons ?? []).map((icon) => `${icon.src}:${icon.sizes}`));
    expect(sizes).toContain("/icon-192.png:192x192");
    expect(sizes).toContain("/icon-512.png:512x512");
  });
});

describe("PWA icons", () => {
  it("are real PNG files with the declared dimensions", () => {
    for (const [file, size] of [
      ["icon-192.png", 192],
      ["icon-512.png", 512],
    ] as const) {
      const buffer = readFileSync(resolve(publicDir, file));
      expect(buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(buffer.readUInt32BE(16)).toBe(size);
      expect(buffer.readUInt32BE(20)).toBe(size);
    }
  });
});

describe("Service Worker", () => {
  it("caches the app shell and never caches API responses", () => {
    const source = readFileSync(resolve(publicDir, "sw.js"), "utf8");

    expect(source).toContain("civil-terrain-shell-v1");
    expect(source).toContain('"/index.html"');
    expect(source).toContain('url.pathname.startsWith("/api/")');
    expect(source).toContain('request.method !== "GET"');
    expect(source).toContain('cache.put("/index.html", copy)');
  });
});
