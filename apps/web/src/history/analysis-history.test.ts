import { describe, expect, it } from "vitest";
import type { ElevationResult } from "../elevation/elevation-client";
import type { TerrainAnalysisResult } from "../analysis/terrain-service";
import {
  HISTORY_MAX_ITEMS,
  HISTORY_STORAGE_KEY,
  clearHistory,
  compareAnalyses,
  createSavedAnalysis,
  deleteAnalysis,
  loadHistory,
  persistAnalysis,
} from "./analysis-history";
import type { AnalysisSnapshot, HistoryStorage, SavedAnalysis } from "./analysis-history";

function memoryStorage(initial?: string): HistoryStorage & { readonly raw: string | null } {
  let value: string | null = initial ?? null;
  return {
    raw: value,
    getItem: (key: string): string | null => (key === HISTORY_STORAGE_KEY ? value : null),
    setItem: (key: string, next: string): void => {
      if (key === HISTORY_STORAGE_KEY) {
        value = next;
      }
    },
    removeItem: (key: string): void => {
      if (key === HISTORY_STORAGE_KEY) {
        value = null;
      }
    },
  };
}

function elevation(elevationM: number): ElevationResult {
  return {
    kind: "ok",
    point: {
      coordinate: { lat: 35.1, lon: 138.1 },
      elevationM,
      source: "DEM5A",
      quality: { grade: "A", coverage: "FULL" },
    },
  };
}

function terrain(meanDeg: number, maxDeg: number, steepRatio: number): TerrainAnalysisResult {
  return {
    kind: "ok",
    center: { lat: 35.1, lon: 138.1 },
    stats: {
      meanDeg,
      maxDeg,
      steepRatio,
      steepThresholdDeg: 30,
      validCount: 10,
      evaluatedCount: 31 * 31,
    },
    classes: {
      counts: { ridge: 1, slope: 2, valley: 3, flat: 4 },
      classified: 10,
      unknown: 0,
      tpiThresholdM: 1,
      flatSlopeDeg: 5,
    },
    quality: {
      grade: "A",
      missingRatio: 0,
      sourceMix: { DEM1A: 0, DEM5A: 10, DEM5B: 0, DEM5C: 0, DEM10B: 0 },
      coverage: "FULL",
      warnings: [],
    },
    provenance: [],
    extentM: 160,
  };
}

function snapshot(): AnalysisSnapshot {
  return {
    coordinate: { lat: 35.1, lon: 138.1 },
    elevation: elevation(120),
    terrain: terrain(12.3, 31.2, 0.18),
    section: null,
    sectionLine: null,
  };
}

describe("analysis history storage", () => {
  it("returns an empty list when nothing is stored", () => {
    expect(loadHistory(memoryStorage())).toEqual([]);
  });

  it("ignores corrupt JSON and invalid entries without throwing", () => {
    expect(loadHistory(memoryStorage("{not-json"))).toEqual([]);
    expect(loadHistory(memoryStorage(JSON.stringify([{ id: 1 }, null, { bad: true }])))).toEqual(
      [],
    );
  });

  it("loads valid saved analyses", () => {
    const entry = createSavedAnalysis(snapshot(), {
      id: "a1",
      now: () => new Date("2026-08-12T00:00:00Z"),
    });
    const storage = memoryStorage(JSON.stringify([entry]));

    expect(loadHistory(storage)).toEqual([entry]);
  });

  it("persists a new entry at the head and deduplicates by id", () => {
    const storage = memoryStorage();
    const first = createSavedAnalysis(snapshot(), {
      id: "a1",
      now: () => new Date("2026-08-12T00:00:00Z"),
    });
    const updated = createSavedAnalysis(snapshot(), {
      id: "a1",
      now: () => new Date("2026-08-13T00:00:00Z"),
    });

    expect(persistAnalysis([], first, storage)).toMatchObject({ ok: true });
    const result = persistAnalysis(loadHistory(storage), updated, storage);

    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe("a1");
    expect(result.items[0]?.savedAt).toBe("2026-08-13T00:00:00.000Z");
    expect(loadHistory(storage)).toEqual(result.items);
  });

  it("caps the history at the configured maximum", () => {
    const storage = memoryStorage();
    let items: readonly SavedAnalysis[] = [];
    for (let i = 0; i < HISTORY_MAX_ITEMS + 5; i++) {
      const entry = createSavedAnalysis(snapshot(), { id: `id-${i}`, now: () => new Date(i) });
      items = persistAnalysis(items, entry, storage).items;
    }

    expect(items).toHaveLength(HISTORY_MAX_ITEMS);
    expect(items[0]?.id).toBe(`id-${HISTORY_MAX_ITEMS + 4}`);
  });

  it("returns ok=false and keeps the previous list when storage writes fail", () => {
    const failing: HistoryStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
      removeItem: () => {
        throw new Error("quota exceeded");
      },
    };
    const entry = createSavedAnalysis(snapshot(), { id: "a1" });

    expect(persistAnalysis([], entry, failing)).toEqual({ ok: false, items: [] });
  });

  it("deletes and clears entries", () => {
    const storage = memoryStorage();
    const a = createSavedAnalysis(snapshot(), { id: "a", now: () => new Date(1) });
    const b = createSavedAnalysis(snapshot(), { id: "b", now: () => new Date(2) });
    persistAnalysis([], a, storage);
    persistAnalysis(loadHistory(storage), b, storage);

    const deleted = deleteAnalysis(loadHistory(storage), "a", storage);
    expect(deleted.ok).toBe(true);
    expect(deleted.items.map((item) => item.id)).toEqual(["b"]);

    const cleared = clearHistory(storage);
    expect(cleared.ok).toBe(true);
    expect(cleared.items).toEqual([]);
  });
});

describe("compareAnalyses", () => {
  it("builds side-by-side rows and marks differences", () => {
    const left = createSavedAnalysis(snapshot(), {
      id: "a",
      now: () => new Date("2026-08-12T00:00:00Z"),
    });
    const right = createSavedAnalysis(
      {
        ...snapshot(),
        coordinate: { lat: 36.2, lon: 139.3 },
        elevation: elevation(80),
        terrain: terrain(18.7, 42.5, 0.42),
      },
      { id: "b", now: () => new Date("2026-08-13T00:00:00Z") },
    );

    const rows = compareAnalyses(left, right);

    expect(rows.find((row) => row.key === "mean")).toMatchObject({
      left: "12.3°",
      right: "18.7°",
      differs: true,
    });
    expect(rows.find((row) => row.key === "max")).toMatchObject({ left: "31.2°", right: "42.5°" });
    expect(rows.find((row) => row.key === "coordinate")?.differs).toBe(true);
  });

  it("shows '—' for missing metrics instead of fabricating values", () => {
    const left = createSavedAnalysis(
      { ...snapshot(), terrain: null, section: null },
      { id: "a", now: () => new Date(1) },
    );
    const right = createSavedAnalysis(snapshot(), { id: "b", now: () => new Date(2) });

    const rows = compareAnalyses(left, right);

    expect(rows.find((row) => row.key === "mean")).toMatchObject({ left: "—" });
    expect(rows.find((row) => row.key === "section-mean")).toMatchObject({
      left: "—",
      right: "—",
    });
    expect(rows.find((row) => row.key === "classified")).toMatchObject({ left: "0" });
  });
});
