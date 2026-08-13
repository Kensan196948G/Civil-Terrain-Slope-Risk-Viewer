import { describe, expect, it } from "vitest";
import { buildConfirmCards } from "../analysis/confirm-cards";
import { compareAnalyses } from "../history/analysis-history";
import { DEMO_ANALYSES } from "./demo-analyses";

describe("DEMO_ANALYSES", () => {
  it("ships complete synthetic records for first-run MVP evaluation", () => {
    expect(DEMO_ANALYSES).toHaveLength(3);
    expect(DEMO_ANALYSES.every((item) => item.demo === true)).toBe(true);
    expect(DEMO_ANALYSES.every((item) => item.label?.startsWith("デモ:") === true)).toBe(true);
    expect(DEMO_ANALYSES.every((item) => item.elevation.kind === "ok")).toBe(true);
    expect(DEMO_ANALYSES.every((item) => item.terrain?.kind === "ok")).toBe(true);
  });

  it("uses explicit synthetic provenance instead of real project or personal data", () => {
    const provenance = DEMO_ANALYSES.flatMap((item) =>
      item.terrain?.kind === "ok" ? item.terrain.provenance : [],
    );

    expect(provenance).not.toHaveLength(0);
    expect(provenance.every((entry) => entry.sourceId === "demo-fixture-dem")).toBe(true);
    expect(provenance.every((entry) => entry.sourceUrl.startsWith("app://demo-fixtures/"))).toBe(
      true,
    );
  });

  it("covers comparison and check-card scenarios", () => {
    const [yardA, routeB] = DEMO_ANALYSES;
    expect(yardA).toBeDefined();
    expect(routeB).toBeDefined();

    const rows = compareAnalyses(yardA!, routeB!);
    expect(rows.find((row) => row.key === "mean")).toMatchObject({
      left: "8.6°",
      right: "22.1°",
      differs: true,
    });

    const cards = buildConfirmCards({ terrain: routeB!.terrain, section: routeB!.section });
    expect(cards.cards.map((card) => card.code)).toEqual(
      expect.arrayContaining(["steep-slope-max", "steep-area-ratio", "section-steep"]),
    );
  });
});
