import type { Provenance, QualityGrade, QualitySummary } from "@civil-terrain/domain";
import type { SectionAnalysisResult } from "../analysis/section-service";
import type { TerrainAnalysisResult } from "../analysis/terrain-service";
import type { ElevationResult } from "../elevation/elevation-client";
import type { SavedAnalysis } from "../history/analysis-history";
import type { Coordinate } from "../search/site-search";

/**
 * Demo analyses for first-run MVP evaluation.
 *
 * These are synthetic, clearly labeled records. They never represent real
 * people, contracts, customers, or measured site data, and they are not written
 * to localStorage unless the user explicitly saves a live analysis.
 */

const SOURCE_MIX_ZERO = { DEM1A: 0, DEM5A: 0, DEM5B: 0, DEM5C: 0, DEM10B: 0 } as const;

type OkTerrain = Extract<TerrainAnalysisResult, { readonly kind: "ok" }>;

const DEMO_PROVENANCE: readonly Provenance[] = [
  {
    sourceId: "demo-fixture-dem",
    sourceName: "デモ用 合成DEM fixture",
    sourceUrl: "app://demo-fixtures/synthetic-dem",
    termsUrl: "app://demo-fixtures/terms",
    retrievedAt: "2026-08-13T00:00:00.000Z",
    sourceVersion: "demo-2026-08-13",
    resolutionM: 5,
    processed: true,
    processingNote: "架空ダミーデータ。実測・行政判断・実在案件を含まない。",
  },
];

function coordinate(lat: number, lon: number): Coordinate {
  return { lat, lon };
}

function elevation(point: Coordinate, elevationM: number, grade: QualityGrade): ElevationResult {
  return {
    kind: "ok",
    point: {
      coordinate: point,
      elevationM,
      source: "demo-synthetic-dem",
      quality: { grade, coverage: "DEMO" },
      provenance: [
        {
          sourceName: "デモ用 合成DEM fixture",
          sourceUrl: "app://demo-fixtures/synthetic-dem",
          termsUrl: "app://demo-fixtures/terms",
          retrievedAt: "2026-08-13T00:00:00.000Z",
        },
      ],
    },
  };
}

function quality(
  grade: QualityGrade,
  missingRatio: number,
  warnings: readonly string[],
): QualitySummary {
  return {
    grade,
    missingRatio,
    sourceMix: { ...SOURCE_MIX_ZERO, DEM5A: Math.round((1 - missingRatio) * 961) },
    coverage: missingRatio === 0 ? "FULL" : "PARTIAL",
    warnings,
  };
}

function terrain(
  center: Coordinate,
  stats: NonNullable<OkTerrain["stats"]>,
  classes: OkTerrain["classes"],
  qualitySummary: QualitySummary,
): TerrainAnalysisResult {
  return {
    kind: "ok",
    center,
    stats,
    classes,
    quality: qualitySummary,
    provenance: DEMO_PROVENANCE,
    extentM: 160,
  };
}

function section(
  start: Coordinate,
  end: Coordinate,
  elevations: readonly number[],
  qualitySummary: QualitySummary,
): SectionAnalysisResult {
  const totalLengthM = 420;
  const samples = elevations.map((elevationM, index) => ({
    distanceM: (totalLengthM * index) / (elevations.length - 1),
    elevationM,
  }));
  const gainM = elevations.reduce((sum, current, index) => {
    if (index === 0) return 0;
    const delta = current - elevations[index - 1]!;
    return sum + Math.max(0, delta);
  }, 0);
  const lossM = elevations.reduce((sum, current, index) => {
    if (index === 0) return 0;
    const delta = current - elevations[index - 1]!;
    return sum + Math.max(0, -delta);
  }, 0);

  return {
    kind: "ok",
    start,
    end,
    samples,
    stats: {
      totalLengthM,
      gainM,
      lossM,
      meanSlopeDeg: 12.4,
      maxSlopeDeg: 28.7,
      validSampleRatio: 1,
      validSegmentLengthM: totalLengthM,
      sampleCount: samples.length,
    },
    quality: qualitySummary,
    provenance: DEMO_PROVENANCE,
  };
}

const yardA = coordinate(35.3606, 138.7274);
const routeB = coordinate(35.3552, 138.7448);
const depotC = coordinate(35.3741, 138.7065);

export const DEMO_ANALYSES: readonly SavedAnalysis[] = [
  {
    id: "demo-yard-a",
    label: "デモ: 架空ヤードA",
    scenario: "造成ヤード候補の初期確認。平坦寄りで欠損なし、レポート出力の正常系を確認できます。",
    demo: true,
    savedAt: "2026-08-13T00:00:00.000Z",
    coordinate: yardA,
    elevation: elevation(yardA, 812.4, "A"),
    terrain: terrain(
      yardA,
      {
        meanDeg: 8.6,
        maxDeg: 18.9,
        steepRatio: 0.02,
        steepThresholdDeg: 30,
        validCount: 961,
        evaluatedCount: 961,
      },
      {
        counts: { ridge: 42, slope: 318, valley: 86, flat: 515 },
        classified: 961,
        unknown: 0,
        tpiThresholdM: 1,
        flatSlopeDeg: 5,
      },
      quality("A", 0, []),
    ),
    section: section(
      coordinate(35.3594, 138.7249),
      coordinate(35.3624, 138.7306),
      [806, 809, 811, 813, 815, 814, 812, 810],
      quality("A", 0, []),
    ),
    sectionLine: {
      start: coordinate(35.3594, 138.7249),
      end: coordinate(35.3624, 138.7306),
    },
  },
  {
    id: "demo-route-b",
    label: "デモ: 架空搬入路B",
    scenario: "搬入路候補の急傾斜ケース。要確認カードと断面最大勾配の表示を確認できます。",
    demo: true,
    savedAt: "2026-08-13T00:05:00.000Z",
    coordinate: routeB,
    elevation: elevation(routeB, 934.8, "B"),
    terrain: terrain(
      routeB,
      {
        meanDeg: 22.1,
        maxDeg: 36.8,
        steepRatio: 0.16,
        steepThresholdDeg: 30,
        validCount: 887,
        evaluatedCount: 961,
      },
      {
        counts: { ridge: 104, slope: 523, valley: 182, flat: 78 },
        classified: 887,
        unknown: 74,
        tpiThresholdM: 1,
        flatSlopeDeg: 5,
      },
      quality("B", 0.077, ["デモ: 一部セルを欠損として設定し、判定不能の表示を確認できます。"]),
    ),
    section: section(
      coordinate(35.3541, 138.7419),
      coordinate(35.3578, 138.7486),
      [901, 913, 928, 949, 965, 955, 941, 935],
      quality("B", 0.04, ["デモ: 断面の一部に欠損区間がある想定です。"]),
    ),
    sectionLine: {
      start: coordinate(35.3541, 138.7419),
      end: coordinate(35.3578, 138.7486),
    },
  },
  {
    id: "demo-depot-c",
    label: "デモ: 架空資材置場C",
    scenario: "谷地形と欠損を含む境界条件。判定不能を安全扱いしない表示を確認できます。",
    demo: true,
    savedAt: "2026-08-13T00:10:00.000Z",
    coordinate: depotC,
    elevation: elevation(depotC, 676.3, "C"),
    terrain: terrain(
      depotC,
      {
        meanDeg: 14.5,
        maxDeg: 26.2,
        steepRatio: 0.07,
        steepThresholdDeg: 30,
        validCount: 792,
        evaluatedCount: 961,
      },
      {
        counts: { ridge: 63, slope: 281, valley: 244, flat: 204 },
        classified: 792,
        unknown: 169,
        tpiThresholdM: 1,
        flatSlopeDeg: 5,
      },
      quality("C", 0.176, ["デモ: 谷地形と欠損を含む境界条件サンプルです。"]),
    ),
    section: null,
    sectionLine: null,
  },
];
