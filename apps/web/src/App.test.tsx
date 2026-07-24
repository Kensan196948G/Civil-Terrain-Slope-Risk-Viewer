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
    readonly flyTo = vi.fn();
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

// 解析サービスはネットワーク (GSIタイル) に出るため必ずモックする。
// タブUIが参照する定数はモックにも実体を持たせる。
vi.mock("./analysis/terrain-service", () => ({
  analyzeTerrain: vi.fn(),
  TERRAIN_CELL_M: 5,
  TERRAIN_GRID_SIZE: 33,
}));
vi.mock("./analysis/section-service", () => ({
  analyzeSection: vi.fn(),
  MIN_SECTION_LENGTH_M: 30,
  MAX_SECTION_LENGTH_M: 20000,
}));

import { analyzeTerrain } from "./analysis/terrain-service";
import { analyzeSection } from "./analysis/section-service";

const fetchElevationMock = vi.mocked(fetchElevation);
const analyzeTerrainMock = vi.mocked(analyzeTerrain);
const analyzeSectionMock = vi.mocked(analyzeSection);

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
    analyzeTerrainMock.mockReset();
    analyzeTerrainMock.mockResolvedValue({ kind: "no-coverage" });
    analyzeSectionMock.mockReset();
    analyzeSectionMock.mockResolvedValue({ kind: "no-coverage" });
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

  it("switches to an analysis tab and returns via the empty-state action", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "地形分析" }));
    expect(screen.getByText("地点が未選択です")).toBeInTheDocument();
    // The design mock's fabricated terrain figures must not appear.
    expect(screen.queryByText(/14\.8/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "地図タブへ" }));
    expect(screen.getByRole("radio", { name: "標準地図" })).toBeChecked();
  });

  it("resolves a landmark search: flies the map and fetches the elevation", async () => {
    fetchElevationMock.mockResolvedValue(okResult(777));
    render(<App />);

    fireEvent.change(screen.getByRole("textbox", { name: "地点検索" }), {
      target: { value: "富士山" },
    });
    fireEvent.submit(screen.getByRole("search"));

    const map = mocks.FakeMap.instances[0];
    expect(map?.flyTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [138.7274, 35.3606], zoom: 11 }),
    );
    expect(fetchElevationMock).toHaveBeenCalledWith({ lat: 35.3606, lon: 138.7274 });
    expect(await screen.findByText("777.00 m")).toBeInTheDocument();
  });

  it("shows a search error for unknown queries", () => {
    render(<App />);

    fireEvent.change(screen.getByRole("textbox", { name: "地点検索" }), {
      target: { value: "存在しない地名XYZ" },
    });
    fireEvent.submit(screen.getByRole("search"));

    expect(screen.getByRole("alert")).toHaveTextContent("該当する地点が見つかりませんでした");
    expect(fetchElevationMock).not.toHaveBeenCalled();
  });

  it("runs the terrain analysis with real DEM data when the tab opens (地形分析)", async () => {
    fetchElevationMock.mockResolvedValue(okResult(100));
    analyzeTerrainMock.mockResolvedValue({ kind: "no-coverage" });
    render(<App />);
    const map = mocks.FakeMap.instances[0];

    await act(async () => {
      map?.fire("click", { lngLat: { lat: 35.1, lng: 138.1 } });
    });
    fireEvent.click(screen.getByRole("button", { name: "地形分析" }));

    expect(analyzeTerrainMock).toHaveBeenCalledWith({ lat: 35.1, lon: 138.1 }, expect.anything());
    expect(await screen.findByText(/この範囲の DEM データはありません/)).toBeInTheDocument();
    // 欠損時も「安全ではない」注意が必ず付く。
    expect(screen.getByText(/データが無いことは安全を意味しません/)).toBeInTheDocument();
  });

  it("picks a section line on the map and runs the section analysis (断面分析)", async () => {
    analyzeSectionMock.mockResolvedValue({ kind: "no-coverage" });
    render(<App />);
    const map = mocks.FakeMap.instances[0];

    fireEvent.click(screen.getByRole("button", { name: "断面分析" }));
    expect(screen.getByText("断面線が未指定です")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "地図で断面線を指定" }));
    // 地図タブへ切り替わり、始点の案内が出る。
    expect(screen.getByText("断面の始点をクリックしてください")).toBeInTheDocument();

    await act(async () => {
      map?.fire("click", { lngLat: { lat: 35.0, lng: 138.0 } });
    });
    expect(screen.getByText("断面の終点をクリックしてください")).toBeInTheDocument();

    await act(async () => {
      map?.fire("click", { lngLat: { lat: 35.01, lng: 138.01 } });
    });

    // 断面タブへ自動遷移し、指定した2点で解析が走る。標高取得は走らない。
    expect(analyzeSectionMock).toHaveBeenCalledWith(
      { lat: 35.0, lon: 138.0 },
      { lat: 35.01, lon: 138.01 },
      expect.anything(),
    );
    expect(fetchElevationMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/この断面の DEM データはありません/)).toBeInTheDocument();
  });

  it("リセット clears the selection and flies back to the pre-search view", async () => {
    fetchElevationMock.mockResolvedValue(okResult(555));
    render(<App />);

    fireEvent.change(screen.getByRole("textbox", { name: "地点検索" }), {
      target: { value: "富士山" },
    });
    fireEvent.submit(screen.getByRole("search"));
    expect(await screen.findByText("555.00 m")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "リセット" }));

    expect(screen.getByRole("region", { name: "地点標高" })).toHaveTextContent(
      "地図をクリックすると",
    );
    expect(screen.getByRole("textbox", { name: "地点検索" })).toHaveValue("");
    const map = mocks.FakeMap.instances[0];
    // 検索前 (初期) の視点へ戻る。
    expect(map?.flyTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: [138.0, 36.5], zoom: 5 }),
    );
  });

  it("shows the real share URL on the output tab", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));

    expect(screen.getByRole("textbox", { name: "共有URL" })).toHaveValue(
      `${window.location.origin}/#view=5/36.5/138&base=std`,
    );
    expect(screen.getByRole("button", { name: "レポート出力 (Markdown)" })).toBeDisabled();
  });
});
