import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";

describe("App", () => {
  it("renders the application title as a heading", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", {
        name: /Civil Terrain & Slope Risk Viewer/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders a StatusBadge from the shared @civil-terrain/ui package", () => {
    render(<App />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveTextContent("参考情報");
    expect(badge).toHaveAttribute("data-status", "REFERENCE");
  });
});
