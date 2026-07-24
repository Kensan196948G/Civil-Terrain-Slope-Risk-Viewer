import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TerrainTab } from "./TerrainTab";
import type { TerrainAnalysisResult } from "../analysis/terrain-service";

const COORD = { lat: 35.36061, lon: 138.72743 };

function okResult(): TerrainAnalysisResult {
  return {
    kind: "ok",
    center: COORD,
    stats: {
      meanDeg: 14.812,
      maxDeg: 33.421,
      steepRatio: 0.124,
      steepThresholdDeg: 30,
      validCount: 961,
      evaluatedCount: 961,
    },
    classes: {
      counts: { ridge: 100, slope: 500, valley: 200, flat: 161 },
      classified: 961,
      unknown: 0,
      tpiThresholdM: 1,
      flatSlopeDeg: 5,
    },
    quality: {
      grade: "A",
      missingRatio: 0,
      sourceMix: { DEM1A: 0, DEM5A: 1089, DEM5B: 0, DEM5C: 0, DEM10B: 0 },
      coverage: "FULL",
      warnings: [],
    },
    provenance: [
      {
        sourceId: "gsi_dem5a_png",
        sourceName: "国土地理院 標高タイル DEM5A",
        sourceUrl: "https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/",
        termsUrl: "https://maps.gsi.go.jp/development/ichiran.html",
        retrievedAt: "2026-07-24T05:00:00Z",
        processed: true,
      },
    ],
    extentM: 160,
  };
}

describe("TerrainTab", () => {
  it("shows the empty state without a selected point", () => {
    const onGoToMap = vi.fn();
    render(
      <TerrainTab
        selectedPoint={null}
        state={{ phase: "idle" }}
        onGoToMap={onGoToMap}
        onRetry={() => undefined}
      />,
    );
    expect(screen.getByText("地点が未選択です")).toBeInTheDocument();
  });

  it("renders computed statistics, classification and provenance", () => {
    render(
      <TerrainTab
        selectedPoint={COORD}
        state={{ phase: "done", coordinate: COORD, result: okResult() }}
        onGoToMap={() => undefined}
        onRetry={() => undefined}
      />,
    );

    expect(screen.getByText("14.8°")).toBeInTheDocument(); // 平均傾斜 (実測)
    expect(screen.getByText("33.4°")).toBeInTheDocument(); // 最大傾斜
    expect(screen.getByText("12.4%")).toBeInTheDocument(); // 急傾斜面積比
    expect(screen.getByText("尾根")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "国土地理院 標高タイル DEM5A" })).toBeInTheDocument();
  });

  it("keeps unknown-is-not-safe wording when the DEM fetch fails, with a retry", () => {
    const onRetry = vi.fn();
    render(
      <TerrainTab
        selectedPoint={COORD}
        state={{ phase: "done", coordinate: COORD, result: { kind: "unavailable" } }}
        onGoToMap={() => undefined}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText(/判定不能は安全を意味しません/)).toBeInTheDocument();
    screen.getByRole("button", { name: "再試行" }).click();
    expect(onRetry).toHaveBeenCalled();
  });
});
