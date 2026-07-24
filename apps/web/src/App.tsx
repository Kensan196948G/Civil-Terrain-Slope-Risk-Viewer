import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { DemMetaCards } from "./elevation/DemMetaCards";
import { ElevationPanel } from "./elevation/ElevationPanel";
import type { ElevationPanelState } from "./elevation/ElevationPanel";
import { fetchElevation } from "./elevation/elevation-client";
import { LayerSwitcher } from "./map/LayerSwitcher";
import { MapView } from "./map/MapView";
import type { MapFocusRequest } from "./map/MapView";
import { BASE_LAYERS, OVERLAY_LAYERS } from "./map/layers";
import type { BaseLayerId, OverlayLayerId } from "./map/layers";
import { parseMapState, serializeMapState } from "./map/map-state";
import type { MapViewState } from "./map/map-state";
import { SiteSearch } from "./search/SiteSearch";
import { parseSearchQuery } from "./search/site-search";
import type { Coordinate } from "./search/site-search";
import { AnalysisTab } from "./tabs/AnalysisTab";
import { AppNav } from "./tabs/AppNav";
import { OutputTab } from "./tabs/OutputTab";
import { TABS, findTab } from "./tabs/tabs";
import type { TabId } from "./tabs/tabs";
import "./app.css";

/**
 * SCR-01 ホーム/地図 (要件 7章)。視覚デザインは Claude Design「Slope Risk
 * Viewer redesign」を正本とし、レイアウト・タブ・検索・マーカーまで反映する
 * (Issue #23)。ただしデザインのモック値 (地形分析の数値・所見・欠損率・架空
 * ユーザー等) は実装しない — 架空の値を示すことは「データなし ≠ 安全」という
 * 本製品の原則に反するため。未実装の分析タブは実座標と「準備中」を表示する。
 */

/** 検索確定時のズーム (デザイン仕様)。 */
const SEARCH_FOCUS_ZOOM = 11;

const SEARCH_NOT_FOUND_MESSAGE = "該当する地点が見つかりませんでした。緯度,経度でも検索できます。";

/** トップバー右端の DEM 取得状況ピル。実際の標高取得状態から導出する。 */
function demStatus(elevation: ElevationPanelState): { className: string; text: string } {
  if (elevation.phase === "loading") {
    return { className: "dem-pill dem-pill--loading", text: "DEM取得中…" };
  }
  if (elevation.phase === "done") {
    switch (elevation.result.kind) {
      case "ok":
        return { className: "dem-pill dem-pill--ok", text: "DEM取得 完了" };
      case "no-coverage":
        return { className: "dem-pill dem-pill--warn", text: "DEMデータなし" };
      case "unavailable":
      case "error":
        return { className: "dem-pill dem-pill--error", text: "DEM取得 失敗" };
    }
  }
  return { className: "dem-pill", text: "DEM未取得" };
}

export function App(): ReactElement {
  const [view, setView] = useState<MapViewState>(() => parseMapState(window.location.hash));
  const [activeTab, setActiveTab] = useState<TabId>("map");
  const [elevation, setElevation] = useState<ElevationPanelState>({ phase: "idle" });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocusRequest | null>(null);
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

  const handleSearchQueryChange = useCallback((query: string) => {
    setSearchQuery(query);
    setSearchError(null);
  }, []);

  const handleSearchSubmit = useCallback(() => {
    const resolution = parseSearchQuery(searchQuery);
    if (resolution.kind === "empty") {
      return;
    }
    if (resolution.kind === "not-found") {
      setSearchError(SEARCH_NOT_FOUND_MESSAGE);
      return;
    }
    setSearchError(null);
    setActiveTab("map");
    setFocus((current) => ({
      coordinate: resolution.coordinate,
      zoom: SEARCH_FOCUS_ZOOM,
      token: (current?.token ?? 0) + 1,
    }));
    handleMapClick(resolution.coordinate);
  }, [searchQuery, handleMapClick]);

  const handleGoToMap = useCallback(() => {
    setActiveTab("map");
  }, []);

  // 実状態から表示中レイヤーのラベルを引く (トップバー副題と地図カードのチップ)。
  const activeBaseLabel = BASE_LAYERS.find((layer) => layer.id === view.base)?.label ?? "";
  const activeOverlays = OVERLAY_LAYERS.filter((layer) => view.overlays.includes(layer.id));
  const selectedLabels = [activeBaseLabel, ...activeOverlays.map((layer) => layer.label)]
    .filter((label) => label !== "")
    .join(" + ");

  const activeTabDef = findTab(activeTab);
  const topbarSub = activeTab === "map" ? selectedLabels : activeTabDef.topbarSub;
  // 選択地点は標高取得状態から導出する (別 state にすると乖離バグの温床)。
  const selectedPoint: Coordinate | null = elevation.phase === "idle" ? null : elevation.coordinate;
  const dem = demStatus(elevation);
  const shareUrl = `${window.location.origin}${window.location.pathname}#${serializeMapState(view)}`;

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
        <AppNav tabs={TABS} activeTab={activeTab} onSelect={setActiveTab} />
        <div className="sidebar-rule" aria-hidden="true" />
        {activeTab === "map" ? (
          <>
            <div aria-label="地図レイヤー設定" role="group">
              <LayerSwitcher
                selection={view}
                onBaseChange={handleBaseChange}
                onOverlayToggle={handleOverlayToggle}
              />
            </div>
            <ElevationPanel state={elevation} />
          </>
        ) : (
          <p className="sidebar-context">{activeTabDef.context}</p>
        )}
        <div className="sidebar-spacer" aria-hidden="true" />
        <div className="user-footer">
          <span className="user-footer-avatar" aria-hidden="true">
            👤
          </span>
          <div className="user-footer-body">
            <p className="user-footer-name">ゲスト利用</p>
            <p className="user-footer-note">認証機能は準備中</p>
          </div>
          <span className="mvp-badge">MVP</span>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div>
            <h2>工事候補地 初期確認</h2>
            <p>{topbarSub}</p>
          </div>
          <span className="topbar-spacer" />
          <SiteSearch
            query={searchQuery}
            error={searchError}
            onQueryChange={handleSearchQueryChange}
            onSubmit={handleSearchSubmit}
          />
          <span className={dem.className}>
            <span className="dem-pill-dot" aria-hidden="true" />
            {dem.text}
          </span>
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
          {/* 地図タブは unmount せず CSS で隠す: MapLibre の地図とタイル
              キャッシュを保つ (デザインの mapTabDisplay と同じ方針)。 */}
          <div className={`tab-panel${activeTab === "map" ? "" : " tab-panel--hidden"}`}>
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
              <MapView
                view={view}
                onViewChange={handleViewChange}
                onMapClick={handleMapClick}
                selectedPoint={selectedPoint}
                focus={focus}
              />
            </section>
            <DemMetaCards state={elevation} />
          </div>
          {activeTab === "terrain" || activeTab === "cross-section" || activeTab === "confirm" ? (
            <AnalysisTab
              tab={activeTabDef}
              selectedPoint={selectedPoint}
              onGoToMap={handleGoToMap}
            />
          ) : null}
          {activeTab === "output" ? <OutputTab shareUrl={shareUrl} /> : null}
        </main>
      </div>
    </div>
  );
}
