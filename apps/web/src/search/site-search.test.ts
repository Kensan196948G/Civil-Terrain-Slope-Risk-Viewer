import { describe, expect, it } from "vitest";
import { LANDMARKS, parseSearchQuery } from "./site-search";

describe("parseSearchQuery", () => {
  it("treats blank input as empty (no-op)", () => {
    expect(parseSearchQuery("")).toEqual({ kind: "empty" });
    expect(parseSearchQuery("   ")).toEqual({ kind: "empty" });
  });

  it("parses a comma-separated coordinate", () => {
    expect(parseSearchQuery("35.36,138.72")).toEqual({
      kind: "coordinate",
      coordinate: { lat: 35.36, lon: 138.72 },
    });
  });

  it("parses a space-separated coordinate", () => {
    expect(parseSearchQuery("35.36 138.72")).toEqual({
      kind: "coordinate",
      coordinate: { lat: 35.36, lon: 138.72 },
    });
  });

  it("parses a negative coordinate", () => {
    expect(parseSearchQuery("-33.86, 151.20")).toEqual({
      kind: "coordinate",
      coordinate: { lat: -33.86, lon: 151.2 },
    });
  });

  it("rejects out-of-range coordinates as not-found", () => {
    expect(parseSearchQuery("100, 200")).toEqual({ kind: "not-found" });
    expect(parseSearchQuery("35.0, 999")).toEqual({ kind: "not-found" });
  });

  it("resolves a landmark by name substring", () => {
    const result = parseSearchQuery("富士山");
    expect(result.kind).toBe("place");
    if (result.kind === "place") {
      expect(result.landmark.name).toContain("富士山");
      expect(result.coordinate).toEqual({ lat: 35.3606, lon: 138.7274 });
    }
  });

  it("resolves a landmark by prefecture substring", () => {
    const result = parseSearchQuery("北海道");
    expect(result.kind).toBe("place");
    if (result.kind === "place") {
      expect(result.landmark.pref).toContain("北海道");
    }
  });

  it("returns not-found for an unknown place", () => {
    expect(parseSearchQuery("存在しない地名XYZ")).toEqual({ kind: "not-found" });
  });

  it("exposes a non-empty landmark gazetteer", () => {
    expect(LANDMARKS.length).toBeGreaterThan(0);
    for (const place of LANDMARKS) {
      expect(place.lat).toBeGreaterThanOrEqual(-90);
      expect(place.lat).toBeLessThanOrEqual(90);
      expect(place.lon).toBeGreaterThanOrEqual(-180);
      expect(place.lon).toBeLessThanOrEqual(180);
    }
  });
});
