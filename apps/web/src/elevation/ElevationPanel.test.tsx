import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ElevationPanel } from "./ElevationPanel";

const TOKYO = { lat: 35.681236, lon: 139.767125 };

describe("ElevationPanel", () => {
  it("prompts for a click when idle", () => {
    render(<ElevationPanel state={{ phase: "idle" }} />);
    expect(screen.getByRole("region", { name: "地点標高" })).toHaveTextContent(
      "地図をクリックすると",
    );
  });

  it("shows progress while loading", () => {
    render(<ElevationPanel state={{ phase: "loading", coordinate: TOKYO }} />);
    expect(screen.getByText(/取得中/)).toHaveTextContent("35.68124");
  });

  it("shows elevation, source, grade and provenance on success", () => {
    render(
      <ElevationPanel
        state={{
          phase: "done",
          coordinate: TOKYO,
          result: {
            kind: "ok",
            point: {
              coordinate: TOKYO,
              elevationM: 3.2,
              source: "DEM5A",
              quality: { grade: "A", coverage: "FULL" },
              provenance: [
                {
                  sourceName: "国土地理院 標高タイル DEM5A",
                  sourceUrl: "https://example/tile.png",
                  termsUrl: "https://maps.gsi.go.jp/development/ichiran.html",
                  retrievedAt: "2026-07-17T00:00:00.000Z",
                },
              ],
            },
          },
        }}
      />,
    );

    expect(screen.getByText("3.20 m")).toBeInTheDocument();
    expect(screen.getByText(/DEM5A \(グレード A\)/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /国土地理院/ })).toHaveAttribute(
      "href",
      "https://maps.gsi.go.jp/development/ichiran.html",
    );
  });

  it("states that missing data does not mean safe (Unknown is not Safe)", () => {
    render(
      <ElevationPanel
        state={{ phase: "done", coordinate: TOKYO, result: { kind: "no-coverage" } }}
      />,
    );
    expect(screen.getByText(/データが無いことは安全を意味しません/)).toBeInTheDocument();
  });

  it("distinguishes upstream failure as 判定不能, not as no-data", () => {
    render(
      <ElevationPanel
        state={{ phase: "done", coordinate: TOKYO, result: { kind: "unavailable" } }}
      />,
    );
    expect(screen.getByText(/判定不能/)).toBeInTheDocument();
    expect(screen.queryByText(/データが無いこと/)).not.toBeInTheDocument();
  });

  it("shows a retryable message for transport errors", () => {
    render(
      <ElevationPanel
        state={{
          phase: "done",
          coordinate: TOKYO,
          result: { kind: "error", message: "HTTP 500" },
        }}
      />,
    );
    expect(screen.getByText(/通信エラー/)).toHaveTextContent("HTTP 500");
  });
});
