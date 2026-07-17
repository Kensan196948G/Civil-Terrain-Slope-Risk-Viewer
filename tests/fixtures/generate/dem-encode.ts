/**
 * Inverse of `@civil-terrain/geo`'s `decodeElevation` (design spec 8.2).
 *
 * Given an elevation in meters (or `null` for the no-data sentinel) this returns
 * the GSI DEM `[R, G, B]` triple such that
 *   decodeElevation(...encodeElevation(h)) === h
 * for every `h` that is a multiple of the 0.01 m resolution within range.
 *
 * This is the single source of truth used to synthesize the golden PNG tiles.
 * Keeping encode here (not inlined in the test) guarantees the round-trip test
 * checks the same encoder that produced the fixtures.
 */

const POW_2_8 = 256;
const POW_2_16 = 65536;
const POW_2_23 = 8388608; // invalid / no-data sentinel value of x
const POW_2_24 = 16777216;
const ELEVATION_RESOLUTION_M = 0.01;

/** Largest magnitude of the signed integer `round(h / 0.01)` that stays valid. */
const MAX_SIGNED = POW_2_23 - 1; // 8388607  -> ±83886.07 m

export type Rgb = readonly [number, number, number];

/** RGB triple that decodes to the no-data sentinel (`x = 2^23`). */
export const NO_DATA_RGB: Rgb = [128, 0, 0];

/**
 * Encode an elevation (meters) or `null` (no-data) into a GSI DEM RGB triple.
 * Throws for elevations outside the representable ±83886.07 m band so a bad
 * fixture value fails loudly rather than wrapping around silently.
 */
export function encodeElevation(elevationM: number | null): Rgb {
  if (elevationM === null) {
    return NO_DATA_RGB;
  }
  if (!Number.isFinite(elevationM)) {
    throw new RangeError(`Elevation must be finite or null, got ${elevationM}`);
  }

  const signed = Math.round(elevationM / ELEVATION_RESOLUTION_M);
  if (signed > MAX_SIGNED || signed < -MAX_SIGNED) {
    throw new RangeError(
      `Elevation ${elevationM} m is outside the representable ±${
        MAX_SIGNED * ELEVATION_RESOLUTION_M
      } m range`,
    );
  }

  const x = signed >= 0 ? signed : signed + POW_2_24;
  // The guard above excludes signed === -2^23, so x can never equal the
  // sentinel here; assert it defensively in case the constants ever change.
  if (x === POW_2_23) {
    throw new RangeError(`Elevation ${elevationM} m collides with the no-data sentinel`);
  }

  const r = Math.floor(x / POW_2_16);
  const g = Math.floor((x % POW_2_16) / POW_2_8);
  const b = x % POW_2_8;
  return [r, g, b];
}

/** Encode a full elevation grid (`grid[y][x]`) into an RGB raster. */
export function encodeElevationGrid(grid: ReadonlyArray<ReadonlyArray<number | null>>): Rgb[][] {
  return grid.map((row) =>
    row.map((elevation) => [...encodeElevation(elevation)] as [number, number, number]),
  );
}
