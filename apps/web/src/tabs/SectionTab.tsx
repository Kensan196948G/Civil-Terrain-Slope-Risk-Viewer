import type { ReactElement } from "react";
import { StatusBadge } from "@civil-terrain/ui";
import type { SectionAnalysisResult } from "../analysis/section-service";
import { MAX_SECTION_LENGTH_M, MIN_SECTION_LENGTH_M } from "../analysis/section-service";
import { formatCoordinate, formatDeg, formatMeters, formatPercent } from "../analysis/format";
import type { Coordinate } from "../search/site-search";
import { QualityPanel } from "./QualityPanel";
import { SectionProfileChart } from "./SectionProfileChart";

/** 断面線の指定フェーズ (地図クリックで始点→終点の順に指定)。 */
export type SectionPickPhase = "idle" | "await-start" | "await-end";

/** App が保持する断面分析の進行状態。 */
export type SectionAnalysisState =
  | { readonly phase: "idle" }
  | { readonly phase: "running" }
  | { readonly phase: "done"; readonly result: SectionAnalysisResult };

export interface SectionTabProps {
  readonly pick: SectionPickPhase;
  readonly start: Coordinate | null;
  readonly end: Coordinate | null;
  readonly analysis: SectionAnalysisState;
  readonly onStartPicking: () => void;
  readonly onCancelPicking: () => void;
  readonly onRetry: () => void;
}

/**
 * 断面分析タブ (設計仕様 8.4)。地図上で指定した始点→終点の直線に沿って
 * DEM 実データから縦断プロファイルと勾配統計を計算・表示する。
 */
export function SectionTab({
  pick,
  start,
  end,
  analysis,
  onStartPicking,
  onCancelPicking,
  onRetry,
}: SectionTabProps): ReactElement {
  return (
    <section className="analysis-tab" aria-label="断面分析">
      {renderBody({ pick, start, end, analysis, onStartPicking, onCancelPicking, onRetry })}
    </section>
  );
}

function renderBody(props: SectionTabProps): ReactElement {
  const { pick, start, end, analysis, onStartPicking, onCancelPicking, onRetry } = props;

  if (pick !== "idle") {
    return (
      <div className="select-point-empty" aria-live="polite">
        <div className="select-point-empty-icon" aria-hidden="true">
          📐
        </div>
        <h3>{pick === "await-start" ? "断面の始点を指定" : "断面の終点を指定"}</h3>
        <p>
          地図タブで{pick === "await-start" ? "始点" : "終点"}をクリックしてください。
          {start !== null ? ` 始点: ${formatCoordinate(start)}` : ""}
        </p>
        <button type="button" className="btn" onClick={onCancelPicking}>
          指定をやめる
        </button>
      </div>
    );
  }

  if (start === null || end === null) {
    return (
      <div className="select-point-empty">
        <div className="select-point-empty-icon" aria-hidden="true">
          📐
        </div>
        <h3>断面線が未指定です</h3>
        <p>
          地図上で始点と終点をクリックして断面線を指定すると、DEM
          実データから縦断プロファイルを計算します (長さ {MIN_SECTION_LENGTH_M}m〜
          {formatMeters(MAX_SECTION_LENGTH_M)})。
        </p>
        <button type="button" className="btn btn--primary" onClick={onStartPicking}>
          地図で断面線を指定
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="target-point-bar">
        <span className="target-point-label">断面線:</span>
        <span className="target-point-coord">
          {formatCoordinate(start)} → {formatCoordinate(end)}
        </span>
        <button type="button" className="btn btn--small" onClick={onStartPicking}>
          線を引き直す
        </button>
      </div>
      {renderAnalysis(analysis, onRetry)}
    </>
  );
}

function renderAnalysis(analysis: SectionAnalysisState, onRetry: () => void): ReactElement {
  if (analysis.phase !== "done") {
    return (
      <div className="analysis-card" aria-busy="true">
        <StatusBadge status="PENDING" />
        <p className="analysis-card-text">断面に沿って DEM をサンプリングしています…</p>
      </div>
    );
  }

  const result = analysis.result;
  if (result.kind === "too-short") {
    return (
      <p className="analysis-note analysis-note--warn" role="note">
        断面線が短すぎます ({formatMeters(result.lengthM)})。{MIN_SECTION_LENGTH_M}m
        以上の線を指定してください。
      </p>
    );
  }
  if (result.kind === "too-long") {
    return (
      <p className="analysis-note analysis-note--warn" role="note">
        断面線が長すぎます ({formatMeters(result.lengthM)})。
        {formatMeters(MAX_SECTION_LENGTH_M)} 以下の線を指定してください。
      </p>
    );
  }
  if (result.kind === "no-coverage") {
    return (
      <p className="analysis-note analysis-note--warn" role="note">
        この断面の DEM データはありません。
        <strong>データが無いことは安全を意味しません。</strong>
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
  return (
    <>
      <div className="analysis-card">
        <div className="analysis-card-header">
          <h4>縦断プロファイル</h4>
          <p>{stats.sampleCount} サンプル・欠損は補間せず表示</p>
        </div>
        <SectionProfileChart samples={result.samples} />
      </div>
      <div className="stat-grid stat-grid--five">
        <div className="stat-card">
          <span className="stat-label">総延長</span>
          <span className="stat-value stat-value--small">{formatMeters(stats.totalLengthM)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">累積上昇</span>
          <span className="stat-value stat-value--small">{formatMeters(stats.gainM)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">累積下降</span>
          <span className="stat-value stat-value--small">{formatMeters(stats.lossM)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">平均勾配</span>
          <span className="stat-value stat-value--small">{formatDeg(stats.meanSlopeDeg)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">最大勾配</span>
          <span
            className={`stat-value stat-value--small${
              stats.maxSlopeDeg !== null && stats.maxSlopeDeg >= 25 ? " stat-value--danger" : ""
            }`}
          >
            {formatDeg(stats.maxSlopeDeg)}
          </span>
        </div>
      </div>
      {stats.validSampleRatio < 1 ? (
        <p className="analysis-note analysis-note--unknown" role="note">
          有効サンプル率 {formatPercent(stats.validSampleRatio)}
          。欠損区間は勾配評価から除外しています。
          <strong>判定不能は安全を意味しません。</strong>
        </p>
      ) : null}
      <QualityPanel quality={result.quality} provenance={result.provenance} />
    </>
  );
}
