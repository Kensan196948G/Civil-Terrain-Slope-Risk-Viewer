import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { App } from "./App";

// App mounts MapView, whose maplibre-gl needs canvas/WebGL. See MapView.test.tsx
// for the wiring tests; here the mock only has to keep App renderable in jsdom.
const mocks = vi.hoisted(() => {
  class FakeMap {
    readonly addControl = vi.fn();
    readonly remove = vi.fn();
    readonly setLayoutProperty = vi.fn();
    readonly isStyleLoaded = vi.fn((): boolean => false);
    getCenter = vi.fn((): { lat: number; lng: number } => ({ lat: 36.5, lng: 138.0 }));
    getZoom = vi.fn((): number => 5);
    on(): this {
      return this;
    }
    once(): this {
      return this;
    }
    off(): this {
      return this;
    }
  }
  return { FakeMap, AttributionControl: vi.fn(), NavigationControl: vi.fn() };
});

vi.mock("maplibre-gl", () => ({
  default: {
    Map: mocks.FakeMap,
    AttributionControl: mocks.AttributionControl,
    NavigationControl: mocks.NavigationControl,
  },
}));

describe("App", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "#");
  });

  it("renders the application title as a heading", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", {
        name: /Civil Terrain & Slope Risk Viewer/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders the map region and the layer switcher (SCR-01)", () => {
    render(<App />);
    expect(screen.getByRole("region", { name: "地図表示" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "標準地図" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "傾斜量図" })).not.toBeChecked();
  });

  it("writes the selected layers into the shareable URL hash", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("checkbox", { name: "傾斜量図" }));
    expect(window.location.hash).toBe("#view=5/36.5/138&base=std&ov=slope");

    fireEvent.click(screen.getByRole("radio", { name: "淡色地図" }));
    expect(window.location.hash).toBe("#view=5/36.5/138&base=pale&ov=slope");
  });

  it("restores layer selection from a shared URL hash", () => {
    window.history.replaceState(null, "", "#view=8/35.1/136.9&base=photo&ov=hillshade");
    render(<App />);

    expect(screen.getByRole("radio", { name: "写真" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "陰影起伏図" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "傾斜量図" })).not.toBeChecked();
  });
});
