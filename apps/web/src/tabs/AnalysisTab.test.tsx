import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AnalysisTab } from "./AnalysisTab";
import { findTab } from "./tabs";

const terrainTab = findTab("terrain");

describe("AnalysisTab", () => {
  it("shows the point-not-selected empty state with a way back to the map", () => {
    const onGoToMap = vi.fn();
    render(<AnalysisTab tab={terrainTab} selectedPoint={null} onGoToMap={onGoToMap} />);

    expect(screen.getByText("地点が未選択です")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "地図タブへ" }));
    expect(onGoToMap).toHaveBeenCalledTimes(1);
  });

  it("shows the selected coordinate and a preparing notice — never fabricated figures", () => {
    render(
      <AnalysisTab
        tab={terrainTab}
        selectedPoint={{ lat: 35.36061, lon: 138.72743 }}
        onGoToMap={() => undefined}
      />,
    );

    expect(screen.getByText(/緯度 35\.36061 \/ 経度 138\.72743/)).toBeInTheDocument();
    expect(screen.getByText("準備中")).toBeInTheDocument();
    // Unknown-is-not-safe wording must accompany the missing analysis.
    expect(screen.getByText(/リスクが無いことを意味しません/)).toBeInTheDocument();
    // The design mock's fabricated figures must not leak into the product.
    expect(screen.queryByText(/14\.8/)).not.toBeInTheDocument();
  });
});
