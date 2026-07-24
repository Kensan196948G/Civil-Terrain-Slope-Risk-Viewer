import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { ElevationPanel } from "./elevation/ElevationPanel";
import type { ElevationPanelState } from "./elevation/ElevationPanel";
import { fetchElevation } from "./elevation/elevation-client";
import { LayerSwitcher } from "./map/LayerSwitcher";
import { MapView } from "./map/MapView";
import { BASE_LAYERS, OVERLAY_LAYERS } from "./map/layers";
import type { BaseLayerId, OverlayLayerId } from "./map/layers";
import { parseMapState, serializeMapState } from "./map/map-state";
import type { MapViewState } from "./map/map-state";
import "./app.css";

/**
 * SCR-01 ホーム/地図 (要件 7章)。Sprint 1 の範囲はベース/重ね合わせレイヤーの
 * 切替・帰属表示・表示状態の共有URL (ハッシュ) まで。検索・分析は後続Sprint。
 *
 * 視覚デザインは Claude Design「Slope Risk Viewer redesign」を正本とする
 * (Issue #23)。未実装機能のナビ項目は「準備中」の非対話表示とし、モック
 * データの画面 (地形分析の数値等) は実装しない — 架空の値を示すことは
 * 「データなし ≠ 安全」という本製品の原則に反するため。
 */

/** ナビ項目。実装済みは SCR-01 (地図) のみ。他は後続Sprintの予告表示。 */
const NAV_ITEMS = [
  { icon: "🗺️", label: "地図", ready: true },
  { icon: "⛰️", label: "地形分析", ready: false },
  { icon: "📈", label: "断面分析", ready: false },
  { icon: "⚠️", label: "確認支援", ready: false },
  { icon: "🧾", label: "出力・共有", ready: false },
] as const;

export function App(): ReactElement {
  const [view, setView] = useState<MapViewState>(() => parseMapState(window.location.hash));
  const [elevation, setElevation] = useState<ElevationPanelState>({ phase: "idle" });
  // Serial number guards against out-of-order responses when clicking quickly.
  const requestSeq = useRef(0);

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

  const handleMapClick = useCallback((coordinate: { lat: number; lon: number }) => {
    const seq = ++requestSeq.current;
    setElevation({ phase: "loading", coordinate });
    void fetchElevation(coordinate).then((result) => {
      if (requestSeq.current === seq) {
        setElevation({ phase: "done", coordinate, result });
      }
    });
  }, []);

  // 実状態から表示中レイヤーのラベルを引く (トップバー副題と地図カードのチップ)。
  const activeBaseLabel = BASE_LAYERS.find((layer) => layer.id === view.base)?.label ?? "";
  const activeOverlays = OVERLAY_LAYERS.filter((layer) => view.overlays.includes(layer.id));
  const selectedLabels = [activeBaseLabel, ...activeOverlays.map((layer) => layer.label)]
    .filter((label) => label !== "")
    .join(" + ");

  return (
    <div className="app">
      <aside className="app-sidebar">
        <div className="app-brand">
          <span className="app-brand-icon" aria-hidden="true">
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 21h18" />
              <path d="M5 21V7l8-4v18" />
              <path d="M19 21V11l-6-4" />
            </svg>
          </span>
          <div>
            <h1>
              Civil Terrain<span className="visually-hidden"> &amp; Slope Risk Viewer</span>
            </h1>
            <p>傾斜リスク可視化</p>
          </div>
        </div>
        <nav className="app-nav" aria-label="機能メニュー">
          <span className="section-label">メニュー</span>
          {NAV_ITEMS.map((item) =>
            item.ready ? (
              <span key={item.label} className="nav-item nav-item--active" aria-current="page">
                <span className="nav-item-icon" aria-hidden="true">
                  {item.icon}
                </span>
                {item.label}
              </span>
            ) : (
              <span key={item.label} className="nav-item nav-item--disabled">
                <span className="nav-item-icon" aria-hidden="true">
                  {item.icon}
                </span>
                {item.label}
                <span className="nav-chip">準備中</span>
              </span>
            ),
          )}
        </nav>
        <div className="sidebar-rule" aria-hidden="true" />
        <div aria-label="地図レイヤー設定" role="group">
          <LayerSwitcher
            selection={view}
            onBaseChange={handleBaseChange}
            onOverlayToggle={handleOverlayToggle}
          />
        </div>
        <ElevationPanel state={elevation} />
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div>
            <h2>工事候補地 初期確認</h2>
            <p>{selectedLabels}</p>
          </div>
        </header>
        <main className="app-content">
          <p className="safety-banner" role="note">
            <span aria-hidden="true">⚠️</span>
            <span>
              この画面は初期確認の支援を目的としています。
              <strong>「データなし」「判定不能」は安全 (リスクなし) を意味しません。</strong>
              現地調査・専門家確認の要否を必ず検討してください。
            </span>
          </p>
          <section className="app-map" aria-label="地図表示">
            <div className="map-card-header">
              <div>
                <h3>地図</h3>
                <p>国土地理院タイル・出典常設表示</p>
              </div>
              <span className="map-card-spacer" />
              <span className="chip chip--accent">{activeBaseLabel}</span>
              {activeOverlays.map((layer) => (
                <span key={layer.id} className="chip">
                  {layer.label}
                </span>
              ))}
            </div>
            <MapView view={view} onViewChange={handleViewChange} onMapClick={handleMapClick} />
          </section>
        </main>
      </div>
    </div>
  );
}
