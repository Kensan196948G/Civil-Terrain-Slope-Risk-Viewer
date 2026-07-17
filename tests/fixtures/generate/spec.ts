/**
 * Golden fixture specification (design spec 8, 14.3).
 *
 * This is hand-authored SYNTHETIC data — it is NOT real GSI DEM imagery. Every
 * elevation is a deliberate, human-readable value chosen to exercise a specific
 * decode / slope / coverage path. See tests/fixtures/README.md for provenance
 * and licensing notes.
 *
 * Grids are `grid[y][x]`, row 0 = north (top). Elevations are meters and MUST be
 * multiples of the 0.01 m DEM resolution so the encode/decode round-trip is
 * exact. `null` is the no-data sentinel (design spec 8.2, decode x = 2^23).
 */

const GRID = 8;

/** Build an 8x8 grid from a per-cell function of (row, col). */
function grid(fn: (row: number, col: number) => number | null): (number | null)[][] {
  return Array.from({ length: GRID }, (_unusedRow, row) =>
    Array.from({ length: GRID }, (_unusedCol, col) => fn(row, col)),
  );
}

/** One of the seven representative locations required by design spec 14.3. */
export type RepresentativeCategory =
  | "MOUNTAIN"
  | "PLAIN"
  | "LOWLAND"
  | "NEGATIVE_ELEVATION"
  | "COAST"
  | "DEM_BOUNDARY"
  | "OUT_OF_RANGE";

export interface RepresentativePoint {
  readonly lon: number;
  readonly lat: number;
  readonly zoom: number;
}

export interface DemFixtureSpec {
  readonly id: string;
  readonly fileName: string;
  /** Japanese + English label. */
  readonly title: string;
  readonly category: RepresentativeCategory;
  readonly description: string;
  /**
   * Representative location this synthetic tile stands in for. Coordinates are
   * plausible Japanese points used only as provenance context; the raster is
   * still synthetic and does not reflect the real terrain at these coordinates.
   */
  readonly representativePoint: RepresentativePoint;
  /** GSI DEM source this tile mimics in resolution/character (spec 8.2 priority). */
  readonly mimicsDemSource: "DEM1A" | "DEM5A" | "DEM5B" | "DEM5C" | "DEM10B";
  /** Intended elevations in meters (`null` = no-data). */
  readonly grid: ReadonlyArray<ReadonlyArray<number | null>>;
}

/**
 * The seven representative DEM fixtures (design spec 14.3):
 * 山地 / 平地 / 低地 / 負標高 / 海岸 / DEM境界 / データ範囲外.
 */
export const DEM_FIXTURES: readonly DemFixtureSpec[] = [
  {
    id: "01-mountain",
    fileName: "01-mountain.png",
    title: "山地 (Mountain slope)",
    category: "MOUNTAIN",
    description:
      "高標高の東向き一様傾斜。列ごとに +5.00 m (1200.00〜1235.00 m)。dx=dy=10 m のとき内部 3x3 で東傾斜 atan(0.5)=26.565°。",
    representativePoint: { lon: 138.7275, lat: 35.3606, zoom: 14 },
    mimicsDemSource: "DEM5A",
    grid: grid((_row, col) => 1200 + 5 * col),
  },
  {
    id: "02-plain",
    fileName: "02-plain.png",
    title: "平地 (Flat plain)",
    category: "PLAIN",
    description: "完全平坦 12.50 m。傾斜 0.000° (UT-SLP-01 平面0°)。coverage=FULL。",
    representativePoint: { lon: 139.6, lat: 36.0, zoom: 14 },
    mimicsDemSource: "DEM5A",
    grid: grid(() => 12.5),
  },
  {
    id: "03-lowland",
    fileName: "03-lowland.png",
    title: "低地 (Low-lying land)",
    category: "LOWLAND",
    description:
      "低標高の緩い南向き傾斜。行ごとに +0.10 m (2.00〜2.70 m)。dx=dy=10 m のとき南傾斜 atan(0.01)=0.573°。",
    representativePoint: { lon: 135.5, lat: 34.68, zoom: 14 },
    mimicsDemSource: "DEM5A",
    grid: grid((row) => Number((2.0 + 0.1 * row).toFixed(2))),
  },
  {
    id: "04-negative",
    fileName: "04-negative.png",
    title: "負標高 (Below sea level)",
    category: "NEGATIVE_ELEVATION",
    description:
      "全面 -3.50 m の海抜ゼロメートル地帯。負標高は正当な値であり欠損へ丸めない (spec 8.2)。",
    representativePoint: { lon: 136.9, lat: 35.05, zoom: 14 },
    mimicsDemSource: "DEM5A",
    grid: grid(() => -3.5),
  },
  {
    id: "05-coast",
    fileName: "05-coast.png",
    title: "海岸 (Coastline crossing sea level)",
    category: "COAST",
    description:
      "海側から陸側へ列ごとに +1.00 m (-2.00〜+5.00 m)。c=2 で厳密に 0.00 m。負・ゼロ・正を1枚で網羅 (UT-DEM-01)。",
    representativePoint: { lon: 139.48, lat: 35.3, zoom: 14 },
    mimicsDemSource: "DEM5B",
    grid: grid((_row, col) => -2.0 + 1.0 * col),
  },
  {
    id: "06-boundary",
    fileName: "06-boundary.png",
    title: "DEM境界 (Partial coverage boundary)",
    category: "DEM_BOUNDARY",
    description:
      "左半分 (c<4) は有効 8.00 m、右半分 (c>=4) は無効値 (null)。coverage=PARTIAL。null 隣接セルの傾斜は null (補間しない, spec 8.3)。",
    representativePoint: { lon: 140.0, lat: 36.0, zoom: 14 },
    mimicsDemSource: "DEM10B",
    grid: grid((_row, col) => (col < 4 ? 8.0 : null)),
  },
  {
    id: "07-out-of-range",
    fileName: "07-out-of-range.png",
    title: "データ範囲外 (No DEM coverage)",
    category: "OUT_OF_RANGE",
    description:
      "全セル無効値 (null)。coverage=NONE。NONE は「低品質」ではなく「有効データ皆無」であり REFERENCE/Safe へ丸めない (Unknown is not Safe)。",
    representativePoint: { lon: 145.0, lat: 30.0, zoom: 14 },
    mimicsDemSource: "DEM10B",
    grid: grid(() => null),
  },
];

/**
 * Ten normalized landform classes (design spec 8.5). The domain package does
 * not yet expose a landform type; these string literals are the authoritative
 * source until it does, and the fixture below is structured so a future
 * `NormalizedLandformClass` union can be generated from it.
 */
export const NORMALIZED_LANDFORM_CLASSES = [
  "MOUNTAIN_SLOPE",
  "CLIFF_TERRACE_CLIFF",
  "LANDSLIDE",
  "DEPRESSION_SHALLOW_VALLEY",
  "FLOODPLAIN_COASTAL_PLAIN",
  "BACK_MARSH",
  "FORMER_RIVER_CHANNEL",
  "VALLEY_PLAIN",
  "ARTIFICIAL_FILL",
  "OTHER",
] as const;

export type NormalizedLandformClass = (typeof NORMALIZED_LANDFORM_CLASSES)[number];

export interface LandformSample {
  readonly originalCode: string;
  readonly normalizedClass: NormalizedLandformClass;
  readonly sourceDataset: string;
  readonly sourceDate: string;
  readonly description: string;
}

/** One representative sample per normalized class (spec 8.5 fields). */
export const LANDFORM_SAMPLES: readonly LandformSample[] = [
  {
    originalCode: "SYN-100",
    normalizedClass: "MOUNTAIN_SLOPE",
    sourceDataset: "SYNTHETIC-landform-classification",
    sourceDate: "2026-07-17",
    description: "山地斜面。急峻な自然斜面。",
  },
  {
    originalCode: "SYN-210",
    normalizedClass: "CLIFF_TERRACE_CLIFF",
    sourceDataset: "SYNTHETIC-landform-classification",
    sourceDate: "2026-07-17",
    description: "崖・段丘崖。比高のある崖線。",
  },
  {
    originalCode: "SYN-220",
    normalizedClass: "LANDSLIDE",
    sourceDataset: "SYNTHETIC-landform-classification",
    sourceDate: "2026-07-17",
    description: "地すべり地形。滑落崖と移動体。",
  },
  {
    originalCode: "SYN-310",
    normalizedClass: "DEPRESSION_SHALLOW_VALLEY",
    sourceDataset: "SYNTHETIC-landform-classification",
    sourceDate: "2026-07-17",
    description: "凹地・浅い谷。周囲より低い集水地形。",
  },
  {
    originalCode: "SYN-400",
    normalizedClass: "FLOODPLAIN_COASTAL_PLAIN",
    sourceDataset: "SYNTHETIC-landform-classification",
    sourceDate: "2026-07-17",
    description: "氾濫平野・海岸平野。低平な堆積地形。",
  },
  {
    originalCode: "SYN-410",
    normalizedClass: "BACK_MARSH",
    sourceDataset: "SYNTHETIC-landform-classification",
    sourceDate: "2026-07-17",
    description: "後背湿地。自然堤防背後の泥湿地。",
  },
  {
    originalCode: "SYN-420",
    normalizedClass: "FORMER_RIVER_CHANNEL",
    sourceDataset: "SYNTHETIC-landform-classification",
    sourceDate: "2026-07-17",
    description: "旧河道。かつての流路跡。",
  },
  {
    originalCode: "SYN-430",
    normalizedClass: "VALLEY_PLAIN",
    sourceDataset: "SYNTHETIC-landform-classification",
    sourceDate: "2026-07-17",
    description: "谷底平野。山間の細長い低地。",
  },
  {
    originalCode: "SYN-500",
    normalizedClass: "ARTIFICIAL_FILL",
    sourceDataset: "SYNTHETIC-landform-classification",
    sourceDate: "2026-07-17",
    description: "人工地形 (盛土・埋立)。改変地。",
  },
  {
    originalCode: "SYN-900",
    normalizedClass: "OTHER",
    sourceDataset: "SYNTHETIC-landform-classification",
    sourceDate: "2026-07-17",
    description: "その他・分類対象外。",
  },
];

/**
 * Boundary sample (spec 8.5): near a class boundary a single point must not be
 * asserted to one class — instead all intersecting classes and their distances
 * are reported.
 */
export interface LandformBoundarySample {
  readonly point: { readonly lon: number; readonly lat: number };
  readonly intersects: ReadonlyArray<{
    readonly normalizedClass: NormalizedLandformClass;
    readonly distanceM: number;
  }>;
  readonly description: string;
}

export const LANDFORM_BOUNDARY_SAMPLE: LandformBoundarySample = {
  point: { lon: 139.482, lat: 35.301 },
  intersects: [
    { normalizedClass: "FLOODPLAIN_COASTAL_PLAIN", distanceM: 0 },
    { normalizedClass: "ARTIFICIAL_FILL", distanceM: 12.5 },
    { normalizedClass: "BACK_MARSH", distanceM: 34.0 },
  ],
  description: "境界付近。単一区分へ断定せず交差する全分類と距離を提示する (spec 8.5)。",
};

/**
 * Horn-method slope golden cases (design spec 8.3, UT-SLP-01). Neighborhood is
 * `z1..z9` laid out row-major; `expectedSlopeDeg` is derived analytically (not a
 * snapshot of the implementation) so the test checks code against ground truth.
 */
export interface SlopeCase {
  readonly id: string;
  readonly description: string;
  readonly neighborhood: {
    readonly z1: number | null;
    readonly z2: number | null;
    readonly z3: number | null;
    readonly z4: number | null;
    readonly z5: number | null;
    readonly z6: number | null;
    readonly z7: number | null;
    readonly z8: number | null;
    readonly z9: number | null;
  };
  readonly dxMeters: number;
  readonly dyMeters: number;
  readonly expectedSlopeDeg: number | null;
  /** Decimal digits of agreement for toBeCloseTo. */
  readonly precisionDigits: number;
}

const RAD_TO_DEG = 180 / Math.PI;

export const SLOPE_CASES: readonly SlopeCase[] = [
  {
    id: "flat-plain",
    description: "平面。全セル 12.50 m → 0.000°。",
    neighborhood: {
      z1: 12.5,
      z2: 12.5,
      z3: 12.5,
      z4: 12.5,
      z5: 12.5,
      z6: 12.5,
      z7: 12.5,
      z8: 12.5,
      z9: 12.5,
    },
    dxMeters: 10,
    dyMeters: 10,
    expectedSlopeDeg: 0,
    precisionDigits: 10,
  },
  {
    id: "east-1to1",
    description: "東向き 1:1 勾配 (列 0,10,20 / 10 m) → 45.000°。",
    neighborhood: { z1: 0, z2: 10, z3: 20, z4: 0, z5: 10, z6: 20, z7: 0, z8: 10, z9: 20 },
    dxMeters: 10,
    dyMeters: 10,
    expectedSlopeDeg: 45,
    precisionDigits: 9,
  },
  {
    id: "north-south-1to1",
    description: "南北 1:1 勾配 (行 0,10,20 / 10 m) → 45.000°。",
    neighborhood: { z1: 0, z2: 0, z3: 0, z4: 10, z5: 10, z6: 10, z7: 20, z8: 20, z9: 20 },
    dxMeters: 10,
    dyMeters: 10,
    expectedSlopeDeg: 45,
    precisionDigits: 9,
  },
  {
    id: "gentle-east-0.1",
    description: "緩い東向き勾配 (列 0,1,2 / 10 m, gradient 0.1) → atan(0.1)=5.7106°。",
    neighborhood: { z1: 0, z2: 1, z3: 2, z4: 0, z5: 1, z6: 2, z7: 0, z8: 1, z9: 2 },
    dxMeters: 10,
    dyMeters: 10,
    expectedSlopeDeg: Math.atan(0.1) * RAD_TO_DEG,
    precisionDigits: 9,
  },
  {
    id: "mountain-east-0.5",
    description: "山地 fixture 内部の東向き勾配 (列 +5 m/cell, gradient 0.5) → atan(0.5)=26.565°。",
    neighborhood: {
      z1: 1200,
      z2: 1205,
      z3: 1210,
      z4: 1200,
      z5: 1205,
      z6: 1210,
      z7: 1200,
      z8: 1205,
      z9: 1210,
    },
    dxMeters: 10,
    dyMeters: 10,
    expectedSlopeDeg: Math.atan(0.5) * RAD_TO_DEG,
    precisionDigits: 9,
  },
  {
    id: "missing-neighbor",
    description: "近傍に欠損 (z6=null) → 補間せず null (spec 8.3)。",
    neighborhood: { z1: 8, z2: 8, z3: 8, z4: 8, z5: 8, z6: null, z7: 8, z8: 8, z9: 8 },
    dxMeters: 10,
    dyMeters: 10,
    expectedSlopeDeg: null,
    precisionDigits: 10,
  },
];

/**
 * XYZ tile-coordinate golden cases (design spec 8.1, UT-GEO-01). Expected x/y
 * are derived by hand from the projection formula (independent ground truth):
 * date line, antimeridian, equator, high-latitude clamp, tile edges.
 */
export interface TileCase {
  readonly id: string;
  readonly description: string;
  readonly lon: number;
  readonly lat: number;
  readonly zoom: number;
  readonly expected: { readonly x: number; readonly y: number };
}

export const TILE_CASES: readonly TileCase[] = [
  {
    id: "origin-z0",
    description: "z0 は世界全体で 1 タイル → (0,0)。",
    lon: 0,
    lat: 0,
    zoom: 0,
    expected: { x: 0, y: 0 },
  },
  {
    id: "equator-prime-meridian-z1",
    description: "赤道・本初子午線 z1 → (1,1)。",
    lon: 0,
    lat: 0,
    zoom: 1,
    expected: { x: 1, y: 1 },
  },
  {
    id: "antimeridian-west-z1",
    description: "西端 lon=-180 z1 → x=0 (左端)。",
    lon: -180,
    lat: 0,
    zoom: 1,
    expected: { x: 0, y: 1 },
  },
  {
    id: "date-line-east-z1",
    description: "日付変更線 lon=180 z1 → x=n=2 (右端の境界値)。",
    lon: 180,
    lat: 0,
    zoom: 1,
    expected: { x: 2, y: 1 },
  },
  {
    id: "high-latitude-z3",
    description:
      "高緯度 lat=80 (バンド内) z3 → 最上段 (4,0)。クランプ自体は golden.test.ts で別途検証。",
    lon: 0,
    lat: 80,
    zoom: 3,
    expected: { x: 4, y: 0 },
  },
  {
    id: "tokyo-interior-z2",
    description: "中緯度内部 (139.5E, 35.5N) z2 → (3,1)。",
    lon: 139.5,
    lat: 35.5,
    zoom: 2,
    expected: { x: 3, y: 1 },
  },
];

/** Provenance stamped onto every generated golden artifact. */
export const SYNTHETIC_PROVENANCE = {
  source: "SYNTHETIC (hand-authored, not real GSI data)",
  generator: "tests/fixtures/generate/generate.ts",
  encoding: "GSI DEM PNG format (design spec 8.2): x = 2^16 R + 2^8 G + B, h = signed(x) * 0.01 m",
  resolutionM: 0.01,
  noDataSentinel: "x = 2^23 (RGB 128,0,0)",
  generatedAt: "2026-07-17",
  license:
    "Synthetic test data authored for this repository. Free to use within tests. Does NOT contain or derive from GSI (Geospatial Information Authority of Japan) tiles.",
} as const;
