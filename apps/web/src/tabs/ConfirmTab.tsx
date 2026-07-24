import type { ReactElement } from "react";
import { StatusBadge } from "@civil-terrain/ui";
import { CARD_ALGORITHM_VERSION, buildConfirmCards } from "../analysis/confirm-cards";
import type { SectionAnalysisResult } from "../analysis/section-service";
import type { TerrainAnalysisResult } from "../analysis/terrain-service";
import { formatCoordinate } from "../analysis/format";
import type { Coordinate } from "../search/site-search";
import { SelectPointEmpty } from "./SelectPointEmpty";

export interface ConfirmTabProps {
  readonly selectedPoint: Coordinate | null;
  readonly terrainRunning: boolean;
  readonly terrain: TerrainAnalysisResult | null;
  readonly section: SectionAnalysisResult | null;
  readonly onGoToMap: () => void;
}

/**
 * 確認支援タブ (設計仕様 8.6)。地形分析・断面分析の実測メトリクスをルール評価し、
 * 現地確認が必要な項目をカードで提示する。
 *
 * - カードの単純加算による総合危険度は表示しない (spec 禁止事項)。
 * - 該当なしは「安全」ではなく「しきい値超過なし」とだけ述べる。
 */
export function ConfirmTab({
  selectedPoint,
  terrainRunning,
  terrain,
  section,
  onGoToMap,
}: ConfirmTabProps): ReactElement {
  if (selectedPoint === null) {
    return <SelectPointEmpty heading="確認支援" onGoToMap={onGoToMap} />;
  }

  return (
    <section className="analysis-tab" aria-label="確認支援">
      <div className="target-point-bar">
        <span className="target-point-label">対象地点:</span>
        <span className="target-point-coord">{formatCoordinate(selectedPoint)}</span>
      </div>
      {terrainRunning ? (
        <div className="analysis-card" aria-busy="true">
          <StatusBadge status="PENDING" />
          <p className="analysis-card-text">地形分析の完了を待っています…</p>
        </div>
      ) : (
        renderCards(terrain, section)
      )}
    </section>
  );
}

function renderCards(
  terrain: TerrainAnalysisResult | null,
  section: SectionAnalysisResult | null,
): ReactElement {
  const output = buildConfirmCards({ terrain, section });

  return (
    <>
      <div className="analysis-card analysis-card--flush">
        <div className="analysis-card-header">
          <h4>確認支援カード</h4>
          <p>実測メトリクスのルール評価 ({CARD_ALGORITHM_VERSION})</p>
        </div>
        {output.cards.length > 0 ? (
          <ul className="check-card-list">
            {output.cards.map((card) => (
              <li key={card.code} className="check-card">
                <StatusBadge status={card.status} />
                <div className="check-card-body">
                  <h5>{card.title}</h5>
                  <p>{card.observation}</p>
                  {card.recommendedChecks.length > 0 ? (
                    <p className="check-card-recommendation">
                      推奨: {card.recommendedChecks.join(" / ")}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="analysis-card-text">
            しきい値を超過した項目はありません。
            <strong>これは安全の保証ではありません</strong> — 評価は限られたルールと DEM
            解像度の範囲に留まります。
          </p>
        )}
      </div>
      <p className="analysis-card-footnote">
        しきい値未達 {output.passedCount} 件
        {output.skippedCount > 0
          ? ` / 未評価 ${output.skippedCount} 件 (断面未指定・解析未実行のルール)`
          : ""}
        。総合危険度の合算は行いません。
      </p>
    </>
  );
}
