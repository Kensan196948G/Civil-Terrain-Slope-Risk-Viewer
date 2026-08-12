import type { StyleSpecification } from "maplibre-gl";

/**
 * 国土地理院タイルのレイヤー定義 (詳細設計仕様書 3.1 Map module / 要件 FR-003, FR-004)。
 *
 * すべてのレイヤーは attribution を必ず持つ (要件 KPI: 出典表示率 100%)。
 * タイルURL・ズーム範囲の出典: 国土地理院 地理院タイル一覧
 * https://maps.gsi.go.jp/development/ichiran.html
 */

export type BaseLayerId = "std" | "pale" | "photo";
export type OverlayLayerId =
  "slope" | "hillshade" | "sabo-debris" | "sabo-steep" | "sabo-landslide";
export type MapLayerId = BaseLayerId | OverlayLayerId;

export interface TileLayerDefinition<Id extends MapLayerId = MapLayerId> {
  readonly id: Id;
  /** 画面表示用の日本語名 (色以外の手掛かりとしてテキストで提示する)。 */
  readonly label: string;
  readonly kind: "base" | "overlay";
  readonly tileUrlTemplate: string;
  readonly minZoom: number;
  readonly maxZoom: number;
  /** 帰属表示。MapLibre AttributionControl に常設表示される。 */
  readonly attribution: string;
  /** 重ね合わせレイヤーの不透明度 (ベースは常に 1)。 */
  readonly opacity: number;
}

const GSI_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>';

/**
 * 重ねるハザードマップ (国土地理院オープンデータ) の帰属。
 * 出典: https://disaportal.gsi.go.jp/hazardmap/copyright/opendata.html
 * 原データ: 国土数値情報「土砂災害警戒区域 (令和7年度)」 (国土交通省)。
 */
const HAZARD_ATTRIBUTION =
  '<a href="https://disaportal.gsi.go.jp/hazardmap/copyright/opendata.html" target="_blank" rel="noopener">国土地理院「重ねるハザードマップ」</a>';

export const BASE_LAYERS: readonly TileLayerDefinition<BaseLayerId>[] = [
  {
    id: "std",
    label: "標準地図",
    kind: "base",
    tileUrlTemplate: "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",
    minZoom: 2,
    maxZoom: 18,
    attribution: GSI_ATTRIBUTION,
    opacity: 1,
  },
  {
    id: "pale",
    label: "淡色地図",
    kind: "base",
    tileUrlTemplate: "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",
    minZoom: 2,
    maxZoom: 18,
    attribution: GSI_ATTRIBUTION,
    opacity: 1,
  },
  {
    id: "photo",
    label: "写真",
    kind: "base",
    tileUrlTemplate: "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
    minZoom: 2,
    maxZoom: 18,
    attribution: GSI_ATTRIBUTION,
    opacity: 1,
  },
];

export const OVERLAY_LAYERS: readonly TileLayerDefinition<OverlayLayerId>[] = [
  {
    id: "slope",
    label: "傾斜量図",
    kind: "overlay",
    tileUrlTemplate: "https://cyberjapandata.gsi.go.jp/xyz/slopemap/{z}/{x}/{y}.png",
    minZoom: 3,
    maxZoom: 15,
    attribution: GSI_ATTRIBUTION,
    // 表示用レイヤー (要件 6.1: 数値評価は DEM から再計算する)。ベース地図が透けるよう半透明。
    opacity: 0.6,
  },
  {
    id: "hillshade",
    label: "陰影起伏図",
    kind: "overlay",
    tileUrlTemplate: "https://cyberjapandata.gsi.go.jp/xyz/hillshademap/{z}/{x}/{y}.png",
    minZoom: 2,
    maxZoom: 16,
    attribution: GSI_ATTRIBUTION,
    opacity: 0.5,
  },
  {
    id: "sabo-debris",
    label: "土砂災害警戒区域（土石流）",
    kind: "overlay",
    tileUrlTemplate:
      "https://disaportaldata.gsi.go.jp/raster/05_dosekiryukeikaikuiki/{z}/{x}/{y}.png",
    minZoom: 2,
    maxZoom: 17,
    attribution: HAZARD_ATTRIBUTION,
    // ベース地図との重なりを見るため半透明に保つ (数値評価は行わない表示専用レイヤー)。
    opacity: 0.6,
  },
  {
    id: "sabo-steep",
    label: "土砂災害警戒区域（急傾斜地の崩壊）",
    kind: "overlay",
    tileUrlTemplate:
      "https://disaportaldata.gsi.go.jp/raster/05_kyukeishakeikaikuiki/{z}/{x}/{y}.png",
    minZoom: 2,
    maxZoom: 17,
    attribution: HAZARD_ATTRIBUTION,
    opacity: 0.6,
  },
  {
    id: "sabo-landslide",
    label: "土砂災害警戒区域（地すべり）",
    kind: "overlay",
    tileUrlTemplate:
      "https://disaportaldata.gsi.go.jp/raster/05_jisuberikeikaikuiki/{z}/{x}/{y}.png",
    minZoom: 2,
    maxZoom: 17,
    attribution: HAZARD_ATTRIBUTION,
    opacity: 0.6,
  },
];

export const ALL_LAYERS: readonly TileLayerDefinition[] = [...BASE_LAYERS, ...OVERLAY_LAYERS];

export function isBaseLayerId(value: string): value is BaseLayerId {
  return BASE_LAYERS.some((layer) => layer.id === value);
}

export function isOverlayLayerId(value: string): value is OverlayLayerId {
  return OVERLAY_LAYERS.some((layer) => layer.id === value);
}

export interface LayerSelection {
  readonly base: BaseLayerId;
  readonly overlays: readonly OverlayLayerId[];
}

/**
 * MapLibre スタイルを構築する。全レイヤーを visibility で保持し、選択状態は
 * 表示/非表示のみで表現する (setStyle での作り直しを避けてタイルキャッシュを保つ)。
 * レイヤー順はベース → 重ね合わせ (定義順) で固定する。
 */
export function buildMapStyle(selection: LayerSelection): StyleSpecification {
  const sources: StyleSpecification["sources"] = {};
  const layers: StyleSpecification["layers"] = [];

  for (const layer of ALL_LAYERS) {
    sources[layer.id] = {
      type: "raster",
      tiles: [layer.tileUrlTemplate],
      tileSize: 256,
      minzoom: layer.minZoom,
      maxzoom: layer.maxZoom,
      attribution: layer.attribution,
    };
    layers.push({
      id: layer.id,
      type: "raster",
      source: layer.id,
      layout: {
        visibility: isLayerVisible(layer, selection) ? "visible" : "none",
      },
      paint: {
        "raster-opacity": layer.opacity,
      },
    });
  }

  return { version: 8, sources, layers };
}

function isLayerVisible(layer: TileLayerDefinition, selection: LayerSelection): boolean {
  if (layer.kind === "base") {
    return layer.id === selection.base;
  }
  return (selection.overlays as readonly string[]).includes(layer.id);
}

/** buildMapStyle 済みの地図へ選択変更を反映するための最小インターフェース。 */
export interface LayerVisibilityTarget {
  setLayoutProperty(layerId: string, name: "visibility", value: "visible" | "none"): void;
}

/**
 * 選択状態の変更を visibility の切替として地図へ適用する。
 * MapLibre の Map を直接受けず最小インターフェースに依存することで単体テスト可能にしている。
 */
export function applyLayerSelection(
  target: LayerVisibilityTarget,
  selection: LayerSelection,
): void {
  for (const layer of ALL_LAYERS) {
    target.setLayoutProperty(
      layer.id,
      "visibility",
      isLayerVisible(layer, selection) ? "visible" : "none",
    );
  }
}
