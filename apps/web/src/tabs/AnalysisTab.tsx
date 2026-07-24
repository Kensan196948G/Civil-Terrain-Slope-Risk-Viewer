import type { ReactElement } from "react";
import type { Coordinate } from "../search/site-search";
import type { TabDef } from "./tabs";

export interface AnalysisTabProps {
  readonly tab: TabDef;
  /** クリック/検索で選択中の地点。未選択なら null。 */
  readonly selectedPoint: Coordinate | null;
  readonly onGoToMap: () => void;
}

function formatCoordinate(coordinate: Coordinate): string {
  return `緯度 ${coordinate.lat.toFixed(5)} / 経度 ${coordinate.lon.toFixed(5)}`;
}

/**
 * 地形分析・断面分析・確認支援タブの本文。
 *
 * - 地点未選択: デザインの「地点が未選択です」空状態カードを流用 (本製品の
 *   導線と一致するため 100% 反映)。
 * - 地点選択済み: デザインは平均傾斜 14.8° 等のモック数値・所見を表示するが、
 *   これらは実際には未計算の架空値であり「データなし ≠ 安全」に反するため
 *   実装しない。代わりに実座標の対象地点バーと「準備中」を表示する。
 */
export function AnalysisTab({ tab, selectedPoint, onGoToMap }: AnalysisTabProps): ReactElement {
  const heading = tab.pending?.title ?? tab.label;
  const description = tab.pending?.description ?? "";

  if (selectedPoint === null) {
    return (
      <section className="select-point-empty" aria-label={`${heading}（地点未選択）`}>
        <div className="select-point-empty-icon" aria-hidden="true">
          📍
        </div>
        <h3>地点が未選択です</h3>
        <p>地図タブで地点をクリックするか、検索欄から住所・地名・座標を指定してください。</p>
        <button type="button" className="btn btn--primary" onClick={onGoToMap}>
          地図タブへ
        </button>
      </section>
    );
  }

  return (
    <section className="analysis-pending" aria-label={heading}>
      <div className="target-point-bar">
        <span className="target-point-label">対象地点:</span>
        <span className="target-point-coord">{formatCoordinate(selectedPoint)}</span>
      </div>
      <div className="pending-card">
        <div className="pending-card-header">
          <h3>{heading}</h3>
          <span className="chip">準備中</span>
        </div>
        <p>{description}</p>
        <p className="pending-note">
          この分析機能は後続スプリントで実装予定です。確定していない値を表示しないため、
          現時点では数値・所見を出しません。
          <strong>表示が無いことはリスクが無いことを意味しません。</strong>
        </p>
      </div>
    </section>
  );
}
