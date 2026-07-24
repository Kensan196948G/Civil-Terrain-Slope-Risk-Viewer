import type { ReactElement } from "react";
import type { ElevationPanelState } from "./ElevationPanel";

export interface DemMetaCardsProps {
  readonly state: ElevationPanelState;
}

/** ISO日時から日付部分のみ取り出す。想定外の形式はそのまま表示する。 */
function formatRetrievedAt(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? value;
}

/**
 * 地図カード直下の DEM 取得情報カード。デザインの4枚カード (出典・取得日時・
 * 解像度・欠損率) を、実際に API から得た値だけで再構成する:
 * - 出典・取得日時は provenance、品質グレード・カバレッジは quality から表示。
 * - デザインの「解像度 5 m」「欠損率 0.0%」は API が返さない値のため表示しない
 *   (根拠のない品質数値は「データなし ≠ 安全」の原則に反する)。
 * - 取得前・失敗時はその状態を明示する。
 */
export function DemMetaCards({ state }: DemMetaCardsProps): ReactElement {
  if (state.phase === "idle") {
    return (
      <p className="dem-meta-note">
        地図をクリックすると、取得した DEM の出典・品質情報をここに表示します。
      </p>
    );
  }

  if (state.phase === "loading") {
    return <p className="dem-meta-note">DEM 情報を取得しています…</p>;
  }

  const result = state.result;
  if (result.kind === "no-coverage") {
    return (
      <p className="dem-meta-note dem-meta-note--warn">
        この地点の DEM データはありません。データが無いことは安全を意味しません。
      </p>
    );
  }
  if (result.kind !== "ok") {
    return (
      <p className="dem-meta-note dem-meta-note--error">
        DEM 情報の取得に失敗しました。時間をおいて再試行してください。
      </p>
    );
  }

  const provenance = result.point.provenance?.[0];
  return (
    <dl className="dem-meta-grid" aria-label="DEM取得情報">
      <div className="dem-meta-card">
        <dt>出典</dt>
        <dd>{provenance?.sourceName ?? result.point.source}</dd>
      </div>
      <div className="dem-meta-card">
        <dt>データソース</dt>
        <dd className="dem-meta-value--mono">{result.point.source}</dd>
      </div>
      <div className="dem-meta-card">
        <dt>品質グレード</dt>
        <dd className="dem-meta-value--mono">{result.point.quality.grade}</dd>
      </div>
      <div className="dem-meta-card">
        <dt>取得日時</dt>
        <dd className="dem-meta-value--mono">
          {provenance !== undefined ? formatRetrievedAt(provenance.retrievedAt) : "—"}
        </dd>
      </div>
    </dl>
  );
}
