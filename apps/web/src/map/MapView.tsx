import { useEffect, useRef } from "react";
import type { ReactElement } from "react";
import maplibregl from "maplibre-gl";
import type { GeoJSONSource, GeoJSONSourceSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { applyLayerSelection, buildMapStyle } from "./layers";
import type { MapViewState } from "./map-state";

/** 検索確定などで視点を移動する要求。token が変わるたびに flyTo する。 */
export interface MapFocusRequest {
  readonly coordinate: { readonly lat: number; readonly lon: number };
  readonly zoom: number;
  /** 同一地点への再検索でも移動を再実行するための単調増加トークン。 */
  readonly token: number;
}

/** 断面線の指定状態。start / end が揃うまでは端点のみ描画する。 */
export interface SectionLineState {
  readonly start: { readonly lat: number; readonly lon: number } | null;
  readonly end: { readonly lat: number; readonly lon: number } | null;
}

export interface MapViewProps {
  readonly view: MapViewState;
  /** 利用者の地図操作 (パン・ズーム) 後に呼ばれる。視点の真実は地図側にある。 */
  readonly onViewChange: (view: MapViewState) => void;
  /** 地図クリック時の座標通知 (FR-001 地図クリックによる地点指定)。 */
  readonly onMapClick?: (coordinate: { lat: number; lon: number }) => void;
  /** 選択中の地点。地図上に赤丸マーカーで示す。null なら未選択 (マーカー消去)。 */
  readonly selectedPoint?: { readonly lat: number; readonly lon: number } | null;
  /** 断面分析の指定線。null なら非表示。 */
  readonly sectionLine?: SectionLineState | null;
  /** 視点移動の要求 (検索確定時)。null なら移動しない。 */
  readonly focus?: MapFocusRequest | null;
}

const SELECTED_POINT_SOURCE = "selected-point";
const SELECTED_POINT_LAYER = "selected-point-circle";
const SECTION_SOURCE = "section-line";
const SECTION_STROKE_LAYER = "section-line-stroke";
const SECTION_POINT_LAYER = "section-line-points";

type GeoJsonData = GeoJSONSourceSpecification["data"];
type FeatureCollectionData = Extract<GeoJsonData, { type: "FeatureCollection" }>;
type FeatureItem = FeatureCollectionData["features"][number];
type LayerSpec = Parameters<maplibregl.Map["addLayer"]>[0];

const EMPTY_COLLECTION: GeoJsonData = { type: "FeatureCollection", features: [] };

/**
 * GeoJSON ソースの upsert。ソース未作成かつ空データなら何もしない
 * (クリア要求のためだけにソースを作らない)。
 */
function upsertGeoJson(
  map: maplibregl.Map,
  sourceId: string,
  data: GeoJsonData,
  layers: readonly LayerSpec[],
): void {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  if (source !== undefined) {
    source.setData(data);
    return;
  }
  if (data === EMPTY_COLLECTION) {
    return;
  }
  map.addSource(sourceId, { type: "geojson", data });
  for (const layer of layers) {
    map.addLayer(layer);
  }
}

function selectedPointData(
  coordinate: { readonly lat: number; readonly lon: number } | null,
): GeoJsonData {
  if (coordinate === null) {
    return EMPTY_COLLECTION;
  }
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [coordinate.lon, coordinate.lat] },
    properties: {},
  };
}

/** 選択地点マーカー。色はデザイントークン --red-2 (#D6443B)。 */
function applySelectedPoint(
  map: maplibregl.Map,
  coordinate: { readonly lat: number; readonly lon: number } | null,
): void {
  upsertGeoJson(map, SELECTED_POINT_SOURCE, selectedPointData(coordinate), [
    {
      id: SELECTED_POINT_LAYER,
      type: "circle",
      source: SELECTED_POINT_SOURCE,
      paint: {
        "circle-radius": 7,
        "circle-color": "#d6443b",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    },
  ]);
}

function sectionLineData(line: SectionLineState | null): GeoJsonData {
  if (line === null || (line.start === null && line.end === null)) {
    return EMPTY_COLLECTION;
  }
  const features: FeatureItem[] = [];
  for (const point of [line.start, line.end]) {
    if (point !== null) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [point.lon, point.lat] },
        properties: {},
      });
    }
  }
  if (line.start !== null && line.end !== null) {
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [line.start.lon, line.start.lat],
          [line.end.lon, line.end.lat],
        ],
      },
      properties: {},
    });
  }
  return { type: "FeatureCollection", features };
}

/** 断面線。色はデザイントークン --accent (#E08A2B)。 */
function applySectionLine(map: maplibregl.Map, line: SectionLineState | null): void {
  upsertGeoJson(map, SECTION_SOURCE, sectionLineData(line), [
    {
      id: SECTION_STROKE_LAYER,
      type: "line",
      source: SECTION_SOURCE,
      filter: ["==", "$type", "LineString"],
      paint: { "line-color": "#e08a2b", "line-width": 3 },
    },
    {
      id: SECTION_POINT_LAYER,
      type: "circle",
      source: SECTION_SOURCE,
      filter: ["==", "$type", "Point"],
      paint: {
        "circle-radius": 6,
        "circle-color": "#e08a2b",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    },
  ]);
}

/**
 * MapLibre GL JS の薄いラッパー。ロジックは layers.ts / map-state.ts の純粋関数に
 * 寄せ、このコンポーネントはライフサイクル接続のみを担う:
 * - 初期化は1回だけ (再レンダリングで地図を作り直さない)
 * - レイヤー切替は visibility 切替 (タイルキャッシュを保つ)
 * - 視点 (center/zoom) は地図が真実であり、React 側から書き戻さない。
 *   例外は focus (検索確定) で、このときだけ flyTo で地図へ指示する
 * - 選択地点マーカーは GeoJSON ソースの upsert (作り直さない)
 * - 帰属表示は AttributionControl で常設 (要件: 出典表示率 100%)
 */
export function MapView({
  view,
  onViewChange,
  onMapClick,
  selectedPoint,
  sectionLine,
  focus,
}: MapViewProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const viewRef = useRef(view);
  const onViewChangeRef = useRef(onViewChange);
  const onMapClickRef = useRef(onMapClick);

  viewRef.current = view;
  onViewChangeRef.current = onViewChange;
  onMapClickRef.current = onMapClick;

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }

    const initial = viewRef.current;
    const map = new maplibregl.Map({
      container,
      style: buildMapStyle(initial),
      center: [initial.lon, initial.lat],
      zoom: initial.zoom,
      // Default control is replaced below so the attribution is always expanded.
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: false }));
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
    map.on("moveend", () => {
      const center = map.getCenter();
      onViewChangeRef.current({
        ...viewRef.current,
        lat: center.lat,
        lon: center.lng,
        zoom: map.getZoom(),
      });
    });
    map.on("click", (event) => {
      onMapClickRef.current?.({ lat: event.lngLat.lat, lon: event.lngLat.lng });
    });

    mapRef.current = map;
    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null) {
      return;
    }
    const apply = (): void => {
      applyLayerSelection(map, viewRef.current);
    };
    // maplibre's Style.setLayoutProperty throws ("Style is not done loading.")
    // until the style finishes its async load, which is still pending when this
    // effect first runs after the init effect. Defer to the load event then.
    if (map.isStyleLoaded()) {
      apply();
      return;
    }
    map.once("load", apply);
    return () => {
      map.off("load", apply);
    };
    // Depend on the selection only: moveend replaces the whole view object, and
    // reapplying visibility for every pan/zoom would be wasted work.
  }, [view.base, view.overlays]);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null) {
      return;
    }
    const apply = (): void => {
      applySelectedPoint(map, selectedPoint ?? null);
    };
    // Same deferred-load guard as the layer effect: addSource/addLayer also
    // require the style to be loaded.
    if (map.isStyleLoaded()) {
      apply();
      return;
    }
    map.once("load", apply);
    return () => {
      map.off("load", apply);
    };
  }, [selectedPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null) {
      return;
    }
    const apply = (): void => {
      applySectionLine(map, sectionLine ?? null);
    };
    if (map.isStyleLoaded()) {
      apply();
      return;
    }
    map.once("load", apply);
    return () => {
      map.off("load", apply);
    };
  }, [sectionLine]);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null || focus == null) {
      return;
    }
    // 視覚過敏対応: ユーザーが動きの低減を求めている場合は flyTo を瞬時に行う。
    // matchMedia 未実装環境 (旧 jsdom 等) では既定のアニメーションに倒す。
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    map.flyTo({
      center: [focus.coordinate.lon, focus.coordinate.lat],
      zoom: focus.zoom,
      duration: prefersReducedMotion ? 0 : 800,
    });
    // The token makes repeat searches for the same place fly again.
  }, [focus]);

  return (
    <div
      ref={containerRef}
      className="map-view"
      data-testid="map-view"
      role="region"
      aria-label="地図"
    />
  );
}
