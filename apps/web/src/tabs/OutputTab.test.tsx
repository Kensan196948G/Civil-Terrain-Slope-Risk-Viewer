import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OutputTab, type OutputReportData } from "./OutputTab";

vi.mock("../output/download", () => ({
  downloadTextFile: vi.fn(),
  dateStamp: vi.fn(() => "2026-08-12"),
}));
import { downloadTextFile } from "../output/download";

const SHARE_URL = "http://localhost/#view=5/36.5/138&base=std";
const REPORT: OutputReportData = {
  coordinate: { lat: 35.68, lon: 139.76 },
  elevation: {
    kind: "ok",
    point: {
      coordinate: { lat: 35.68, lon: 139.76 },
      elevationM: 12.34,
      source: "DEM5A",
      quality: { grade: "A", coverage: "FULL" },
      provenance: [
        {
          sourceName: "国土地理院 標高タイル DEM5A",
          sourceUrl: "https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/",
          termsUrl: "https://maps.gsi.go.jp/development/ichiran.html",
          retrievedAt: "2026-08-12T00:00:00Z",
        },
      ],
    },
  },
  terrain: null,
  section: null,
  confirmCards: [],
};

describe("OutputTab", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("renders report export actions as disabled while no point is selected", () => {
    render(<OutputTab shareUrl={SHARE_URL} report={null} />);
    expect(screen.getByRole("button", { name: "レポート出力 (Markdown)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "CSV" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "JSON" })).toBeDisabled();
  });

  it("enables report export once analysis data is available", () => {
    render(<OutputTab shareUrl={SHARE_URL} report={REPORT} />);
    expect(screen.getByRole("button", { name: "レポート出力 (Markdown)" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "CSV" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "JSON" })).toBeEnabled();
  });

  it("downloads a Markdown report with evidence and disclaimer", () => {
    render(<OutputTab shareUrl={SHARE_URL} report={REPORT} />);
    fireEvent.click(screen.getByRole("button", { name: "レポート出力 (Markdown)" }));

    expect(downloadTextFile).toHaveBeenCalledTimes(1);
    const [filename, content, mime] = vi.mocked(downloadTextFile).mock.calls[0]!;
    expect(filename).toBe("terrain-report-2026-08-12.md");
    expect(mime).toContain("text/markdown");
    expect(content).toContain("12.34 m");
    expect(content).toContain("国土地理院 標高タイル DEM5A");
    expect(content).toContain("安全 (リスクなし) を意味しません");
  });

  it("downloads a JSON report as parseable JSON", () => {
    render(<OutputTab shareUrl={SHARE_URL} report={REPORT} />);
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));

    const [, content] = vi.mocked(downloadTextFile).mock.calls[0]!;
    const parsed = JSON.parse(content) as { schemaVersion: string; elevation: unknown };
    expect(parsed.schemaVersion).toBe("1.0.0");
    expect(parsed.elevation).toBeDefined();
  });

  it("shows the share URL and the privacy note", () => {
    render(<OutputTab shareUrl={SHARE_URL} report={REPORT} />);
    expect(screen.getByRole("textbox", { name: "共有URL" })).toHaveValue(SHARE_URL);
    expect(screen.getByText("住所・現在地履歴・自由記述は含まれません。")).toBeInTheDocument();
  });

  it("copies the share URL to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    render(<OutputTab shareUrl={SHARE_URL} report={REPORT} />);
    fireEvent.click(screen.getByRole("button", { name: "コピー" }));

    expect(writeText).toHaveBeenCalledWith(SHARE_URL);
    expect(await screen.findByRole("button", { name: "コピー済み" })).toBeInTheDocument();
  });

  it("shows a failure state when the clipboard write is rejected", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    render(<OutputTab shareUrl={SHARE_URL} report={REPORT} />);
    fireEvent.click(screen.getByRole("button", { name: "コピー" }));

    expect(await screen.findByRole("button", { name: "コピー失敗" })).toBeInTheDocument();
  });

  it("shows a failure state when the clipboard API is unavailable", () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });

    render(<OutputTab shareUrl={SHARE_URL} report={REPORT} />);
    fireEvent.click(screen.getByRole("button", { name: "コピー" }));

    expect(screen.getByRole("button", { name: "コピー失敗" })).toBeInTheDocument();
  });
});
