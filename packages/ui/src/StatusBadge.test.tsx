import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge.js";

describe("StatusBadge", () => {
  it("renders the reference state as a status region with its label", () => {
    render(<StatusBadge status="REFERENCE" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveTextContent("参考情報");
    expect(badge).toHaveAttribute("data-status", "REFERENCE");
  });

  it("renders the check-required state as a status region with its label", () => {
    render(<StatusBadge status="CHECK_REQUIRED" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveTextContent("追加確認が必要");
    expect(badge).toHaveAttribute("data-status", "CHECK_REQUIRED");
  });

  it("renders the unknown state as a status region with its label", () => {
    render(<StatusBadge status="UNKNOWN" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveTextContent("データ不足/取得失敗");
    expect(badge).toHaveAttribute("data-status", "UNKNOWN");
  });

  it("renders the pending state as a progressbar, not a status region", () => {
    render(<StatusBadge status="PENDING" />);
    const badge = screen.getByRole("progressbar");
    expect(badge).toHaveTextContent("分析中");
    expect(badge).toHaveAttribute("data-status", "PENDING");
    expect(screen.queryByRole("status")).toBeNull();
  });
});
