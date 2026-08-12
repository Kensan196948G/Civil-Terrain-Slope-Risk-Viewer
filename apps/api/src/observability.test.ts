import { describe, expect, it, vi } from "vitest";
import { emitAudit, emitError } from "./observability.js";

describe("emitAudit", () => {
  it("emits a single-line JSON event without PII fields", () => {
    const sink = vi.fn();

    emitAudit(sink, {
      event: "access",
      requestId: "req-1",
      method: "GET",
      path: "/api/v1/elevation",
      outcome: "allowed",
      status: 200,
      user: "user:abc",
      role: "viewer",
    });

    const line = sink.mock.calls[0]![0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.event).toBe("access");
    expect(parsed.path).toBe("/api/v1/elevation");
    expect(parsed.user).toBe("user:abc");
    expect(line).not.toContain("email");
    expect(line).not.toContain("lat");
    expect(line).not.toContain("lon");
  });

  it("serializes only the fields the caller provides (no implicit coordinates)", () => {
    const sink = vi.fn();

    emitAudit(sink, {
      event: "access",
      requestId: "req-2",
      method: "GET",
      path: "/api/v1/elevation",
      outcome: "allowed",
      status: 200,
    });

    expect(sink.mock.calls[0]![0]).toContain("path");
    // 座標はイベントに含まれない (呼び出し側が path のみを渡す設計)。
    const parsed = JSON.parse(sink.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(parsed.path).toBe("/api/v1/elevation");
    expect("coordinate" in parsed).toBe(false);
  });
});

describe("emitError", () => {
  it("emits a structured error event", () => {
    const sink = vi.fn();

    emitError(sink, {
      event: "error",
      requestId: "req-3",
      method: "GET",
      path: "/api/v1/elevation",
      outcome: "error",
      errorKind: "INTERNAL_ERROR",
    });

    expect(JSON.parse(sink.mock.calls[0]![0] as string).errorKind).toBe("INTERNAL_ERROR");
  });
});
