import type { CheckCard, Provenance, QualitySummary } from "@civil-terrain/domain";
import type { ElevationResult } from "../elevation/elevation-client";
import type { TerrainAnalysisResult } from "../analysis/terrain-service";
import type { SectionAnalysisResult } from "../analysis/section-service";

/**
 * レポート出力 (FR-016 Markdown/CSV/JSON) の純粋生成器。
 *
 * 方針:
 * - 「データなし」「判定不能」は欠損・失敗としてそのまま出力する。安全として
 *   丸めない (Unknown is not Safe)。
 * - 出典 (provenance) と加工注記を必ず含める (Evidence First)。
 * - 総合危険度の合算は行わない (spec 禁止事項)。
 */

export interface ReportInput {
  readonly generatedAt: string;
  readonly coordinate: { readonly lat: number; readonly lon: number } | null;
  readonly elevation: ElevationResult | null;
  readonly terrain: TerrainAnalysisResult | null;
  readonly section: SectionAnalysisResult | null;
  readonly confirmCards: readonly CheckCard[];
  readonly shareUrl: string;
}

export const REPORT_SCHEMA_VERSION = "1.0.0";

export const REPORT_DISCLAIMER =
  "本レポートは工事候補地の初期確認を支援するために作成されたものであり、測量・地質調査・現地踏査・設計計算・法令上の危険区域判定を代替しません。「データなし」「判定不能」は安全 (リスクなし) を意味しません。";

function formatCoordinateText(
  coordinate: { readonly lat: number; readonly lon: number } | null,
): string {
  return coordinate === null
    ? "未選択"
    : `緯度 ${coordinate.lat.toFixed(5)} / 経度 ${coordinate.lon.toFixed(5)}`;
}

function formatDeg(value: number | null): string {
  return value === null ? "判定不能" : `${value.toFixed(1)}°`;
}

function formatPercent(value: number | null): string {
  return value === null ? "判定不能" : `${(value * 100).toFixed(1)}%`;
}

function formatMeters(value: number | null): string {
  return value === null ? "判定不能" : `${value.toFixed(1)} m`;
}

function terrainStatus(result: TerrainAnalysisResult | null): string {
  if (result === null) {
    return "未実行";
  }
  switch (result.kind) {
    case "ok":
      return "成功";
    case "no-coverage":
      return "データなし (データが無いことは安全を意味しません)";
    case "unavailable":
      return "取得失敗・判定不能";
    case "error":
      return `エラー (${result.message})`;
  }
}

function sectionStatus(result: SectionAnalysisResult | null): string {
  if (result === null) {
    return "未実行";
  }
  switch (result.kind) {
    case "ok":
      return "成功";
    case "too-short":
      return `断面が短すぎます (${formatMeters(result.lengthM)})`;
    case "too-long":
      return `断面が長すぎます (${formatMeters(result.lengthM)})`;
    case "no-coverage":
      return "データなし (データが無いことは安全を意味しません)";
    case "unavailable":
      return "取得失敗・判定不能";
    case "error":
      return `エラー (${result.message})`;
  }
}

function provenanceLines(
  terrain: TerrainAnalysisResult | null,
  section: SectionAnalysisResult | null,
): string[] {
  const sources = new Map<string, Provenance>();
  for (const result of [terrain, section]) {
    if (result !== null && result.kind === "ok") {
      for (const entry of result.provenance) {
        sources.set(entry.sourceId, entry);
      }
    }
  }
  if (sources.size === 0) {
    return ["（解析が未実行のため出典情報はありません）"];
  }
  return [...sources.values()].map(
    (entry) =>
      `- ${entry.sourceName} — 取得日時 ${entry.retrievedAt} — 利用条件: ${entry.termsUrl}`,
  );
}

function qualityLine(quality: QualitySummary | null): string {
  if (quality === null) {
    return "評価なし";
  }
  const warnings = quality.warnings.length > 0 ? ` / 警告: ${quality.warnings.join("; ")}` : "";
  return `品質グレード ${quality.grade} / 欠損率 ${formatPercent(quality.missingRatio)} / 被覆 ${quality.coverage}${warnings}`;
}

/** Markdown レポート。表はコードだけでなく人間が読める前提で整形する。 */
export function buildMarkdownReport(input: ReportInput): string {
  const lines: string[] = [];
  lines.push("# 地形・傾斜リスク確認レポート");
  lines.push("");
  lines.push(`- 生成日時: ${input.generatedAt}`);
  lines.push(`- 対象地点: ${formatCoordinateText(input.coordinate)}`);
  lines.push(`- 共有URL: ${input.shareUrl}`);
  lines.push("");

  lines.push("## 1. 単点標高");
  lines.push("");
  if (input.elevation === null) {
    lines.push("未取得。");
  } else if (input.elevation.kind === "ok") {
    const point = input.elevation.point;
    lines.push(`- 標高: ${point.elevationM.toFixed(2)} m`);
    lines.push(`- ソース: ${point.source} (グレード ${point.quality.grade})`);
    const provenance = point.provenance?.[0];
    if (provenance !== undefined) {
      lines.push(`- 出典: ${provenance.sourceName} (${provenance.termsUrl})`);
      lines.push(`- 取得日時: ${provenance.retrievedAt}`);
    }
  } else if (input.elevation.kind === "no-coverage") {
    lines.push("この地点の標高データはありません。**データが無いことは安全を意味しません。**");
  } else if (input.elevation.kind === "unavailable") {
    lines.push("データ取得に失敗し判定不能です。**判定不能は安全を意味しません。**");
  } else {
    lines.push(`通信エラー: ${input.elevation.message}`);
  }
  lines.push("");

  lines.push("## 2. 地形分析");
  lines.push("");
  lines.push(`状態: ${terrainStatus(input.terrain)}`);
  if (input.terrain !== null && input.terrain.kind === "ok") {
    const stats = input.terrain.stats;
    if (stats !== null) {
      lines.push("");
      lines.push(`- 平均傾斜: ${formatDeg(stats.meanDeg)}`);
      lines.push(`- 最大傾斜: ${formatDeg(stats.maxDeg)}`);
      lines.push(
        `- 急傾斜 (${stats.steepThresholdDeg}°以上) 面積比: ${formatPercent(stats.steepRatio)}`,
      );
    } else {
      lines.push("有効な標高セルが不足しており、傾斜統計は判定不能です。");
    }
    lines.push("");
    lines.push(
      `地形分類 (TPI): 尾根 ${formatPercent(input.terrain.classes.counts.ridge / Math.max(input.terrain.classes.classified, 1))} / 斜面 ${formatPercent(input.terrain.classes.counts.slope / Math.max(input.terrain.classes.classified, 1))} / 谷 ${formatPercent(input.terrain.classes.counts.valley / Math.max(input.terrain.classes.classified, 1))} / 平坦 ${formatPercent(input.terrain.classes.counts.flat / Math.max(input.terrain.classes.classified, 1))}`,
    );
    if (input.terrain.classes.unknown > 0) {
      lines.push(`分類不能セル: ${input.terrain.classes.unknown} (判定不能は安全を意味しません)`);
    }
    lines.push("");
    lines.push(`品質: ${qualityLine(input.terrain.quality)}`);
  }
  lines.push("");

  lines.push("## 3. 断面分析");
  lines.push("");
  lines.push(`状態: ${sectionStatus(input.section)}`);
  if (input.section !== null && input.section.kind === "ok") {
    const stats = input.section.stats;
    lines.push("");
    lines.push(`- 始点: ${formatCoordinateText(input.section.start)}`);
    lines.push(`- 終点: ${formatCoordinateText(input.section.end)}`);
    lines.push(`- 総延長: ${formatMeters(stats.totalLengthM)}`);
    lines.push(`- 累積上昇: ${formatMeters(stats.gainM)}`);
    lines.push(`- 累積下降: ${formatMeters(stats.lossM)}`);
    lines.push(`- 平均勾配: ${formatDeg(stats.meanSlopeDeg)}`);
    lines.push(`- 最大勾配: ${formatDeg(stats.maxSlopeDeg)}`);
    lines.push(`- 有効サンプル率: ${formatPercent(stats.validSampleRatio)}`);
    lines.push("");
    lines.push(`品質: ${qualityLine(input.section.quality)}`);
  }
  lines.push("");

  lines.push("## 4. 確認支援カード");
  lines.push("");
  if (input.confirmCards.length === 0) {
    lines.push("しきい値を超過したカードはありません。これは安全の保証ではありません。");
  } else {
    lines.push("| コード | 状態 | タイトル | 観測 | 推奨確認 |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const card of input.confirmCards) {
      const recommendation = card.recommendedChecks.join(" / ");
      lines.push(
        `| ${card.code} | ${card.status} | ${card.title} | ${card.observation.replace(/\|/g, "\\|")} | ${recommendation} |`,
      );
    }
  }
  lines.push("");

  lines.push("## 5. 出典");
  lines.push("");
  lines.push(...provenanceLines(input.terrain, input.section));
  lines.push("");

  lines.push("## 6. 注意事項");
  lines.push("");
  lines.push(REPORT_DISCLAIMER);
  lines.push("");
  lines.push(`（レポート生成方式: クライアントサイド / schema ${REPORT_SCHEMA_VERSION}）`);
  lines.push("");
  return lines.join("\n");
}

/** CSV エスケープ (RFC 4180 準拠。数式注入対策として先頭文字を無害化する)。 */
function csvCell(value: string): string {
  // CSV 式注入対策 (docs/セキュリティ.md): = + - @ で始まるセルは先頭に ' を付ける。
  const sanitized = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(sanitized) ? `"${sanitized.replace(/"/g, '""')}"` : sanitized;
}

/** 主要メトリクスと確認カードを1つの表にした CSV。 */
export function buildCsvReport(input: ReportInput): string {
  const rows: string[][] = [["項目", "値", "補足"]];
  rows.push(["生成日時", input.generatedAt, ""]);
  rows.push(["対象地点", formatCoordinateText(input.coordinate), ""]);
  rows.push(["共有URL", input.shareUrl, ""]);

  if (input.elevation === null) {
    rows.push(["単点標高", "未取得", ""]);
  } else if (input.elevation.kind === "ok") {
    rows.push([
      "単点標高",
      `${input.elevation.point.elevationM.toFixed(2)} m`,
      input.elevation.point.source,
    ]);
  } else if (input.elevation.kind === "no-coverage") {
    rows.push(["単点標高", "データなし (安全を意味しない)", ""]);
  } else {
    rows.push(["単点標高", "判定不能", input.elevation.kind]);
  }

  rows.push(["地形分析", terrainStatus(input.terrain), ""]);
  if (input.terrain !== null && input.terrain.kind === "ok") {
    const stats = input.terrain.stats;
    rows.push(["平均傾斜", formatDeg(stats?.meanDeg ?? null), "deg"]);
    rows.push(["最大傾斜", formatDeg(stats?.maxDeg ?? null), "deg"]);
    rows.push(["急傾斜面積比", formatPercent(stats?.steepRatio ?? null), "0..1"]);
    rows.push([
      "地形分類内訳",
      `尾根 ${input.terrain.classes.counts.ridge} / 斜面 ${input.terrain.classes.counts.slope} / 谷 ${input.terrain.classes.counts.valley} / 平坦 ${input.terrain.classes.counts.flat} / 不明 ${input.terrain.classes.unknown}`,
      "セル数",
    ]);
    rows.push(["地形分析 品質", qualityLine(input.terrain.quality), ""]);
  }

  rows.push(["断面分析", sectionStatus(input.section), ""]);
  if (input.section !== null && input.section.kind === "ok") {
    rows.push(["断面総延長", formatMeters(input.section.stats.totalLengthM), "m"]);
    rows.push(["累積上昇", formatMeters(input.section.stats.gainM), "m"]);
    rows.push(["累積下降", formatMeters(input.section.stats.lossM), "m"]);
    rows.push(["平均勾配", formatDeg(input.section.stats.meanSlopeDeg), "deg"]);
    rows.push(["最大勾配", formatDeg(input.section.stats.maxSlopeDeg), "deg"]);
    rows.push(["有効サンプル率", formatPercent(input.section.stats.validSampleRatio), "0..1"]);
    rows.push(["断面分析 品質", qualityLine(input.section.quality), ""]);
  }

  rows.push(["確認支援カード数", String(input.confirmCards.length), ""]);
  for (const card of input.confirmCards) {
    rows.push([
      `カード: ${card.code}`,
      `${card.status}: ${card.title}`,
      `${card.observation} / 推奨: ${card.recommendedChecks.join(" / ")}`,
    ]);
  }

  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** JSON レポート。構造化データとして機械可読な形式で返す。 */
export function buildJsonReport(input: ReportInput): unknown {
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    coordinate: input.coordinate,
    shareUrl: input.shareUrl,
    elevation: input.elevation,
    terrain: input.terrain,
    section: input.section,
    confirmCards: input.confirmCards,
    disclaimer: REPORT_DISCLAIMER,
  };
}

/** レポート生成の共通入力を組み立てる (OutputTab から呼ぶ)。 */
export function createReportInput(parts: {
  readonly generatedAt: string;
  readonly coordinate: { readonly lat: number; readonly lon: number } | null;
  readonly elevation: ElevationResult | null;
  readonly terrain: TerrainAnalysisResult | null;
  readonly section: SectionAnalysisResult | null;
  readonly confirmCards: readonly CheckCard[];
  readonly shareUrl: string;
}): ReportInput {
  return { ...parts };
}
