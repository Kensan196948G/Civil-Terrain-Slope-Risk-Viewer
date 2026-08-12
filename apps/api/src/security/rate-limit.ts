/**
 * Sliding-window rate limiter (defense in depth; 詳細設計仕様書 12章 DoS/コスト増
 * 対策, openapi ErrorCode RATE_LIMITED → HTTP 429)。
 *
 * Cloudflare Workers は isolate ごとのメモリしか持たないため、この実装は
 * エッジ全体で厳密なグローバル集計をするものではない。エッジの Access/Rate
 * Limiting ルールと併用する第一段防御であり、「設定値以上の集中アクセスを
 * 緩和する」ことを保証する。
 */

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** 429 応答の Retry-After 値 (秒)。allowed 時は 0。 */
  readonly retryAfterSec: number;
}

/** 単一イミュータブル設定のスライディングウィンドウ実装。 */
export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    /** ウィンドウ内の最大リクエスト数。1 以上であること。 */
    private readonly limit: number,
    /** ウィンドウ長 (ミリ秒)。 */
    private readonly windowMs: number,
  ) {}

  /**
   * @param key クライアント単位の識別子 (例: CF-Connecting-IP)。
   * @param now 注入可能な現在時刻 (ミリ秒)。テスト用。
   */
  check(key: string, now: number = Date.now()): RateLimitDecision {
    const cutoff = now - this.windowMs;
    const timestamps = this.hits.get(key) ?? [];
    // 古いタイムスタンプを除去してから判定する (メモリの無制限成長を防ぐ)。
    const active = timestamps.filter((timestamp) => timestamp > cutoff);

    if (active.length >= this.limit) {
      this.hits.set(key, active);
      const oldest = active[0] ?? now;
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000)),
      };
    }

    active.push(now);
    this.hits.set(key, active);
    return { allowed: true, retryAfterSec: 0 };
  }

  /** テストや設定変更時にウィンドウを初期化する。 */
  reset(): void {
    this.hits.clear();
  }
}

/** env の "120" のような文字列値を安全に解釈する。無効なら既定値。 */
export function parseRateLimit(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}
