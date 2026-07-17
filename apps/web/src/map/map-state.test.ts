import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW_STATE, parseMapState, serializeMapState } from "./map-state";
import type { MapViewState } from "./map-state";

describe("serializeMapState / parseMapState", () => {
  it("round-trips a full state through the hash", () => {
    const state: MapViewState = {
      lat: 35.68124,
      lon: 139.76713,
      zoom: 12.5,
      base: "pale",
      overlays: ["slope", "hillshade"],
    };
    expect(parseMapState(`#${serializeMapState(state)}`)).toEqual(state);
  });

  it("serializes overlays in definition order regardless of selection order", () => {
    const a = serializeMapState({ ...DEFAULT_VIEW_STATE, overlays: ["hillshade", "slope"] });
    const b = serializeMapState({ ...DEFAULT_VIEW_STATE, overlays: ["slope", "hillshade"] });
    expect(a).toBe(b);
    expect(a).toContain("ov=slope,hillshade");
  });

  it("omits the overlay parameter when no overlay is selected", () => {
    expect(serializeMapState(DEFAULT_VIEW_STATE)).not.toContain("ov=");
  });

  it("returns the default state for an empty hash", () => {
    expect(parseMapState("")).toEqual(DEFAULT_VIEW_STATE);
    expect(parseMapState("#")).toEqual(DEFAULT_VIEW_STATE);
  });

  it("falls back to defaults for a malformed view", () => {
    expect(parseMapState("#view=abc")).toEqual(DEFAULT_VIEW_STATE);
    expect(parseMapState("#view=1/2")).toEqual(DEFAULT_VIEW_STATE);
    expect(parseMapState("#view=NaN/36/138")).toEqual(DEFAULT_VIEW_STATE);
  });

  it("falls back to defaults for empty view segments (Number('') would become 0)", () => {
    expect(parseMapState("#view=//")).toEqual(DEFAULT_VIEW_STATE);
    expect(parseMapState("#view=5//138")).toEqual(DEFAULT_VIEW_STATE);
    expect(parseMapState("#view=5/ /138")).toEqual(DEFAULT_VIEW_STATE);
  });

  it("clamps out-of-range coordinates and zoom instead of failing", () => {
    const state = parseMapState("#view=99/95/-999&base=std");
    expect(state.zoom).toBe(18);
    expect(state.lat).toBe(90);
    expect(state.lon).toBe(-180);
  });

  it("drops unknown base and overlay ids from shared URLs", () => {
    const state = parseMapState("#view=5/36.5/138&base=evil&ov=slope,unknown,slope");
    expect(state.base).toBe(DEFAULT_VIEW_STATE.base);
    expect(state.overlays).toEqual(["slope"]);
  });

  it("rounds coordinates to ~1m precision to keep URLs stable", () => {
    const serialized = serializeMapState({
      ...DEFAULT_VIEW_STATE,
      lat: 35.123456789,
      lon: 139.987654321,
      zoom: 12.3456,
    });
    expect(serialized).toContain("view=12.35/35.12346/139.98765");
  });

  it("accepts percent-encoded legacy hashes as well", () => {
    const state = parseMapState(
      "#view=12.35%2F35.12346%2F139.98765&base=pale&ov=slope%2Chillshade",
    );
    expect(state.zoom).toBe(12.35);
    expect(state.lat).toBe(35.12346);
    expect(state.base).toBe("pale");
    expect(state.overlays).toEqual(["slope", "hillshade"]);
  });
});
