/**
 * Golden fixture validation (design spec 14.3).
 *
 * These tests read the COMMITTED artifacts (the binary PNG tiles and the golden
 * JSON) and check them against `@civil-terrain/geo`. If a fixture is regenerated
 * incorrectly, hand-edited, or the decode/slope/tile code drifts, one of these
 * fails loudly.
 *
 * The geo package is imported by relative path rather than by its `@civil-terrain/geo`
 * specifier because `tests/` is not a workspace package and has no node_modules
 * link to it. Relative paths resolve identically under Vite whether this file is
 * run via the local tests/fixtures config or a future root workspace project.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  calculateSlopeDeg,
  decodeElevation,
  lonLatToTileXY,
  MAX_MERCATOR_LATITUDE,
  type Neighborhood3x3,
} from "../../packages/geo/src/index.ts";
import { encodeElevation, NO_DATA_RGB } from "./generate/dem-encode.ts";
import { decodePng } from "./generate/png.ts";

function readJson<T>(relative: string): T {
  const path = fileURLToPath(new URL(relative, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readBytes(relative: string): Uint8Array {
  const path = fileURLToPath(new URL(relative, import.meta.url));
  return new Uint8Array(readFileSync(path));
}

interface ElevationsGolden {
  readonly fixtures: ReadonlyArray<{
    readonly id: string;
    readonly fileName: string;
    readonly category: string;
    readonly width: number;
    readonly height: number;
    readonly stats: {
      readonly validCount: number;
      readonly invalidCount: number;
      readonly minM: number | null;
      readonly maxM: number | null;
      readonly coverage: "FULL" | "PARTIAL" | "NONE";
    };
    readonly intendedElevationsM: ReadonlyArray<ReadonlyArray<number | null>>;
  }>;
}

interface SlopesGolden {
  readonly cases: ReadonlyArray<{
    readonly id: string;
    readonly neighborhood: Record<keyof Neighborhood3x3, number | null>;
    readonly dxMeters: number;
    readonly dyMeters: number;
    readonly expectedSlopeDeg: number | null;
    readonly precisionDigits: number;
  }>;
}

interface TilesGolden {
  readonly cases: ReadonlyArray<{
    readonly id: string;
    readonly lon: number;
    readonly lat: number;
    readonly zoom: number;
    readonly expected: { readonly x: number; readonly y: number };
  }>;
}

const elevationsGolden = readJson<ElevationsGolden>("./golden/elevations.json");
const slopesGolden = readJson<SlopesGolden>("./golden/slopes.json");
const tilesGolden = readJson<TilesGolden>("./golden/tiles.json");

describe("DEM PNG fixtures round-trip through decodeElevation", () => {
  for (const fixture of elevationsGolden.fixtures) {
    describe(`${fixture.id} (${fixture.category})`, () => {
      const raster = decodePng(readBytes(`./dem/${fixture.fileName}`));

      it("has the dimensions recorded in the golden data", () => {
        expect(raster.width).toBe(fixture.width);
        expect(raster.height).toBe(fixture.height);
      });

      it("decodes every pixel back to the intended elevation", () => {
        for (let y = 0; y < fixture.height; y++) {
          for (let x = 0; x < fixture.width; x++) {
            const [r, g, b] = raster.pixels[y]![x]!;
            const decoded = decodeElevation(r, g, b);
            const intended = fixture.intendedElevationsM[y]![x]!;
            if (intended === null) {
              expect(decoded, `cell (${x},${y}) should be no-data`).toBeNull();
            } else {
              expect(decoded, `cell (${x},${y})`).not.toBeNull();
              expect(decoded as number, `cell (${x},${y})`).toBeCloseTo(intended, 6);
            }
          }
        }
      });

      it("matches the recorded coverage / min / max statistics", () => {
        const flat = fixture.intendedElevationsM.flat();
        const valid = flat.filter((v): v is number => v !== null);
        const coverage =
          valid.length === flat.length ? "FULL" : valid.length === 0 ? "NONE" : "PARTIAL";
        expect(coverage).toBe(fixture.stats.coverage);
        expect(valid.length).toBe(fixture.stats.validCount);
        expect(flat.length - valid.length).toBe(fixture.stats.invalidCount);
        expect(fixture.stats.minM).toBe(valid.length > 0 ? Math.min(...valid) : null);
        expect(fixture.stats.maxM).toBe(valid.length > 0 ? Math.max(...valid) : null);
      });
    });
  }
});

describe("encodeElevation is the exact inverse of decodeElevation", () => {
  // Representative and boundary elevations (multiples of the 0.01 m resolution).
  const cases: ReadonlyArray<number | null> = [
    0,
    0.01,
    -0.01,
    12.5,
    -3.5,
    1235,
    -83886.07,
    83886.07,
    null,
  ];

  it.each(cases)("round-trips %s", (elevation) => {
    const [r, g, b] = encodeElevation(elevation);
    const decoded = decodeElevation(r, g, b);
    if (elevation === null) {
      expect(decoded).toBeNull();
    } else {
      expect(decoded as number).toBeCloseTo(elevation, 6);
    }
  });

  it("encodes no-data to the sentinel RGB 128,0,0", () => {
    expect(encodeElevation(null)).toEqual(NO_DATA_RGB);
    expect(decodeElevation(...NO_DATA_RGB)).toBeNull();
  });

  it("rejects elevations outside the representable range", () => {
    expect(() => encodeElevation(83886.08)).toThrow(RangeError);
    expect(() => encodeElevation(-83886.08)).toThrow(RangeError);
  });
});

describe("Horn slope golden cases (calculateSlopeDeg)", () => {
  it.each(slopesGolden.cases)("$id: $description", (slopeCase) => {
    const neighborhood = slopeCase.neighborhood as Neighborhood3x3;
    const actual = calculateSlopeDeg(neighborhood, slopeCase.dxMeters, slopeCase.dyMeters);
    if (slopeCase.expectedSlopeDeg === null) {
      expect(actual).toBeNull();
    } else {
      expect(actual).not.toBeNull();
      expect(actual as number).toBeCloseTo(slopeCase.expectedSlopeDeg, slopeCase.precisionDigits);
    }
  });
});

describe("XYZ tile-coordinate golden cases (lonLatToTileXY)", () => {
  it.each(tilesGolden.cases)("$id: $description", (tileCase) => {
    const tile = lonLatToTileXY(tileCase.lon, tileCase.lat, tileCase.zoom);
    expect(tile.x).toBe(tileCase.expected.x);
    expect(tile.y).toBe(tileCase.expected.y);
  });

  // Latitudes beyond the Web Mercator bound must clamp (design spec 8.1). We
  // assert clamping *engages* — the out-of-band point lands on the same tile as
  // the exact bound — rather than pinning the exact y, which sits on the
  // projection singularity and is sensitive to the rounded bound constant.
  it.each([3, 8, 14])("clamps north latitudes beyond the bound at z%i", (zoom) => {
    const beyond = lonLatToTileXY(0, 89, zoom);
    const atBound = lonLatToTileXY(0, MAX_MERCATOR_LATITUDE, zoom);
    expect(beyond).toEqual(atBound);
  });

  it.each([3, 8, 14])("clamps south latitudes beyond the bound at z%i", (zoom) => {
    const beyond = lonLatToTileXY(0, -89, zoom);
    const atBound = lonLatToTileXY(0, -MAX_MERCATOR_LATITUDE, zoom);
    expect(beyond).toEqual(atBound);
  });
});
