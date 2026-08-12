import type { ElevationResult } from "../elevation/elevation-client";
import type { SectionAnalysisResult } from "../analysis/section-service";
import type { TerrainAnalysisResult } from "../analysis/terrain-service";
import { buildConfirmCards } from "../analysis/confirm-cards";
import { formatCoordinate, formatDeg, formatPercent } from "../analysis/format";
import type { Coordinate } from "../search/site-search";

/**
 * 分析履歴 (クライアントサイド保存・比較)。
 *
 * 保存先はブラウザの localStorage のみ。サーバー・共有URL・レポートへは
 * 送信されない (ガバナンスとプライバシー: 履歴を外部へ出さない)。
 * 将来 Neon の analyses テーブルへ移行する場合も、このスナップショット型を
 * 入出力境界として再利用する。
 */

export const HISTORY_STORAGE_KEY = "civil-terrain.analysis-history.v1";
export const HISTORY_MAX_ITEMS = 30;

export interface SectionLineSnapshot {
  readonly start: Coordinate | null;
  readonly end: Coordinate | null;
}

/** 保存対象の解析結果スナップショット。elevation は必ず確定状態を持つ。 */
export interface AnalysisSnapshot {
  readonly coordinate: Coordinate;
  readonly elevation: ElevationResult;
  readonly terrain: TerrainAnalysisResult | null;
  readonly section: SectionAnalysisResult | null;
  readonly sectionLine: SectionLineSnapshot | null;
}

export interface SavedAnalysis extends AnalysisSnapshot {
  readonly id: string;
  readonly savedAt: string;
}

export interface HistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type HistoryWriteResult =
  | { readonly ok: true; readonly items: readonly SavedAnalysis[] }
  | { readonly ok: false; readonly items: readonly SavedAnalysis[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCoordinate(value: unknown): value is Coordinate {
  return (
    isRecord(value) &&
    typeof value.lat === "number" &&
    Number.isFinite(value.lat) &&
    typeof value.lon === "number" &&
    Number.isFinite(value.lon)
  );
}

function isValidSavedAnalysis(value: unknown): value is SavedAnalysis {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.savedAt === "string" &&
    isCoordinate(value.coordinate) &&
    isRecord(value.elevation) &&
    typeof value.elevation.kind === "string"
  );
}

/** localStorage が無効 (プライバシーモード等) でも例外を外へ漏らさない安全ラッパー。 */
export function createBrowserHistoryStorage(): HistoryStorage {
  const read = (): Storage | null => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  };
  return {
    getItem(key: string): string | null {
      const storage = read();
      if (storage === null) {
        return null;
      }
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key: string, value: string): void {
      const storage = read();
      if (storage === null) {
        throw new Error("localStorage is unavailable");
      }
      storage.setItem(key, value);
    },
    removeItem(key: string): void {
      const storage = read();
      if (storage === null) {
        return;
      }
      try {
        storage.removeItem(key);
      } catch {
        // 削除失敗は読み取り専用モード等で発生し得る。呼び出し元で ok=false を返す。
      }
    },
  };
}

/** 保存済み履歴を読み込む。壊れた JSON・不正なエントリは黙って捨てる。 */
export function loadHistory(storage: HistoryStorage): readonly SavedAnalysis[] {
  const raw = storage.getItem(HISTORY_STORAGE_KEY);
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isValidSavedAnalysis);
  } catch {
    return [];
  }
}

export interface CreateSavedAnalysisOptions {
  readonly now?: () => Date;
  readonly id?: string;
}

function fallbackId(): string {
  return `saved-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSavedAnalysis(
  snapshot: AnalysisSnapshot,
  options: CreateSavedAnalysisOptions = {},
): SavedAnalysis {
  const now = options.now ?? ((): Date => new Date());
  const id =
    options.id ??
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : fallbackId());
  return { ...snapshot, id, savedAt: now().toISOString() };
}

/** 新規エントリを先頭へ追加し、同一ID重複を除き、上限件数で切り詰める。 */
export function persistAnalysis(
  items: readonly SavedAnalysis[],
  entry: SavedAnalysis,
  storage: HistoryStorage,
): HistoryWriteResult {
  const next = [entry, ...items.filter((item) => item.id !== entry.id)].slice(0, HISTORY_MAX_ITEMS);
  try {
    storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
    return { ok: true, items: next };
  } catch {
    // 保存失敗時は呼び出し元の表示状態をストレージと一致させない (残存リスト維持)。
    return { ok: false, items };
  }
}

export function deleteAnalysis(
  items: readonly SavedAnalysis[],
  id: string,
  storage: HistoryStorage,
): HistoryWriteResult {
  const next = items.filter((item) => item.id !== id);
  try {
    storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
    return { ok: true, items: next };
  } catch {
    return { ok: false, items };
  }
}

export function clearHistory(storage: HistoryStorage): HistoryWriteResult {
  try {
    storage.removeItem(HISTORY_STORAGE_KEY);
    return { ok: true, items: [] };
  } catch {
    return { ok: false, items: loadHistory(storage) };
  }
}

export interface ComparisonRow {
  readonly key: string;
  readonly label: string;
  readonly left: string;
  readonly right: string;
  readonly differs: boolean;
}

interface ComparisonValues {
  readonly savedAt: string;
  readonly coordinate: string;
  readonly meanDeg: number | null;
  readonly maxDeg: number | null;
  readonly steepRatio: number | null;
  readonly classified: number;
  readonly ridgeRatio: number | null;
  readonly slopeRatio: number | null;
  readonly valleyRatio: number | null;
  readonly flatRatio: number | null;
  readonly grade: string;
  readonly missingRatio: number | null;
  readonly sectionMeanSlopeDeg: number | null;
  readonly sectionMaxSlopeDeg: number | null;
  readonly checkRequiredCount: number;
}

function comparisonValues(item: SavedAnalysis): ComparisonValues {
  const terrain = item.terrain;
  const stats = terrain?.kind === "ok" ? terrain.stats : null;
  const classes = terrain?.kind === "ok" ? terrain.classes : null;
  const classTotal = classes?.classified ?? 0;
  const section = item.section;
  const sectionStats = section?.kind === "ok" ? section.stats : null;
  const quality = terrain?.kind === "ok" ? terrain.quality : null;
  const cards = buildConfirmCards({ terrain, section });

  return {
    savedAt: item.savedAt,
    coordinate: formatCoordinate(item.coordinate),
    meanDeg: stats?.meanDeg ?? null,
    maxDeg: stats?.maxDeg ?? null,
    steepRatio: stats?.steepRatio ?? null,
    classified: classTotal,
    ridgeRatio: classes !== null && classTotal > 0 ? classes.counts.ridge / classTotal : null,
    slopeRatio: classes !== null && classTotal > 0 ? classes.counts.slope / classTotal : null,
    valleyRatio: classes !== null && classTotal > 0 ? classes.counts.valley / classTotal : null,
    flatRatio: classes !== null && classTotal > 0 ? classes.counts.flat / classTotal : null,
    grade: quality?.grade ?? "—",
    missingRatio: quality?.missingRatio ?? null,
    sectionMeanSlopeDeg: sectionStats?.meanSlopeDeg ?? null,
    sectionMaxSlopeDeg: sectionStats?.maxSlopeDeg ?? null,
    checkRequiredCount: cards.cards.filter((card) => card.status === "CHECK_REQUIRED").length,
  };
}

function addRow(
  rows: ComparisonRow[],
  key: string,
  label: string,
  left: string,
  right: string,
): void {
  rows.push({ key, label, left, right, differs: left !== right });
}

/**
 * 2件の保存済み分析を項目別に比較する。数値は表示文字列で比較し、
 * 差があれば differs=true (値の捏造はせず、データなしは「—」)。
 */
export function compareAnalyses(
  leftItem: SavedAnalysis,
  rightItem: SavedAnalysis,
): readonly ComparisonRow[] {
  const left = comparisonValues(leftItem);
  const right = comparisonValues(rightItem);
  const rows: ComparisonRow[] = [];

  addRow(rows, "savedAt", "保存日時", left.savedAt, right.savedAt);
  addRow(rows, "coordinate", "対象地点", left.coordinate, right.coordinate);
  addRow(rows, "mean", "平均傾斜", formatDeg(left.meanDeg), formatDeg(right.meanDeg));
  addRow(rows, "max", "最大傾斜", formatDeg(left.maxDeg), formatDeg(right.maxDeg));
  addRow(
    rows,
    "steep",
    "急傾斜面 (30°以上) 面積比",
    formatPercent(left.steepRatio),
    formatPercent(right.steepRatio),
  );
  addRow(rows, "classified", "地形分類セル数", String(left.classified), String(right.classified));
  addRow(
    rows,
    "ridge",
    "尾根の割合",
    formatPercent(left.ridgeRatio),
    formatPercent(right.ridgeRatio),
  );
  addRow(
    rows,
    "slope",
    "斜面の割合",
    formatPercent(left.slopeRatio),
    formatPercent(right.slopeRatio),
  );
  addRow(
    rows,
    "valley",
    "谷の割合",
    formatPercent(left.valleyRatio),
    formatPercent(right.valleyRatio),
  );
  addRow(rows, "flat", "平坦の割合", formatPercent(left.flatRatio), formatPercent(right.flatRatio));
  addRow(rows, "grade", "DEM品質グレード", left.grade, right.grade);
  addRow(
    rows,
    "missing",
    "DEM欠損率",
    formatPercent(left.missingRatio),
    formatPercent(right.missingRatio),
  );
  addRow(
    rows,
    "section-mean",
    "断面平均勾配",
    formatDeg(left.sectionMeanSlopeDeg),
    formatDeg(right.sectionMeanSlopeDeg),
  );
  addRow(
    rows,
    "section-max",
    "断面最大勾配",
    formatDeg(left.sectionMaxSlopeDeg),
    formatDeg(right.sectionMaxSlopeDeg),
  );
  addRow(
    rows,
    "checks",
    "要確認カード数",
    String(left.checkRequiredCount),
    String(right.checkRequiredCount),
  );

  return rows;
}
