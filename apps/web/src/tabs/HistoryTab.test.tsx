import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ElevationResult } from "../elevation/elevation-client";
import type { TerrainAnalysisResult } from "../analysis/terrain-service";
import { createSavedAnalysis } from "../history/analysis-history";
import type { AnalysisSnapshot, SavedAnalysis } from "../history/analysis-history";
import { HistoryTab } from "./HistoryTab";

function elevation(elevationM: number): ElevationResult {
  return {
    kind: "ok",
    point: {
      coordinate: { lat: 35.1, lon: 138.1 },
      elevationM,
      source: "DEM5A",
      quality: { grade: "A", coverage: "FULL" },
    },
  };
}

function terrain(meanDeg: number, maxDeg: number, steepRatio: number): TerrainAnalysisResult {
  return {
    kind: "ok",
    center: { lat: 35.1, lon: 138.1 },
    stats: {
      meanDeg,
      maxDeg,
      steepRatio,
      steepThresholdDeg: 30,
      validCount: 10,
      evaluatedCount: 31 * 31,
    },
    classes: {
      counts: { ridge: 1, slope: 2, valley: 3, flat: 4 },
      classified: 10,
      unknown: 0,
      tpiThresholdM: 1,
      flatSlopeDeg: 5,
    },
    quality: {
      grade: "A",
      missingRatio: 0,
      sourceMix: { DEM1A: 0, DEM5A: 10, DEM5B: 0, DEM5C: 0, DEM10B: 0 },
      coverage: "FULL",
      warnings: [],
    },
    provenance: [],
    extentM: 160,
  };
}

function snapshot(
  coordinate: { lat: number; lon: number } = { lat: 35.1, lon: 138.1 },
): AnalysisSnapshot {
  return {
    coordinate,
    elevation: elevation(120),
    terrain: terrain(12.3, 31.2, 0.18),
    section: null,
    sectionLine: null,
  };
}

function item(
  id: string,
  coordinate: { lat: number; lon: number },
  savedAt: string,
  terrainOverride?: { meanDeg: number; maxDeg: number; steepRatio: number },
): SavedAnalysis {
  const base = snapshot(coordinate);
  return createSavedAnalysis(
    terrainOverride === undefined
      ? base
      : {
          ...base,
          terrain: terrain(
            terrainOverride.meanDeg,
            terrainOverride.maxDeg,
            terrainOverride.steepRatio,
          ),
        },
    { id, now: () => new Date(savedAt) },
  );
}

function renderTab(overrides: Partial<Parameters<typeof HistoryTab>[0]> = {}): {
  readonly onSaveCurrent: ReturnType<typeof vi.fn>;
  readonly onLoad: ReturnType<typeof vi.fn>;
  readonly onDelete: ReturnType<typeof vi.fn>;
  readonly onClear: ReturnType<typeof vi.fn>;
  readonly onGoToMap: ReturnType<typeof vi.fn>;
} {
  const handlers = {
    onSaveCurrent: vi.fn(),
    onLoad: vi.fn(),
    onDelete: vi.fn(),
    onClear: vi.fn(),
    onGoToMap: vi.fn(),
  };
  render(<HistoryTab items={[]} current={null} saveStatus="idle" {...handlers} {...overrides} />);
  return handlers;
}

describe("HistoryTab", () => {
  it("shows an empty state with the save button disabled", () => {
    const { onGoToMap } = renderTab();

    expect(screen.getByRole("button", { name: "現在の分析を保存" })).toBeDisabled();
    expect(screen.getByText("保存された分析はまだありません。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "地図で地点を選ぶ" }));
    expect(onGoToMap).toHaveBeenCalledTimes(1);
  });

  it("enables the save button when a completed analysis exists", () => {
    const { onSaveCurrent } = renderTab({ current: snapshot() });

    fireEvent.click(screen.getByRole("button", { name: "現在の分析を保存" }));
    expect(onSaveCurrent).toHaveBeenCalledTimes(1);
  });

  it("lists saved analyses and wires load/delete actions", () => {
    const a = item("a", { lat: 35.1, lon: 138.1 }, "2026-08-12T01:00:00Z");
    const b = item("b", { lat: 36.2, lon: 139.3 }, "2026-08-12T02:00:00Z");
    const { onLoad, onDelete } = renderTab({ items: [a, b] });

    expect(screen.getByText(/緯度 35.10000 \/ 経度 138.10000/)).toBeInTheDocument();
    expect(screen.getByText(/緯度 36.20000 \/ 経度 139.30000/)).toBeInTheDocument();

    const openButtons = screen.getAllByRole("button", { name: "開く" });
    fireEvent.click(openButtons[0]!);
    expect(onLoad).toHaveBeenCalledWith("a");

    const deleteButtons = screen.getAllByRole("button", { name: "削除" });
    fireEvent.click(deleteButtons[1]!);
    expect(onDelete).toHaveBeenCalledWith("b");
  });

  it("compares exactly two selected items in a side-by-side table", () => {
    const a = item("a", { lat: 35.1, lon: 138.1 }, "2026-08-12T01:00:00Z");
    const b = item("b", { lat: 36.2, lon: 139.3 }, "2026-08-12T02:00:00Z", {
      meanDeg: 18.7,
      maxDeg: 42.5,
      steepRatio: 0.42,
    });
    renderTab({ items: [a, b] });

    fireEvent.click(screen.getByRole("checkbox", { name: /比較対象に選択: 緯度 35.10000/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /比較対象に選択: 緯度 36.20000/ }));

    expect(screen.getByRole("region", { name: "2地点の比較" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "12.3°" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "18.7°" })).toBeInTheDocument();
  });

  it("rejects a third selection and lets the user cancel the comparison", () => {
    const a = item("a", { lat: 35.1, lon: 138.1 }, "2026-08-12T01:00:00Z");
    const b = item("b", { lat: 36.2, lon: 139.3 }, "2026-08-12T02:00:00Z");
    const c = item("c", { lat: 34.5, lon: 135.2 }, "2026-08-12T03:00:00Z");
    renderTab({ items: [a, b, c] });

    fireEvent.click(screen.getByRole("checkbox", { name: /緯度 35.10000/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /緯度 36.20000/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /緯度 34.50000/ }));

    expect(screen.getByText(/比較できるのは2件までです/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "比較をやめる" }));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("requires a two-step confirmation before clearing all history", () => {
    const a = item("a", { lat: 35.1, lon: 138.1 }, "2026-08-12T01:00:00Z");
    const { onClear } = renderTab({ items: [a] });

    fireEvent.click(screen.getByRole("button", { name: "すべて削除" }));
    expect(screen.getByText(/すべて削除しますか/)).toBeInTheDocument();
    expect(onClear).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "実行" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
