import { describe, expect, it, vi } from "vitest";
import {
  ALL_LAYERS,
  BASE_LAYERS,
  OVERLAY_LAYERS,
  applyLayerSelection,
  buildMapStyle,
  isBaseLayerId,
  isOverlayLayerId,
} from "./layers";

describe("layer definitions", () => {
  it("gives every layer an attribution (要件: 出典表示率100%)", () => {
    for (const layer of ALL_LAYERS) {
      expect(layer.attribution, `${layer.id} must credit its source`).toContain("国土地理院");
    }
  });

  it("uses XYZ tile URL templates on the GSI host", () => {
    for (const layer of ALL_LAYERS) {
      expect(layer.tileUrlTemplate).toMatch(
        /^https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/[a-z]+\/\{z\}\/\{x\}\/\{y\}\.(png|jpg)$/,
      );
    }
  });

  it("has unique ids across base and overlay layers", () => {
    const ids = ALL_LAYERS.map((layer) => layer.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps zoom ranges within Web Mercator practical bounds", () => {
    for (const layer of ALL_LAYERS) {
      expect(layer.minZoom).toBeGreaterThanOrEqual(0);
      expect(layer.maxZoom).toBeGreaterThan(layer.minZoom);
      expect(layer.maxZoom).toBeLessThanOrEqual(18);
    }
  });

  it("narrows ids with the type guards", () => {
    expect(isBaseLayerId("std")).toBe(true);
    expect(isBaseLayerId("slope")).toBe(false);
    expect(isOverlayLayerId("slope")).toBe(true);
    expect(isOverlayLayerId("std")).toBe(false);
    expect(isBaseLayerId("unknown")).toBe(false);
    expect(isOverlayLayerId("unknown")).toBe(false);
  });
});

describe("buildMapStyle", () => {
  it("includes every layer as a raster source with attribution", () => {
    const style = buildMapStyle({ base: "std", overlays: [] });
    for (const layer of ALL_LAYERS) {
      const source = style.sources[layer.id];
      expect(source).toMatchObject({
        type: "raster",
        tiles: [layer.tileUrlTemplate],
        attribution: layer.attribution,
      });
    }
    expect(style.layers).toHaveLength(ALL_LAYERS.length);
  });

  it("shows only the selected base layer", () => {
    const style = buildMapStyle({ base: "pale", overlays: [] });
    const visibility = Object.fromEntries(
      style.layers.map((layer) => [layer.id, layer.layout?.visibility]),
    );
    expect(visibility["pale"]).toBe("visible");
    expect(visibility["std"]).toBe("none");
    expect(visibility["photo"]).toBe("none");
  });

  it("shows selected overlays and hides the rest", () => {
    const style = buildMapStyle({ base: "std", overlays: ["slope"] });
    const visibility = Object.fromEntries(
      style.layers.map((layer) => [layer.id, layer.layout?.visibility]),
    );
    expect(visibility["slope"]).toBe("visible");
    expect(visibility["hillshade"]).toBe("none");
  });

  it("orders base layers before overlays so overlays render on top", () => {
    const style = buildMapStyle({ base: "std", overlays: ["slope", "hillshade"] });
    const ids = style.layers.map((layer) => layer.id);
    const lastBaseIndex = Math.max(...BASE_LAYERS.map((layer) => ids.indexOf(layer.id)));
    const firstOverlayIndex = Math.min(...OVERLAY_LAYERS.map((layer) => ids.indexOf(layer.id)));
    expect(lastBaseIndex).toBeLessThan(firstOverlayIndex);
  });
});

describe("applyLayerSelection", () => {
  it("applies visibility for every layer through the minimal interface", () => {
    const setLayoutProperty = vi.fn();
    applyLayerSelection({ setLayoutProperty }, { base: "photo", overlays: ["hillshade"] });

    expect(setLayoutProperty).toHaveBeenCalledTimes(ALL_LAYERS.length);
    expect(setLayoutProperty).toHaveBeenCalledWith("photo", "visibility", "visible");
    expect(setLayoutProperty).toHaveBeenCalledWith("std", "visibility", "none");
    expect(setLayoutProperty).toHaveBeenCalledWith("pale", "visibility", "none");
    expect(setLayoutProperty).toHaveBeenCalledWith("hillshade", "visibility", "visible");
    expect(setLayoutProperty).toHaveBeenCalledWith("slope", "visibility", "none");
  });
});
