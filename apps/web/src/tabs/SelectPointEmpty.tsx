import type { ReactElement } from "react";

export interface SelectPointEmptyProps {
  readonly heading: string;
  readonly onGoToMap: () => void;
}

/** 地点未選択の空状態カード (各分析タブ共通)。 */
export function SelectPointEmpty({ heading, onGoToMap }: SelectPointEmptyProps): ReactElement {
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
