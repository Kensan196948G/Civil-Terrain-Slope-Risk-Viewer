import { afterEach, describe, expect, it, vi } from "vitest";
import { dateStamp, downloadTextFile } from "./download";

describe("dateStamp", () => {
  it("formats the date as YYYY-MM-DD with zero padding", () => {
    expect(dateStamp(new Date(2026, 7, 12))).toBe("2026-08-12");
    expect(dateStamp(new Date(2026, 0, 3))).toBe("2026-01-03");
  });
});

describe("downloadTextFile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a blob URL, clicks the anchor and revokes the URL", () => {
    const createObjectURL = vi.fn(() => "blob:test");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.fn();
    const remove = vi.fn();
    const anchor = { href: "", download: "", click, remove };
    vi.spyOn(document, "createElement").mockReturnValue(anchor as unknown as HTMLAnchorElement);
    vi.spyOn(document.body, "appendChild").mockImplementation(
      () => anchor as unknown as HTMLElement,
    );

    downloadTextFile("report.md", "# テスト", "text/markdown; charset=utf-8");

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(anchor.href).toBe("blob:test");
    expect(anchor.download).toBe("report.md");
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });
});
