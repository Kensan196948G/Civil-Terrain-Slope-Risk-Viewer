import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapView } from "./MapView";
import { ALL_LAYERS } from "./layers";
import type { MapViewState } from "./map-state";

// maplibre-gl needs a real canvas/WebGL context, which jsdom does not provide.
// The mock mirrors the behaviours the wiring depends on — including the async
// style load: the real Style.setLayoutProperty throws until the style loads,
// so the fake does too. That keeps "touched the style too early" bugs visible
// in unit tests instead of being hidden by a no-op mock.
const mocks = vi.hoisted(() => {
  class FakeMap {
    static instances: FakeMap[] = [];
    readonly options: Record<string, unknown>;
    readonly handlers = new Map<string, Set<(arg?: unknown) => void>>();
    readonly onceHandlers = new Map<string, Set<(arg?: unknown) => void>>();
    readonly addControl = vi.fn();
    readonly remove = vi.fn();
    styleLoaded = false;
    readonly isStyleLoaded = vi.fn((): boolean => this.styleLoaded);
    readonly setLayoutProperty = vi.fn((): void => {
      if (!this.styleLoaded) {
        throw new Error("Style is not done loading.");
      }
    });
    getCenter = vi.fn((): { lat: number; lng: number } => ({ lat: 40.0, lng: 141.0 }));
    getZoom = vi.fn((): number => 9);
    readonly flyTo = vi.fn();
    readonly sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
    readonly addSource = vi.fn((id: string): void => {
      if (!this.styleLoaded) {
        throw new Error("Style is not done loading.");
      }
      this.sources.set(id, { setData: vi.fn() });
    });
    readonly addLayer = vi.fn((): void => {
      if (!this.styleLoaded) {
        throw new Error("Style is not done loading.");
      }
    });
    getSource(id: string): { setData: ReturnType<typeof vi.fn> } | undefined {
      return this.sources.get(id);
    }

    constructor(options: Record<string, unknown>) {
      this.options = options;
      FakeMap.instances.push(this);
    }

    on(event: string, handler: (arg?: unknown) => void): this {
      this.listeners(this.handlers, event).add(handler);
      return this;
    }

    once(event: string, handler: (arg?: unknown) => void): this {
      this.listeners(this.onceHandlers, event).add(handler);
      return this;
    }

    off(event: string, handler: (arg?: unknown) => void): this {
      this.handlers.get(event)?.delete(handler);
      this.onceHandlers.get(event)?.delete(handler);
      return this;
    }

    fire(event: string, arg?: unknown): void {
      if (event === "load") {
        this.styleLoaded = true;
      }
      for (const handler of this.handlers.get(event) ?? []) {
        handler(arg);
      }
      const once = this.onceHandlers.get(event);
      if (once !== undefined) {
        this.onceHandlers.delete(event);
        for (const handler of once) {
          handler(arg);
        }
      }
    }

    private listeners(
      store: Map<string, Set<(arg?: unknown) => void>>,
      event: string,
    ): Set<(arg?: unknown) => void> {
      let set = store.get(event);
      if (set === undefined) {
        set = new Set();
        store.set(event, set);
      }
      return set;
    }
  }

  return {
    FakeMap,
    AttributionControl: vi.fn(),
    NavigationControl: vi.fn(),
  };
});

vi.mock("maplibre-gl", () => ({
  default: {
    Map: mocks.FakeMap,
    AttributionControl: mocks.AttributionControl,
    NavigationControl: mocks.NavigationControl,
  },
}));

const INITIAL_VIEW: MapViewState = {
  lat: 36.5,
  lon: 138.0,
  zoom: 5,
  base: "std",
  overlays: [],
};

function mountedMap(): InstanceType<typeof mocks.FakeMap> {
  const map = mocks.FakeMap.instances[0];
  if (map === undefined) {
    throw new Error("MapView did not construct a map");
  }
  return map;
}

describe("MapView", () => {
  beforeEach(() => {
    mocks.FakeMap.instances = [];
    mocks.AttributionControl.mockClear();
    mocks.NavigationControl.mockClear();
  });

  it("renders an accessible map container", () => {
    render(<MapView view={INITIAL_VIEW} onViewChange={vi.fn()} />);
    expect(screen.getByRole("region", { name: "地図" })).toBeInTheDocument();
  });

  it("initializes the map once with the initial view and all layers", () => {
    const { rerender } = render(<MapView view={INITIAL_VIEW} onViewChange={vi.fn()} />);
    rerender(<MapView view={{ ...INITIAL_VIEW, overlays: ["slope"] }} onViewChange={vi.fn()} />);

    expect(mocks.FakeMap.instances).toHaveLength(1);
    const map = mountedMap();
    expect(map.options["center"]).toEqual([138.0, 36.5]);
    expect(map.options["zoom"]).toBe(5);
    const style = map.options["style"] as { layers: readonly unknown[] };
    expect(style.layers).toHaveLength(ALL_LAYERS.length);
  });

  it("adds a permanently expanded attribution control (出典常設)", () => {
    render(<MapView view={INITIAL_VIEW} onViewChange={vi.fn()} />);
    expect(mocks.AttributionControl).toHaveBeenCalledWith({ compact: false });
    expect(mountedMap().addControl).toHaveBeenCalledTimes(2);
  });

  it("does not touch the style before it finishes loading (regression: 'Style is not done loading.')", () => {
    render(<MapView view={{ ...INITIAL_VIEW, overlays: ["slope"] }} onViewChange={vi.fn()} />);
    const map = mountedMap();

    expect(map.setLayoutProperty).not.toHaveBeenCalled();

    map.fire("load");
    expect(map.setLayoutProperty).toHaveBeenCalledWith("slope", "visibility", "visible");
  });

  it("applies only the latest selection when the style loads after quick toggles", () => {
    const { rerender } = render(<MapView view={INITIAL_VIEW} onViewChange={vi.fn()} />);
    rerender(<MapView view={{ ...INITIAL_VIEW, base: "pale" }} onViewChange={vi.fn()} />);
    const map = mountedMap();

    map.fire("load");

    // The stale pre-toggle listener must be released; the whole set is applied once.
    expect(map.setLayoutProperty).toHaveBeenCalledTimes(ALL_LAYERS.length);
    expect(map.setLayoutProperty).toHaveBeenCalledWith("pale", "visibility", "visible");
    expect(map.setLayoutProperty).toHaveBeenCalledWith("std", "visibility", "none");
  });

  it("applies layer selection changes as visibility updates once loaded", () => {
    const { rerender } = render(<MapView view={INITIAL_VIEW} onViewChange={vi.fn()} />);
    const map = mountedMap();
    map.fire("load");
    map.setLayoutProperty.mockClear();

    rerender(
      <MapView
        view={{ ...INITIAL_VIEW, base: "pale", overlays: ["slope"] }}
        onViewChange={vi.fn()}
      />,
    );

    expect(map.setLayoutProperty).toHaveBeenCalledWith("pale", "visibility", "visible");
    expect(map.setLayoutProperty).toHaveBeenCalledWith("std", "visibility", "none");
    expect(map.setLayoutProperty).toHaveBeenCalledWith("slope", "visibility", "visible");
  });

  it("skips reapplying layers when only the camera view changes", () => {
    const { rerender } = render(<MapView view={INITIAL_VIEW} onViewChange={vi.fn()} />);
    const map = mountedMap();
    map.fire("load");
    map.setLayoutProperty.mockClear();

    rerender(
      <MapView view={{ ...INITIAL_VIEW, lat: 40.0, lon: 141.0, zoom: 9 }} onViewChange={vi.fn()} />,
    );

    expect(map.setLayoutProperty).not.toHaveBeenCalled();
  });

  it("reports the map position after user movement, keeping layer selection", () => {
    const onViewChange = vi.fn();
    render(
      <MapView view={{ ...INITIAL_VIEW, overlays: ["hillshade"] }} onViewChange={onViewChange} />,
    );

    mountedMap().fire("moveend");

    expect(onViewChange).toHaveBeenCalledWith({
      lat: 40.0,
      lon: 141.0,
      zoom: 9,
      base: "std",
      overlays: ["hillshade"],
    });
  });

  it("reports clicked coordinates through onMapClick (FR-001)", () => {
    const onMapClick = vi.fn();
    render(<MapView view={INITIAL_VIEW} onViewChange={vi.fn()} onMapClick={onMapClick} />);

    mountedMap().fire("click", { lngLat: { lat: 35.68, lng: 139.76 } });

    expect(onMapClick).toHaveBeenCalledWith({ lat: 35.68, lon: 139.76 });
  });

  it("removes the map on unmount", () => {
    const { unmount } = render(<MapView view={INITIAL_VIEW} onViewChange={vi.fn()} />);
    unmount();
    expect(mountedMap().remove).toHaveBeenCalledTimes(1);
  });

  it("adds the selected-point marker once the style is loaded", () => {
    const { rerender } = render(<MapView view={INITIAL_VIEW} onViewChange={vi.fn()} />);
    const map = mountedMap();
    map.fire("load");

    rerender(
      <MapView view={INITIAL_VIEW} onViewChange={vi.fn()} selectedPoint={{ lat: 35, lon: 139 }} />,
    );

    expect(map.addSource).toHaveBeenCalledWith(
      "selected-point",
      expect.objectContaining({ type: "geojson" }),
    );
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "selected-point-circle", type: "circle" }),
    );
  });

  it("defers the marker until the style loads (regression: 'Style is not done loading.')", () => {
    render(
      <MapView view={INITIAL_VIEW} onViewChange={vi.fn()} selectedPoint={{ lat: 35, lon: 139 }} />,
    );
    const map = mountedMap();

    expect(map.addSource).not.toHaveBeenCalled();

    map.fire("load");
    expect(map.addSource).toHaveBeenCalledTimes(1);
  });

  it("updates the existing marker source on subsequent selections", () => {
    const { rerender } = render(<MapView view={INITIAL_VIEW} onViewChange={vi.fn()} />);
    const map = mountedMap();
    map.fire("load");

    rerender(
      <MapView view={INITIAL_VIEW} onViewChange={vi.fn()} selectedPoint={{ lat: 35, lon: 139 }} />,
    );
    rerender(
      <MapView view={INITIAL_VIEW} onViewChange={vi.fn()} selectedPoint={{ lat: 36, lon: 140 }} />,
    );

    expect(map.addSource).toHaveBeenCalledTimes(1);
    const source = map.getSource("selected-point");
    expect(source?.setData).toHaveBeenCalledWith(
      expect.objectContaining({
        geometry: { type: "Point", coordinates: [140, 36] },
      }),
    );
  });

  it("flies to a focus request (search)", () => {
    const { rerender } = render(<MapView view={INITIAL_VIEW} onViewChange={vi.fn()} />);

    rerender(
      <MapView
        view={INITIAL_VIEW}
        onViewChange={vi.fn()}
        focus={{ coordinate: { lat: 35.36, lon: 138.72 }, zoom: 11, token: 1 }}
      />,
    );

    expect(mountedMap().flyTo).toHaveBeenCalledWith({
      center: [138.72, 35.36],
      zoom: 11,
      duration: 800,
    });
  });
});
