import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OutputTab } from "./OutputTab";

const SHARE_URL = "http://localhost/#view=5/36.5/138&base=std";

describe("OutputTab", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders report export actions as disabled (準備中)", () => {
    render(<OutputTab shareUrl={SHARE_URL} />);
    expect(screen.getByRole("button", { name: "レポート出力 (Markdown)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "CSV" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "JSON" })).toBeDisabled();
  });

  it("shows the share URL and the privacy note", () => {
    render(<OutputTab shareUrl={SHARE_URL} />);
    expect(screen.getByRole("textbox", { name: "共有URL" })).toHaveValue(SHARE_URL);
    expect(screen.getByText("住所・現在地履歴・自由記述は含まれません。")).toBeInTheDocument();
  });

  it("copies the share URL to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    render(<OutputTab shareUrl={SHARE_URL} />);
    fireEvent.click(screen.getByRole("button", { name: "コピー" }));

    expect(writeText).toHaveBeenCalledWith(SHARE_URL);
    expect(await screen.findByRole("button", { name: "コピー済み" })).toBeInTheDocument();
  });
});
