import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LayerSwitcher } from "./LayerSwitcher";

describe("LayerSwitcher", () => {
  it("renders base layers as an exclusive radio group with text labels", () => {
    render(
      <LayerSwitcher
        selection={{ base: "std", overlays: [] }}
        onBaseChange={vi.fn()}
        onOverlayToggle={vi.fn()}
      />,
    );

    expect(screen.getByRole("radio", { name: "標準地図" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "淡色地図" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "写真" })).not.toBeChecked();
  });

  it("renders overlays as independent checkboxes", () => {
    render(
      <LayerSwitcher
        selection={{ base: "std", overlays: ["hillshade"] }}
        onBaseChange={vi.fn()}
        onOverlayToggle={vi.fn()}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "傾斜量図" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "陰影起伏図" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "土砂災害警戒区域（土石流）" })).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "土砂災害警戒区域（急傾斜地の崩壊）" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "土砂災害警戒区域（地すべり）" }),
    ).not.toBeChecked();
  });

  it("notifies base selection changes", () => {
    const onBaseChange = vi.fn();
    render(
      <LayerSwitcher
        selection={{ base: "std", overlays: [] }}
        onBaseChange={onBaseChange}
        onOverlayToggle={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "淡色地図" }));
    expect(onBaseChange).toHaveBeenCalledWith("pale");
  });

  it("notifies overlay toggles with the next enabled state", () => {
    const onOverlayToggle = vi.fn();
    render(
      <LayerSwitcher
        selection={{ base: "std", overlays: ["slope"] }}
        onBaseChange={vi.fn()}
        onOverlayToggle={onOverlayToggle}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "傾斜量図" }));
    expect(onOverlayToggle).toHaveBeenCalledWith("slope", false);

    fireEvent.click(screen.getByRole("checkbox", { name: "陰影起伏図" }));
    expect(onOverlayToggle).toHaveBeenCalledWith("hillshade", true);
  });
});
