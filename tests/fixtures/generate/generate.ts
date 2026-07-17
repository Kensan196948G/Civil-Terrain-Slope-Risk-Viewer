/**
 * Golden fixture generator (design spec 14.3).
 *
 * Re-runnable with no build step (Node type-stripping). PNG synthesis uses only
 * the Node standard library; JSON output is formatted through Prettier (a repo
 * devDependency) so regenerated fixtures stay clean under `prettier --check`.
 * Regenerates:
 *   tests/fixtures/dem/*.png            synthetic GSI-format DEM tiles
 *   tests/fixtures/golden/elevations.json   intended elevations + stats
 *   tests/fixtures/golden/slopes.json       Horn slope golden cases
 *   tests/fixtures/golden/tiles.json        XYZ tile-coordinate golden cases
 *   tests/fixtures/landform/landform-samples.json  10 normalized classes + boundary
 *
 * Run with:  node tests/fixtures/generate/generate.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { format, resolveConfig } from "prettier";

import { encodeElevationGrid } from "./dem-encode.ts";
import { encodePng } from "./png.ts";
import {
  DEM_FIXTURES,
  LANDFORM_BOUNDARY_SAMPLE,
  LANDFORM_SAMPLES,
  NORMALIZED_LANDFORM_CLASSES,
  SLOPE_CASES,
  SYNTHETIC_PROVENANCE,
  TILE_CASES,
  type DemFixtureSpec,
} from "./spec.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = resolve(here, "..");
const demDir = resolve(fixturesRoot, "dem");
const goldenDir = resolve(fixturesRoot, "golden");
const landformDir = resolve(fixturesRoot, "landform");

type Coverage = "FULL" | "PARTIAL" | "NONE";

interface ElevationStats {
  readonly validCount: number;
  readonly invalidCount: number;
  readonly minM: number | null;
  readonly maxM: number | null;
  readonly coverage: Coverage;
}

function computeStats(grid: ReadonlyArray<ReadonlyArray<number | null>>): ElevationStats {
  const valid = grid.flat().filter((v): v is number => v !== null);
  const invalidCount = grid.flat().length - valid.length;
  const coverage: Coverage = invalidCount === 0 ? "FULL" : valid.length === 0 ? "NONE" : "PARTIAL";
  return {
    validCount: valid.length,
    invalidCount,
    minM: valid.length > 0 ? Math.min(...valid) : null,
    maxM: valid.length > 0 ? Math.max(...valid) : null,
    coverage,
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const config = await resolveConfig(path);
  const formatted = await format(JSON.stringify(value), {
    ...config,
    parser: "json",
    filepath: path,
  });
  writeFileSync(path, formatted, "utf8");
}

function generateDemTile(spec: DemFixtureSpec): void {
  const raster = encodeElevationGrid(spec.grid);
  const png = encodePng(raster);
  writeFileSync(resolve(demDir, spec.fileName), png);
}

async function main(): Promise<void> {
  for (const dir of [demDir, goldenDir, landformDir]) {
    mkdirSync(dir, { recursive: true });
  }

  for (const spec of DEM_FIXTURES) {
    generateDemTile(spec);
  }

  const elevations = {
    _provenance: SYNTHETIC_PROVENANCE,
    fixtures: DEM_FIXTURES.map((spec) => ({
      id: spec.id,
      fileName: spec.fileName,
      title: spec.title,
      category: spec.category,
      description: spec.description,
      representativePoint: spec.representativePoint,
      mimicsDemSource: spec.mimicsDemSource,
      width: spec.grid[0]?.length ?? 0,
      height: spec.grid.length,
      stats: computeStats(spec.grid),
      intendedElevationsM: spec.grid,
    })),
  };
  await writeJson(resolve(goldenDir, "elevations.json"), elevations);

  await writeJson(resolve(goldenDir, "slopes.json"), {
    _provenance: SYNTHETIC_PROVENANCE,
    algorithm: "Horn 3x3 (design spec 8.3)",
    cases: SLOPE_CASES,
  });

  await writeJson(resolve(goldenDir, "tiles.json"), {
    _provenance: SYNTHETIC_PROVENANCE,
    projection: "XYZ / Web Mercator (design spec 8.1)",
    cases: TILE_CASES,
  });

  await writeJson(resolve(landformDir, "landform-samples.json"), {
    _provenance: SYNTHETIC_PROVENANCE,
    normalizedClasses: NORMALIZED_LANDFORM_CLASSES,
    fields: ["originalCode", "normalizedClass", "sourceDataset", "sourceDate", "description"],
    samples: LANDFORM_SAMPLES,
    boundarySample: LANDFORM_BOUNDARY_SAMPLE,
  });

  const generated = [
    ...DEM_FIXTURES.map((s) => `dem/${s.fileName}`),
    "golden/elevations.json",
    "golden/slopes.json",
    "golden/tiles.json",
    "landform/landform-samples.json",
  ];
  process.stdout.write(`Generated ${generated.length} fixtures:\n  ${generated.join("\n  ")}\n`);
}

await main();
