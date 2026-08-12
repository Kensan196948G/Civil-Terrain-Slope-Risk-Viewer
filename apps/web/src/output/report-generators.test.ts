import { describe, expect, it } from "vitest";
import type { CheckCard, QualitySummary } from "@civil-terrain/domain";
import type { TerrainAnalysisResult } from "../analysis/terrain-service";
import type { SectionAnalysisResult } from "../analysis/section-service";
import {
  buildCsvReport,
  buildJsonReport,
  buildMarkdownReport,
  createReportInput,
} from "./report-generators";

const QUALITY: QualitySummary = {
  grade: "B",
  missingRatio: 0.03,
  sourceMix: { DEM1A: 0, DEM5A: 800, DEM5B: 0, DEM5C: 0, DEM10B: 100 },
  coverage: "PARTIAL",
  warnings: ["3 地点でタイル取得に失敗しました。"],
};

const TERRAIN: TerrainAnalysisResult = {
  kind: "ok",
  center: { lat: 35.68, lon: 139.76 },
  stats: {
    meanDeg: 8.4,
    maxDeg: 32.1,
    steepRatio: 0.12,
    steepThresholdDeg: 30,
    validCount: 900,
    evaluatedCount: 961,
  },
  classes: {
    counts: { ridge: 200, slope: 400, valley: 150, flat: 100 },
    unknown: 50,
    classified: 850,
    tpiThresholdM: 1,
    flatSlopeDeg: 5,
  },
  quality: QUALITY,
  provenance: [
    {
      sourceId: "DEM5A",
      sourceName: "国土地理院 標高タイル DEM5A",
      sourceUrl: "https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/",
      termsUrl: "https://maps.gsi.go.jp/development/ichiran.html",
      retrievedAt: "2026-08-12T00:00:00Z",
      processed: true,
      processingNote: "PNG復号",
    },
  ],
  extentM: 160,
};

const SECTION: SectionAnalysisResult = {
  kind: "ok",
  start: { lat: 35.68, lon: 139.76 },
  end: { lat: 35.7, lon: 139.78 },
  samples: [
    { distanceM: 0, elevationM: 10 },
    { distanceM: 100, elevationM: 20 },
    { distanceM: 200, elevationM: null },
  ],
  stats: {
    totalLengthM: 200,
    gainM: 10,
    lossM: 0,
    meanSlopeDeg: 5.7,
    maxSlopeDeg: 18.2,
    sampleCount: 3,
    validSampleRatio: 2 / 3,
    validSegmentLengthM: 100,
  },
  quality: QUALITY,
  provenance: [],
};

const CARDS: readonly CheckCard[] = [
  {
    code: "steep-slope-max",
    status: "CHECK_REQUIRED",
    title: "急傾斜 (30°以上) を検出",
    observation: "周辺グリッドの最大傾斜は 32.1° で、急傾斜地法の基準 (30°) 以上です。",
    recommendedChecks: ["現地での傾斜・法面状況の確認", "急傾斜地崩壊危険区域の指定状況の確認"],
    evidenceIds: ["terrain.stats.maxDeg"],
    algorithmVersion: "web-analysis-v1",
  },
];

const INPUT = createReportInput({
  generatedAt: "2026-08-12T01:02:03.000Z",
  coordinate: { lat: 35.68, lon: 139.76 },
  elevation: {
    kind: "ok",
    point: {
      coordinate: { lat: 35.68, lon: 139.76 },
      elevationM: 12.34,
      source: "DEM5A",
      quality: { grade: "A", coverage: "FULL" },
    },
  },
  terrain: TERRAIN,
  section: SECTION,
  confirmCards: CARDS,
  shareUrl: "http://localhost/#view=15/35.68/139.76&base=std",
});

describe("buildMarkdownReport", () => {
  it("includes location, metrics, cards, provenance and disclaimer", () => {
    const report = buildMarkdownReport(INPUT);

    expect(report).toContain("# 地形・傾斜リスク確認レポート");
    expect(report).toContain("緯度 35.68000 / 経度 139.76000");
    expect(report).toContain("12.34 m");
    expect(report).toContain("平均傾斜: 8.4°");
    expect(report).toContain("32.1°");
    expect(report).toContain("国土地理院 標高タイル DEM5A");
    expect(report).toContain("steep-slope-max");
    expect(report).toContain("安全 (リスクなし) を意味しません");
  });

  it("marks unknown states instead of rounding them to safe", () => {
    const unknown = createReportInput({
      ...INPUT,
      elevation: { kind: "unavailable" },
      terrain: { kind: "no-coverage" },
      section: { kind: "too-short", lengthM: 10 },
      confirmCards: [],
    });

    const report = buildMarkdownReport(unknown);
    expect(report).toContain("判定不能");
    expect(report).toContain("データが無いことは安全を意味しません");
    expect(report).toContain("断面が短すぎます");
  });
});

describe("buildCsvReport", () => {
  it("is RFC-4180 parseable and contains a header row", () => {
    const csv = buildCsvReport(INPUT);
    const lines = csv.trim().split(/\r?\n/);

    expect(lines[0]).toBe("項目,値,補足");
    expect(csv).toContain("急傾斜 (30°以上) を検出");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("escapes CSV formula injection in user-visible strings", () => {
    const malicious: CheckCard = {
      ...(CARDS[0] as CheckCard),
      observation: '=HYPERLINK("http://evil.example")',
    };
    const csv = buildCsvReport({ ...INPUT, confirmCards: [malicious] });

    expect(csv).toContain("'=HYPERLINK");
  });
});

describe("buildJsonReport", () => {
  it("produces a structured object with schema version and disclaimer", () => {
    const json = buildJsonReport(INPUT) as {
      schemaVersion: string;
      confirmCards: readonly CheckCard[];
      disclaimer: string;
    };

    expect(json.schemaVersion).toBe("1.0.0");
    expect(json.confirmCards.length).toBe(1);
    expect(json.disclaimer.length).toBeGreaterThan(0);
  });
});
