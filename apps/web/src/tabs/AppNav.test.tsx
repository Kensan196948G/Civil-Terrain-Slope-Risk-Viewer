import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AppNav } from "./AppNav";
import { TABS } from "./tabs";

describe("AppNav", () => {
  it("renders one button per tab", () => {
    render(<AppNav tabs={TABS} activeTab="map" onSelect={() => undefined} />);
    for (const tab of TABS) {
      expect(screen.getByRole("button", { name: new RegExp(tab.label) })).toBeInTheDocument();
    }
  });

  it("marks the active tab with aria-current", () => {
    render(<AppNav tabs={TABS} activeTab="terrain" onSelect={() => undefined} />);
    expect(screen.getByRole("button", { name: /地形分析/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: /地図/ })).not.toHaveAttribute("aria-current");
  });

  it("reports selection through onSelect", () => {
    const onSelect = vi.fn();
    render(<AppNav tabs={TABS} activeTab="map" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /確認支援/ }));
    expect(onSelect).toHaveBeenCalledWith("confirm");
  });
});
