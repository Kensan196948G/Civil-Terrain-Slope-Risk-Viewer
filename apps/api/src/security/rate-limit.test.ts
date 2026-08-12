import { describe, expect, it } from "vitest";
import { parseRateLimit, SlidingWindowRateLimiter } from "./rate-limit.js";

describe("SlidingWindowRateLimiter", () => {
  it("allows requests up to the configured limit", () => {
    const limiter = new SlidingWindowRateLimiter(3, 60_000);

    expect(limiter.check("ip", 1000)).toEqual({ allowed: true, retryAfterSec: 0 });
    expect(limiter.check("ip", 2000)).toEqual({ allowed: true, retryAfterSec: 0 });
    expect(limiter.check("ip", 3000)).toEqual({ allowed: true, retryAfterSec: 0 });
  });

  it("denies the first request past the limit with a Retry-After estimate", () => {
    const limiter = new SlidingWindowRateLimiter(2, 60_000);

    limiter.check("ip", 0);
    limiter.check("ip", 10_000);
    const decision = limiter.check("ip", 20_000);

    expect(decision.allowed).toBe(false);
    // 最も古いヒット (0ms) + 60s ウィンドウ - 現在 (20s) = 40s。
    expect(decision.retryAfterSec).toBe(40);
  });

  it("frees the window after timestamps expire", () => {
    const limiter = new SlidingWindowRateLimiter(1, 10_000);

    expect(limiter.check("ip", 0).allowed).toBe(true);
    expect(limiter.check("ip", 5000).allowed).toBe(false);
    // ウィンドウ外になったら再許可 (同じ秒に収まらないよう+1ms)。
    expect(limiter.check("ip", 10_001).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const limiter = new SlidingWindowRateLimiter(1, 60_000);

    expect(limiter.check("ip-a", 0).allowed).toBe(true);
    expect(limiter.check("ip-b", 0).allowed).toBe(true);
    expect(limiter.check("ip-a", 1000).allowed).toBe(false);
    expect(limiter.check("ip-b", 1000).allowed).toBe(false);
  });

  it("prunes expired entries so memory does not grow unboundedly", () => {
    const limiter = new SlidingWindowRateLimiter(10, 10_000);

    for (let i = 0; i < 10; i++) {
      limiter.check("ip", i * 1000);
    }
    // ウィンドウ外になったヒットは次の判定で除去される。
    limiter.check("ip", 20_000);
    // 内部状態を直接確認できるよう、同じキーで limit 未満のアクセスが続く。
    for (let i = 0; i < 5; i++) {
      expect(limiter.check("ip", 21_000 + i).allowed).toBe(true);
    }
  });
});

describe("parseRateLimit", () => {
  it("parses a positive integer", () => {
    expect(parseRateLimit("120", 60)).toBe(120);
  });

  it("falls back for undefined, empty, zero, negative and non-integer values", () => {
    expect(parseRateLimit(undefined, 60)).toBe(60);
    expect(parseRateLimit("", 60)).toBe(60);
    expect(parseRateLimit("0", 60)).toBe(60);
    expect(parseRateLimit("-1", 60)).toBe(60);
    expect(parseRateLimit("12.5", 60)).toBe(60);
    expect(parseRateLimit("abc", 60)).toBe(60);
  });
});
