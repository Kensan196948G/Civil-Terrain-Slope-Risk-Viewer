import type { ReactElement } from "react";
import type { ElevationResult } from "./elevation-client";

export type ElevationPanelState =
  | { readonly phase: "idle" }
  | { readonly phase: "loading"; readonly coordinate: { lat: number; lon: number } }
  | {
      readonly phase: "done";
      readonly coordinate: { lat: number; lon: number };
      readonly result: ElevationResult;
    };

export interface ElevationPanelProps {
  readonly state: ElevationPanelState;
}

/**
 * 地点標高の表示パネル (SCR-02 の最小形)。
 * 「データなし」「取得失敗 (判定不能)」を成功系と明確に区別して表示し、
 * どちらも安全を意味しない旨をテキストで示す (Unknown is not Safe)。
 * 状態は色に依存せず文言と構造で伝える。
 */
export function ElevationPanel({ state }: ElevationPanelProps): ReactElement {
  return (
    <section className="elevation-panel" aria-label="地点標高" aria-live="polite">
      <h2>地点標高</h2>
      {renderBody(state)}
    </section>
  );
}

function renderBody(state: ElevationPanelState): ReactElement {
  if (state.phase === "idle") {
    return <p>地図をクリックすると、その地点の標高を取得します。</p>;
  }

  const where = `緯度 ${state.coordinate.lat.toFixed(5)} / 経度 ${state.coordinate.lon.toFixed(5)}`;

  if (state.phase === "loading") {
    return <p>取得中… ({where})</p>;
  }

  const { result } = state;
  switch (result.kind) {
    case "ok": {
      const provenance = result.point.provenance?.[0];
      return (
        <dl>
          <dt>標高</dt>
          <dd>
            <strong>{result.point.elevationM.toFixed(2)} m</strong>
          </dd>
          <dt>地点</dt>
          <dd>{where}</dd>
          <dt>ソース / 品質</dt>
          <dd>
            <span className="elevation-source">
              {result.point.source} (グレード {result.point.quality.grade})
            </span>
          </dd>
          {provenance !== undefined && (
            <>
              <dt>出典</dt>
              <dd>
                <a href={provenance.termsUrl} target="_blank" rel="noopener noreferrer">
                  {provenance.sourceName}
                </a>{" "}
                (取得 {provenance.retrievedAt})
              </dd>
            </>
          )}
        </dl>
      );
    }
    case "no-coverage":
      return (
        <p className="elevation-note elevation-note--warn">
          ⚠️ この地点の標高データはありません ({where})。
          <strong>データが無いことは安全を意味しません。</strong>
        </p>
      );
    case "unavailable":
      return (
        <p className="elevation-note elevation-note--unknown">
          ❔ データ取得に失敗し、判定不能です ({where})。
          時間をおいて再試行してください。判定不能は安全を意味しません。
        </p>
      );
    case "error":
      return (
        <p className="elevation-note elevation-note--error">
          ❌ 通信エラーが発生しました ({result.message})。再試行してください。
        </p>
      );
  }
}
