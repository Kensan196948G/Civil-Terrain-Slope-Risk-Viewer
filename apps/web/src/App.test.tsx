import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { App } from "./App";
import { fetchElevation } from "./elevation/elevation-client";
import type { ElevationResult } from "./elevation/elevation-client";

// App mounts MapView, whose maplibre-gl needs canvas/WebGL. See MapView.test.tsx
// for the wiring tests; this mock keeps App renderable in jsdom and captures
// event handlers so tests can fire map clicks.
const mocks = vi.hoisted(() => {
  class FakeMap {
    static instances: FakeMap[] = [];
    readonly handlers = new Map<string, (arg?: unknown) => void>();
    readonly addControl = vi.fn();
    readonly remove = vi.fn();
    readonly setLayoutProperty = vi.fn();
    readonly isStyleLoaded = vi.fn((): boolean => false);
    getCenter = vi.fn((): { lat: number; lng: number } => ({ lat: 36.5, lng: 138.0 }));
    getZoom = vi.fn((): number => 5);

    constructor() {
      FakeMap.instances.push(this);
    }

    on(event: string, handler: (arg?: unknown) => void): this {
      this.handlers.set(event, handler);
      return this;
    }
    once(): this {
      return this;
    }
    off(): this {
      return this;
    }
    fire(event: string, arg?: unknown): void {
      this.handlers.get(event)?.(arg);
    }
  }
  return { FakeMap, AttributionControl: vi.fn(), NavigationControl: vi.fn() };
});

vi.mock("./elevation/elevation-client", () => ({
  fetchElevation: vi.fn(),
}));

const fetchElevationMock = vi.mocked(fetchElevation);

function okResult(elevationM: number): ElevationResult {
  return {
    kind: "ok",
    point: {
      coordinate: { lat: 0, lon: 0 },
      elevationM,
      source: "DEM5A",
      quality: { grade: "A", coverage: "FULL" },
    },
  };
}

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
    mocks.FakeMap.instances = [];
    fetchElevationMock.mockReset();
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

  it("shows the elevation panel prompt before any click", () => {
    render(<App />);
    expect(screen.getByRole("region", { name: "地点標高" })).toHaveTextContent(
      "地図をクリックすると",
    );
  });

  it("renders only the latest click's elevation when responses arrive out of order (M1回帰)", async () => {
    let resolveFirst: (result: ElevationResult) => void = () => undefined;
    let resolveSecond: (result: ElevationResult) => void = () => undefined;
    fetchElevationMock
      .mockImplementationOnce(
        () =>
          new Promise<ElevationResult>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<ElevationResult>((resolve) => {
            resolveSecond = resolve;
          }),
      );

    render(<App />);
    const map = mocks.FakeMap.instances[0];
    expect(map).toBeDefined();

    act(() => {
      map?.fire("click", { lngLat: { lat: 10, lng: 20 } });
    });
    act(() => {
      map?.fire("click", { lngLat: { lat: 30, lng: 40 } });
    });

    // The SECOND (latest) click resolves first...
    await act(async () => {
      resolveSecond(okResult(222));
    });
    expect(screen.getByText("222.00 m")).toBeInTheDocument();

    // ...then the stale FIRST response arrives late and must be discarded.
    await act(async () => {
      resolveFirst(okResult(111));
    });
    expect(screen.getByText("222.00 m")).toBeInTheDocument();
    expect(screen.queryByText("111.00 m")).not.toBeInTheDocument();
  });

  it("restores layer selection from a shared URL hash", () => {
    window.history.replaceState(null, "", "#view=8/35.1/136.9&base=photo&ov=hillshade");
    render(<App />);

    expect(screen.getByRole("radio", { name: "写真" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "陰影起伏図" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "傾斜量図" })).not.toBeChecked();
  });
});
