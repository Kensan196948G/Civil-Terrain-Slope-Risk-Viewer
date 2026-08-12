import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MapErrorBoundary } from "./MapErrorBoundary";

function ThrowingChild(): never {
  throw new Error("WebGL context creation failed");
}

describe("MapErrorBoundary", () => {
  it("renders the fallback when the map throws (e.g. WebGL unavailable)", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <MapErrorBoundary>
        <ThrowingChild />
      </MapErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("地図を表示できませんでした");
    expect(screen.getByRole("button", { name: "再読み込み" })).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it("renders children when no error occurs", () => {
    render(
      <MapErrorBoundary>
        <p>地図コンテンツ</p>
      </MapErrorBoundary>,
    );

    expect(screen.getByText("地図コンテンツ")).toBeInTheDocument();
  });

  it("retries after the user clicks the reload button", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let shouldThrow = true;
    function FlakyChild(): ReactElement {
      if (shouldThrow) {
        throw new Error("boom");
      }
      return <p>回復しました</p>;
    }
    render(
      <MapErrorBoundary>
        <FlakyChild />
      </MapErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(screen.getByText("回復しました")).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
