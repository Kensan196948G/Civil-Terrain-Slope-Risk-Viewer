import type { ReactElement } from "react";
import { StatusBadge } from "@civil-terrain/ui";
import type { TerrainAnalysisResult } from "../analysis/terrain-service";
import { TERRAIN_CELL_M, TERRAIN_GRID_SIZE } from "../analysis/terrain-service";
import { formatCoordinate, formatDeg, formatPercent } from "../analysis/format";
import type { Coordinate } from "../search/site-search";
import { QualityPanel } from "./QualityPanel";
import { SelectPointEmpty } from "./SelectPointEmpty";

/** App が保持する地形分析の進行状態。 */
export type TerrainState =
  | { readonly phase: "idle" }
  | { readonly phase: "running"; readonly coordinate: Coordinate }
  | {
      readonly phase: "done";
      readonly coordinate: Coordinate;
      readonly result: TerrainAnalysisResult;
    };

export interface TerrainTabProps {
  readonly selectedPoint: Coordinate | null;
  readonly state: TerrainState;
  readonly onGoToMap: () => void;
  readonly onRetry: () => void;
}

const CLASS_LEGEND = [
  { key: "ridge", label: "尾根", varName: "--blue-2" },
  { key: "slope", label: "斜面", varName: "--green-2" },
  { key: "valley", label: "谷", varName: "--amber" },
  { key: "flat", label: "平坦", varName: "--purple" },
] as const;

/**
 * 地形分析タブ (設計仕様 8.3)。選択地点周辺の DEM 実データから計算した
 * Horn 傾斜統計と TPI 地形分類を表示する。欠損・失敗は隠さず判定不能として示す。
 */
export function TerrainTab({
  selectedPoint,
  state,
  onGoToMap,
  onRetry,
}: TerrainTabProps): ReactElement {
  if (selectedPoint === null) {
    return <SelectPointEmpty heading="地形分析" onGoToMap={onGoToMap} />;
  }

  return (
    <section className="analysis-tab" aria-label="地形分析">
      <div className="target-point-bar">
        <span className="target-point-label">対象地点:</span>
        <span className="target-point-coord">{formatCoordinate(selectedPoint)}</span>
        <span className="target-point-note">
          周辺 約{(TERRAIN_GRID_SIZE - 1) * TERRAIN_CELL_M}m四方・{TERRAIN_CELL_M}m格子で評価
        </span>
      </div>
      {renderBody(state, onRetry)}
    </section>
  );
}

function renderBody(state: TerrainState, onRetry: () => void): ReactElement {
  if (state.phase !== "done") {
    return (
      <div className="analysis-card" aria-busy="true">
        <StatusBadge status="PENDING" />
        <p className="analysis-card-text">DEM タイルを取得して傾斜統計を計算しています…</p>
      </div>
    );
  }

  const result = state.result;
  if (result.kind === "no-coverage") {
    return (
      <p className="analysis-note analysis-note--warn" role="note">
        この範囲の DEM データはありません。
        <strong>データが無いことは安全を意味しません。</strong>
        現地調査・専門家確認の要否を検討してください。
      </p>
    );
  }
  if (result.kind === "unavailable" || result.kind === "error") {
    return (
      <div className="analysis-note analysis-note--error" role="note">
        <p>
          DEM の取得に失敗しました。データの不在は断定できません (判定不能)。
          <strong>判定不能は安全を意味しません。</strong>
        </p>
        <button type="button" className="btn" onClick={onRetry}>
          再試行
        </button>
      </div>
    );
  }

  const stats = result.stats;
  const classes = result.classes;
  const classTotal = classes.classified;

  return (
    <>
      {stats !== null ? (
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-label">平均傾斜</span>
            <span className="stat-value">{formatDeg(stats.meanDeg)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">最大傾斜</span>
            <span
              className={`stat-value${stats.maxDeg >= stats.steepThresholdDeg ? " stat-value--danger" : ""}`}
            >
              {formatDeg(stats.maxDeg)}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">急傾斜 ({stats.steepThresholdDeg}°以上) 面積比</span>
            <span className={`stat-value${stats.steepRatio > 0 ? " stat-value--warn" : ""}`}>
              {formatPercent(stats.steepRatio)}
            </span>
          </div>
        </div>
      ) : (
        <p className="analysis-note analysis-note--unknown" role="note">
          有効な標高セルが不足しており、傾斜統計を計算できません (判定不能)。
          <strong>判定不能は安全を意味しません。</strong>
        </p>
      )}

      <div className="analysis-card">
        <div className="analysis-card-header">
          <h4>地形分類 内訳</h4>
          <p>TPI (地形位置指数) による簡易分類・{classTotal}セル評価</p>
        </div>
        {classTotal > 0 ? (
          <>
            <div className="class-bar" aria-hidden="true">
              {CLASS_LEGEND.map(({ key, varName }) => (
                <span
                  key={key}
                  style={{
                    width: `${(classes.counts[key] / classTotal) * 100}%`,
                    background: `var(${varName})`,
                  }}
                />
              ))}
            </div>
            <ul className="class-legend">
              {CLASS_LEGEND.map(({ key, label, varName }) => (
                <li key={key}>
                  <span className="class-swatch" style={{ background: `var(${varName})` }} />
                  <span className="class-name">{label}</span>
                  <span className="class-ratio">
                    {formatPercent(classes.counts[key] / classTotal)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="analysis-card-text">分類できたセルがありません (判定不能)。</p>
        )}
        {classes.unknown > 0 ? (
          <p className="analysis-card-footnote">
            {classes.unknown} セルはデータ欠損の影響で分類できませんでした
            (判定不能は安全を意味しません)。
          </p>
        ) : null}
      </div>

      <QualityPanel quality={result.quality} provenance={result.provenance} />
    </>
  );
}
