import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DemMetaCards } from "./DemMetaCards";
import type { ElevationResult } from "./elevation-client";

const COORD = { lat: 35.0, lon: 138.0 };

function okResult(): ElevationResult {
  return {
    kind: "ok",
    point: {
      coordinate: COORD,
      elevationM: 123.45,
      source: "gsi-dem10b",
      quality: { grade: "A", coverage: "FULL" },
      provenance: [
        {
          sourceName: "国土地理院 標高タイル",
          sourceUrl: "https://cyberjapandata.gsi.go.jp/",
          termsUrl: "https://maps.gsi.go.jp/development/ichiran.html",
          retrievedAt: "2026-07-24T02:00:00Z",
        },
      ],
    },
  };
}

describe("DemMetaCards", () => {
  it("prompts before any retrieval", () => {
    render(<DemMetaCards state={{ phase: "idle" }} />);
    expect(screen.getByText(/地図をクリックすると/)).toBeInTheDocument();
  });

  it("shows real provenance and quality after a successful fetch", () => {
    render(<DemMetaCards state={{ phase: "done", coordinate: COORD, result: okResult() }} />);

    expect(screen.getByText("国土地理院 標高タイル")).toBeInTheDocument();
    expect(screen.getByText("gsi-dem10b")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("2026-07-24")).toBeInTheDocument();
    // Fabricated design metrics (resolution / missing-rate) must not appear.
    expect(screen.queryByText(/欠損率/)).not.toBeInTheDocument();
    expect(screen.queryByText(/解像度/)).not.toBeInTheDocument();
  });

  it("keeps unknown-is-not-safe wording for missing coverage", () => {
    render(
      <DemMetaCards
        state={{ phase: "done", coordinate: COORD, result: { kind: "no-coverage" } }}
      />,
    );
    expect(screen.getByText(/安全を意味しません/)).toBeInTheDocument();
  });
});
