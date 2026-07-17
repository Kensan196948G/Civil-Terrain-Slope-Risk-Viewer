import type { ReactElement } from "react";
import { BASE_LAYERS, OVERLAY_LAYERS } from "./layers";
import type { BaseLayerId, LayerSelection, OverlayLayerId } from "./layers";

export interface LayerSwitcherProps {
  readonly selection: LayerSelection;
  readonly onBaseChange: (base: BaseLayerId) => void;
  readonly onOverlayToggle: (overlay: OverlayLayerId, enabled: boolean) => void;
}

/**
 * レイヤー切替コントロール (要件 FR-003, FR-004 / SCR-01)。
 * ベースは排他選択 (radio)、重ね合わせは複数選択 (checkbox)。
 * 状態は色ではなくネイティブコントロールとテキストラベルで伝える
 * (画面設計とアクセシビリティ: 非色依存の原則)。
 */
export function LayerSwitcher({
  selection,
  onBaseChange,
  onOverlayToggle,
}: LayerSwitcherProps): ReactElement {
  return (
    <div className="layer-switcher">
      <fieldset>
        <legend>ベースマップ</legend>
        {BASE_LAYERS.map((layer) => (
          <label key={layer.id}>
            <input
              type="radio"
              name="base-layer"
              value={layer.id}
              checked={selection.base === layer.id}
              onChange={() => {
                onBaseChange(layer.id);
              }}
            />
            {layer.label}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>重ね合わせ</legend>
        {OVERLAY_LAYERS.map((layer) => (
          <label key={layer.id}>
            <input
              type="checkbox"
              name="overlay-layer"
              value={layer.id}
              checked={selection.overlays.includes(layer.id)}
              onChange={(event) => {
                onOverlayToggle(layer.id, event.currentTarget.checked);
              }}
            />
            {layer.label}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
