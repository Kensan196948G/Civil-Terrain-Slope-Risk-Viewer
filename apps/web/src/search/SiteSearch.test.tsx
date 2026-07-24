import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SiteSearch } from "./SiteSearch";

describe("SiteSearch", () => {
  it("renders the search landmark with an accessible input", () => {
    render(
      <SiteSearch
        query=""
        error={null}
        onQueryChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    expect(screen.getByRole("search")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "地点検索" })).toBeInTheDocument();
  });

  it("reports typing through onQueryChange", () => {
    const onQueryChange = vi.fn();
    render(
      <SiteSearch query="" error={null} onQueryChange={onQueryChange} onSubmit={() => undefined} />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "地点検索" }), {
      target: { value: "富士山" },
    });
    expect(onQueryChange).toHaveBeenCalledWith("富士山");
  });

  it("submits on Enter / button press", () => {
    const onSubmit = vi.fn();
    render(
      <SiteSearch
        query="富士山"
        error={null}
        onQueryChange={() => undefined}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.submit(screen.getByRole("search"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("surfaces an error message as an alert", () => {
    render(
      <SiteSearch
        query="存在しない"
        error="該当する地点が見つかりませんでした。"
        onQueryChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("該当する地点が見つかりませんでした。");
  });
});
