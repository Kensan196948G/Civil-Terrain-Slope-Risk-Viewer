import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfirmTab } from "./ConfirmTab";
import type { TerrainAnalysisResult } from "../analysis/terrain-service";

const COORD = { lat: 35.36061, lon: 138.72743 };

function steepTerrain(): Extract<TerrainAnalysisResult, { kind: "ok" }> {
  return {
    kind: "ok",
    center: COORD,
    stats: {
      meanDeg: 20,
      maxDeg: 34.2,
      steepRatio: 0.2,
      steepThresholdDeg: 30,
      validCount: 900,
      evaluatedCount: 961,
    },
    classes: {
      counts: { ridge: 100, slope: 600, valley: 50, flat: 150 },
      classified: 900,
      unknown: 61,
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
    provenance: [],
    extentM: 160,
  };
}

describe("ConfirmTab", () => {
  it("shows the empty state without a selected point", () => {
    render(
      <ConfirmTab
        selectedPoint={null}
        terrainRunning={false}
        terrain={null}
        section={null}
        onGoToMap={() => undefined}
      />,
    );
    expect(screen.getByText("地点が未選択です")).toBeInTheDocument();
  });

  it("renders cards from real measured metrics", () => {
    render(
      <ConfirmTab
        selectedPoint={COORD}
        terrainRunning={false}
        terrain={steepTerrain()}
        section={null}
        onGoToMap={() => undefined}
      />,
    );

    expect(screen.getByText("急傾斜 (30°以上) を検出")).toBeInTheDocument();
    expect(screen.getByText(/34\.2°/)).toBeInTheDocument(); // 実測値がカードに載る
    // StatusBadge が色以外の手掛かり (ラベル) 付きで表示される。
    expect(screen.getAllByText("追加確認が必要").length).toBeGreaterThan(0);
  });

  it("never claims safety when nothing exceeds thresholds", () => {
    const calm = steepTerrain();
    const terrain: TerrainAnalysisResult = {
      ...calm,
      stats: calm.stats === null ? null : { ...calm.stats, maxDeg: 8, steepRatio: 0 },
      classes: { ...calm.classes, counts: { ridge: 0, slope: 0, valley: 0, flat: 900 } },
    };
    render(
      <ConfirmTab
        selectedPoint={COORD}
        terrainRunning={false}
        terrain={terrain}
        section={null}
        onGoToMap={() => undefined}
      />,
    );

    expect(screen.getByText(/しきい値を超過した項目はありません/)).toBeInTheDocument();
    expect(screen.getByText(/これは安全の保証ではありません/)).toBeInTheDocument();
  });
});
