import type { BaseLayerId, LayerSelection, OverlayLayerId } from "./layers";
import { OVERLAY_LAYERS, isBaseLayerId, isOverlayLayerId } from "./layers";

/**
 * 地図の表示状態と URL ハッシュの相互変換 (要件 FR: 共有URL の基礎設計)。
 *
 * ハッシュには非機密の表示条件 (視点とレイヤー選択) のみを載せる。
 * 認証情報・個人情報・検索履歴は含めない (要件 2.1-7)。
 * 形式: `#view=<zoom>/<lat>/<lon>&base=<id>&ov=<id>,<id>`
 */

export interface MapViewState extends LayerSelection {
  readonly lat: number;
  readonly lon: number;
  readonly zoom: number;
}

/** 初期表示: 日本全域が収まる視点 (要件 SCR-01)。 */
export const DEFAULT_VIEW_STATE: MapViewState = {
  lat: 36.5,
  lon: 138.0,
  zoom: 5,
  base: "std",
  overlays: [],
};

const MIN_ZOOM = 2;
const MAX_ZOOM = 18;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 緯度経度は約1m精度 (小数5桁)、ズームは0.01刻みへ丸めて URL を安定させる。 */
function roundCoordinate(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

function roundZoom(value: number): number {
  return Math.round(value * 100) / 100;
}

export function serializeMapState(state: MapViewState): string {
  const view = `${roundZoom(state.zoom)}/${roundCoordinate(state.lat)}/${roundCoordinate(state.lon)}`;
  // 値はすべて内部管理の数値・既知IDのみなので、可読性を優先して手組みする
  // (URLSearchParams.toString() は "/" や "," を %2F/%2C に変換してしまう)。
  const parts = [`view=${view}`, `base=${state.base}`];
  if (state.overlays.length > 0) {
    // 定義順で並べ、選択順に依存しない安定した URL にする。
    const ordered = OVERLAY_LAYERS.map((layer) => layer.id).filter((id) =>
      state.overlays.includes(id),
    );
    parts.push(`ov=${ordered.join(",")}`);
  }
  return parts.join("&");
}

/**
 * URL ハッシュから表示状態を復元する。壊れた値・未知のレイヤーIDは
 * 例外を投げずに既定値へフォールバックする (共有URLの劣化に対して寛容にする)。
 */
export function parseMapState(hash: string): MapViewState {
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  if (trimmed === "") {
    return DEFAULT_VIEW_STATE;
  }

  const params = new URLSearchParams(trimmed);
  const view = parseViewParam(params.get("view"));

  const baseParam = params.get("base");
  const base: BaseLayerId =
    baseParam !== null && isBaseLayerId(baseParam) ? baseParam : DEFAULT_VIEW_STATE.base;

  const overlays = parseOverlaysParam(params.get("ov"));

  return { ...view, base, overlays };
}

function parseViewParam(value: string | null): Pick<MapViewState, "lat" | "lon" | "zoom"> {
  const fallback = {
    lat: DEFAULT_VIEW_STATE.lat,
    lon: DEFAULT_VIEW_STATE.lon,
    zoom: DEFAULT_VIEW_STATE.zoom,
  };
  if (value === null) {
    return fallback;
  }

  const parts = value.split("/");
  // Number("") and Number("  ") evaluate to 0, so empty segments would silently
  // land the view on lat/lon 0 instead of falling back to the default.
  if (parts.length !== 3 || parts.some((part) => part.trim() === "")) {
    return fallback;
  }

  const zoom = Number(parts[0]);
  const lat = Number(parts[1]);
  const lon = Number(parts[2]);
  if (!Number.isFinite(zoom) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return fallback;
  }

  return {
    zoom: roundZoom(clamp(zoom, MIN_ZOOM, MAX_ZOOM)),
    lat: roundCoordinate(clamp(lat, -90, 90)),
    lon: roundCoordinate(clamp(lon, -180, 180)),
  };
}

function parseOverlaysParam(value: string | null): readonly OverlayLayerId[] {
  if (value === null || value === "") {
    return [];
  }
  const ids: OverlayLayerId[] = [];
  for (const raw of value.split(",")) {
    if (isOverlayLayerId(raw) && !ids.includes(raw)) {
      ids.push(raw);
    }
  }
  return ids;
}
