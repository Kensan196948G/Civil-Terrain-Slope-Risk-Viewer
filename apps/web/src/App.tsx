import { useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { LayerSwitcher } from "./map/LayerSwitcher";
import { MapView } from "./map/MapView";
import type { BaseLayerId, OverlayLayerId } from "./map/layers";
import { parseMapState, serializeMapState } from "./map/map-state";
import type { MapViewState } from "./map/map-state";
import "./app.css";

/**
 * SCR-01 ホーム/地図 (要件 7章)。Sprint 1 の範囲はベース/重ね合わせレイヤーの
 * 切替・帰属表示・表示状態の共有URL (ハッシュ) まで。検索・分析は後続Sprint。
 */
export function App(): ReactElement {
  const [view, setView] = useState<MapViewState>(() => parseMapState(window.location.hash));

  useEffect(() => {
    // 共有URL: 表示状態 (非機密の視点とレイヤー選択のみ) をハッシュへ反映する。
    // replaceState を使い、地図操作のたびに履歴を積まない。
    history.replaceState(null, "", `#${serializeMapState(view)}`);
  }, [view]);

  const handleViewChange = useCallback((next: MapViewState) => {
    setView(next);
  }, []);

  const handleBaseChange = useCallback((base: BaseLayerId) => {
    setView((current) => ({ ...current, base }));
  }, []);

  const handleOverlayToggle = useCallback((overlay: OverlayLayerId, enabled: boolean) => {
    setView((current) => {
      const others = current.overlays.filter((id) => id !== overlay);
      return { ...current, overlays: enabled ? [...others, overlay] : others };
    });
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Civil Terrain &amp; Slope Risk Viewer</h1>
        <p>公開地形データから工事候補地の標高・傾斜・地形分類を可視化します。</p>
      </header>
      <main className="app-main">
        <aside className="app-sidebar" aria-label="地図レイヤー設定">
          <LayerSwitcher
            selection={view}
            onBaseChange={handleBaseChange}
            onOverlayToggle={handleOverlayToggle}
          />
        </aside>
        <section className="app-map" aria-label="地図表示">
          <MapView view={view} onViewChange={handleViewChange} />
        </section>
      </main>
    </div>
  );
}
