import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionProfileChart } from "./SectionProfileChart";

describe("SectionProfileChart", () => {
  it("draws one polyline for a continuous profile", () => {
    const { container } = render(
      <SectionProfileChart
        samples={[
          { distanceM: 0, elevationM: 100 },
          { distanceM: 50, elevationM: 120 },
          { distanceM: 100, elevationM: 110 },
        ]}
      />,
    );
    expect(container.querySelectorAll("polyline")).toHaveLength(1);
  });

  it("splits the line at missing samples instead of interpolating", () => {
    const { container } = render(
      <SectionProfileChart
        samples={[
          { distanceM: 0, elevationM: 100 },
          { distanceM: 50, elevationM: 110 },
          { distanceM: 100, elevationM: null },
          { distanceM: 150, elevationM: 130 },
          { distanceM: 200, elevationM: 140 },
        ]}
      />,
    );

    expect(container.querySelectorAll("polyline")).toHaveLength(2);
    expect(screen.getByText(/欠損区間は安全を意味しません/)).toBeInTheDocument();
  });

  it("reports when nothing can be drawn (判定不能)", () => {
    render(
      <SectionProfileChart
        samples={[
          { distanceM: 0, elevationM: null },
          { distanceM: 100, elevationM: null },
        ]}
      />,
    );
    expect(screen.getByText(/描画できる有効サンプルがありません/)).toBeInTheDocument();
  });
});
