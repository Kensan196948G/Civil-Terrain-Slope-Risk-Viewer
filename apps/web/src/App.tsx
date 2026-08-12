import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { DemTileStore } from "./analysis/elevation-sampler";
import { analyzeSection } from "./analysis/section-service";
import { analyzeTerrain } from "./analysis/terrain-service";
import { DemMetaCards } from "./elevation/DemMetaCards";
import { ElevationPanel } from "./elevation/ElevationPanel";
import type { ElevationPanelState } from "./elevation/ElevationPanel";
import { fetchElevation } from "./elevation/elevation-client";
import { LayerSwitcher } from "./map/LayerSwitcher";
import { MapErrorBoundary } from "./map/MapErrorBoundary";
import type { MapFocusRequest, SectionLineState } from "./map/MapView";
import { BASE_LAYERS, OVERLAY_LAYERS } from "./map/layers";
import type { BaseLayerId, OverlayLayerId } from "./map/layers";
import { parseMapState, serializeMapState } from "./map/map-state";
import type { MapViewState } from "./map/map-state";
import { SiteSearch } from "./search/SiteSearch";
import { parseSearchQuery } from "./search/site-search";
import type { Coordinate } from "./search/site-search";
import { AppNav } from "./tabs/AppNav";
import { buildConfirmCards } from "./analysis/confirm-cards";
import { ConfirmTab } from "./tabs/ConfirmTab";
import { OutputTab } from "./tabs/OutputTab";
import { SectionTab } from "./tabs/SectionTab";
import type { SectionAnalysisState, SectionPickPhase } from "./tabs/SectionTab";
import { TerrainTab } from "./tabs/TerrainTab";
import type { TerrainState } from "./tabs/TerrainTab";
import { TABS, findTab } from "./tabs/tabs";
import type { TabId } from "./tabs/tabs";
import "./app.css";

/**
 * MapLibre GL JS は 1MB 超の重い依存のため、地図タブが必要になった時点で
 * 分割読み込みする (初期ロードの改善。警告はチャンク分割で対処)。
 */
const MapView = lazy(() => import("./map/MapView").then((module) => ({ default: module.MapView })));

/**
 * SCR-01 ホーム/地図 (要件 7章)。視覚デザインは Claude Design「Slope Risk
 * Viewer redesign」を正本とする (Issue #23)。
 *
 * 地形分析・断面分析・確認支援は DEM 実データからのクライアントサイド解析
 * (analysis/)。デザインのモック値は使わず、欠損・失敗は判定不能として明示する
 * (「データなし ≠ 安全」)。
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

function sameCoordinate(a: Coordinate, b: Coordinate): boolean {
  return a.lat === b.lat && a.lon === b.lon;
}

export function App(): ReactElement {
  const [view, setView] = useState<MapViewState>(() => parseMapState(window.location.hash));
  const [activeTab, setActiveTab] = useState<TabId>("map");
  const [elevation, setElevation] = useState<ElevationPanelState>({ phase: "idle" });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocusRequest | null>(null);
  const [terrain, setTerrain] = useState<TerrainState>({ phase: "idle" });
  const [sectionPick, setSectionPick] = useState<SectionPickPhase>("idle");
  const [sectionLine, setSectionLine] = useState<SectionLineState>({ start: null, end: null });
  const [sectionAnalysis, setSectionAnalysis] = useState<SectionAnalysisState>({ phase: "idle" });
  // Serial numbers guard against out-of-order async responses.
  const requestSeq = useRef(0);
  const terrainSeq = useRef(0);
  const sectionSeq = useRef(0);
  /** 検索で視点を移す前のカメラ。リセット (戻る) の復元先。 */
  const preSearchViewRef = useRef<{ lat: number; lon: number; zoom: number } | null>(null);
  /** DEM タイルの共有キャッシュ (地形・断面で共用)。再試行時に作り直す。 */
  const tileStoreRef = useRef<DemTileStore | null>(null);

  const getTileStore = (): DemTileStore => {
    tileStoreRef.current ??= new DemTileStore();
    return tileStoreRef.current;
  };

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

  const requestElevation = useCallback((coordinate: Coordinate) => {
    const seq = ++requestSeq.current;
    setElevation({ phase: "loading", coordinate });
    void fetchElevation(coordinate).then((result) => {
      if (requestSeq.current === seq) {
        setElevation({ phase: "done", coordinate, result });
      }
    });
  }, []);

  const runTerrain = useCallback((coordinate: Coordinate) => {
    const seq = ++terrainSeq.current;
    setTerrain({ phase: "running", coordinate });
    void analyzeTerrain(coordinate, { store: getTileStore() }).then((result) => {
      if (terrainSeq.current === seq) {
        setTerrain({ phase: "done", coordinate, result });
      }
    });
  }, []);

  const runSection = useCallback((start: Coordinate, end: Coordinate) => {
    const seq = ++sectionSeq.current;
    setSectionAnalysis({ phase: "running" });
    void analyzeSection(start, end, { store: getTileStore() }).then((result) => {
      if (sectionSeq.current === seq) {
        setSectionAnalysis({ phase: "done", result });
      }
    });
  }, []);

  const handleMapClick = useCallback(
    (coordinate: Coordinate) => {
      if (sectionPick === "await-start") {
        setSectionLine({ start: coordinate, end: null });
        setSectionAnalysis({ phase: "idle" });
        setSectionPick("await-end");
        return;
      }
      if (sectionPick === "await-end") {
        const start = sectionLine.start;
        setSectionLine({ start, end: coordinate });
        setSectionPick("idle");
        setActiveTab("cross-section");
        if (start !== null) {
          runSection(start, coordinate);
        }
        return;
      }
      requestElevation(coordinate);
    },
    [sectionPick, sectionLine.start, runSection, requestElevation],
  );

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
    // 初回検索時のみ「戻る」用に現在の視点を控える (連続検索では最初の視点へ戻す)。
    preSearchViewRef.current ??= { lat: view.lat, lon: view.lon, zoom: view.zoom };
    setFocus((current) => ({
      coordinate: resolution.coordinate,
      zoom: SEARCH_FOCUS_ZOOM,
      token: (current?.token ?? 0) + 1,
    }));
    requestElevation(resolution.coordinate);
  }, [searchQuery, requestElevation, view.lat, view.lon, view.zoom]);

  const handleGoToMap = useCallback(() => {
    setActiveTab("map");
  }, []);

  /** 検索・選択・解析・断面線をすべて解除し、検索前の視点へ戻す。 */
  const handleReset = useCallback(() => {
    requestSeq.current++;
    terrainSeq.current++;
    sectionSeq.current++;
    setElevation({ phase: "idle" });
    setTerrain({ phase: "idle" });
    setSectionPick("idle");
    setSectionLine({ start: null, end: null });
    setSectionAnalysis({ phase: "idle" });
    setSearchQuery("");
    setSearchError(null);
    const back = preSearchViewRef.current;
    if (back !== null) {
      preSearchViewRef.current = null;
      setFocus((current) => ({
        coordinate: { lat: back.lat, lon: back.lon },
        zoom: back.zoom,
        token: (current?.token ?? 0) + 1,
      }));
    }
  }, []);

  const handleStartPicking = useCallback(() => {
    setSectionLine({ start: null, end: null });
    setSectionAnalysis({ phase: "idle" });
    setSectionPick("await-start");
    setActiveTab("map");
  }, []);

  const handleCancelPicking = useCallback(() => {
    setSectionPick("idle");
    setActiveTab("cross-section");
  }, []);

  // 選択地点は標高取得状態から導出する (別 state にすると乖離バグの温床)。
  const selectedPoint: Coordinate | null = elevation.phase === "idle" ? null : elevation.coordinate;

  // レポート用に確認支援カードを再評価する (ConfirmTab と同一の純粋関数)。
  const confirmOutput = buildConfirmCards({
    terrain: terrain.phase === "done" ? terrain.result : null,
    section: sectionAnalysis.phase === "done" ? sectionAnalysis.result : null,
  });

  const handleTerrainRetry = useCallback(() => {
    tileStoreRef.current = new DemTileStore(); // 失敗キャッシュを捨てて再試行
    if (selectedPoint !== null) {
      runTerrain(selectedPoint);
    }
  }, [selectedPoint, runTerrain]);

  const handleSectionRetry = useCallback(() => {
    tileStoreRef.current = new DemTileStore();
    if (sectionLine.start !== null && sectionLine.end !== null) {
      runSection(sectionLine.start, sectionLine.end);
    }
  }, [sectionLine.start, sectionLine.end, runSection]);

  // 地形分析は地形/確認タブを開いたときに遅延実行し、地点ごとに1回だけ走らせる。
  useEffect(() => {
    if (selectedPoint === null) {
      return;
    }
    if (activeTab !== "terrain" && activeTab !== "confirm") {
      return;
    }
    if (terrain.phase !== "idle" && sameCoordinate(terrain.coordinate, selectedPoint)) {
      return;
    }
    runTerrain(selectedPoint);
  }, [activeTab, selectedPoint, terrain, runTerrain]);

  // 実状態から表示中レイヤーのラベルを引く (トップバー副題と地図カードのチップ)。
  const activeBaseLabel = BASE_LAYERS.find((layer) => layer.id === view.base)?.label ?? "";
  const activeOverlays = OVERLAY_LAYERS.filter((layer) => view.overlays.includes(layer.id));
  const selectedLabels = [activeBaseLabel, ...activeOverlays.map((layer) => layer.label)]
    .filter((label) => label !== "")
    .join(" + ");

  const activeTabDef = findTab(activeTab);
  const topbarSub = activeTab === "map" ? selectedLabels : activeTabDef.topbarSub;
  const dem = demStatus(elevation);
  const shareUrl = `${window.location.origin}${window.location.pathname}#${serializeMapState(view)}`;
  const canReset =
    selectedPoint !== null ||
    searchQuery !== "" ||
    searchError !== null ||
    sectionLine.start !== null ||
    sectionPick !== "idle";

  return (
    <div className="app">
      <a className="skip-link" href="#app-content">
        メインコンテンツへスキップ
      </a>
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
          <button
            type="button"
            className="btn"
            onClick={handleReset}
            disabled={!canReset}
            title="検索・選択・断面線を解除し、検索前の表示に戻します"
          >
            リセット
          </button>
          <span className={dem.className}>
            <span className="dem-pill-dot" aria-hidden="true" />
            {dem.text}
          </span>
        </header>
        <main className="app-content" id="app-content">
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
            {sectionPick !== "idle" ? (
              <p className="pick-banner" role="status">
                <span aria-hidden="true">📐</span>
                <span>
                  {sectionPick === "await-start"
                    ? "断面の始点をクリックしてください"
                    : "断面の終点をクリックしてください"}
                </span>
                <button type="button" className="btn btn--small" onClick={handleCancelPicking}>
                  やめる
                </button>
              </p>
            ) : null}
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
              <Suspense
                fallback={
                  <div className="map-view map-view--loading" role="status">
                    地図を読み込んでいます…
                  </div>
                }
              >
                <MapErrorBoundary>
                  <MapView
                    view={view}
                    onViewChange={handleViewChange}
                    onMapClick={handleMapClick}
                    selectedPoint={selectedPoint}
                    sectionLine={sectionLine}
                    focus={focus}
                  />
                </MapErrorBoundary>
              </Suspense>
            </section>
            <DemMetaCards state={elevation} />
          </div>
          {activeTab === "terrain" ? (
            <TerrainTab
              selectedPoint={selectedPoint}
              state={terrain}
              onGoToMap={handleGoToMap}
              onRetry={handleTerrainRetry}
            />
          ) : null}
          {activeTab === "cross-section" ? (
            <SectionTab
              pick={sectionPick}
              start={sectionLine.start}
              end={sectionLine.end}
              analysis={sectionAnalysis}
              onStartPicking={handleStartPicking}
              onCancelPicking={handleCancelPicking}
              onRetry={handleSectionRetry}
            />
          ) : null}
          {activeTab === "confirm" ? (
            <ConfirmTab
              selectedPoint={selectedPoint}
              terrainRunning={terrain.phase === "running"}
              terrain={terrain.phase === "done" ? terrain.result : null}
              section={sectionAnalysis.phase === "done" ? sectionAnalysis.result : null}
              onGoToMap={handleGoToMap}
            />
          ) : null}
          {activeTab === "output" ? (
            <OutputTab
              shareUrl={shareUrl}
              report={
                selectedPoint === null
                  ? null
                  : {
                      coordinate: selectedPoint,
                      elevation: elevation.phase === "done" ? elevation.result : null,
                      terrain: terrain.phase === "done" ? terrain.result : null,
                      section: sectionAnalysis.phase === "done" ? sectionAnalysis.result : null,
                      confirmCards: confirmOutput.cards,
                    }
              }
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}
