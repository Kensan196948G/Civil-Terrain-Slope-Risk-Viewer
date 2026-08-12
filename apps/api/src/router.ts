import type { Env, ExecutionContext } from "./env.js";
import { problemResponse } from "./http.js";
import { handleElevation } from "./routes/elevation.js";
import { handleCapabilities } from "./routes/capabilities.js";
import { handleSources } from "./routes/sources.js";
import { handleHealthLive, handleHealthReady } from "./routes/health.js";
import { extractBearerToken } from "./security/access-auth.js";
import type { AccessAuthResult } from "./security/access-auth.js";
import { parseRateLimit, SlidingWindowRateLimiter } from "./security/rate-limit.js";
import type { RateLimitDecision } from "./security/rate-limit.js";

/** Base path for all v1 endpoints (matches the openapi `servers` url). */
export const API_BASE_PATH = "/api/v1";

/** Per-request data threaded through every route handler. */
export interface RequestContext {
  readonly request: Request;
  readonly env: Env;
  readonly ctx: ExecutionContext;
  readonly url: URL;
  readonly requestId: string;
}

export type RouteHandler = (context: RequestContext) => Response | Promise<Response>;

interface Route {
  readonly method: string;
  readonly path: string;
  readonly handler: RouteHandler;
}

/** ルート処理に注入できる依存 (テストは実物を差し替えられる)。 */
export interface RouterDeps {
  readonly rateLimit?: (key: string) => RateLimitDecision;
  readonly accessVerify?: (token: string | null) => Promise<AccessAuthResult>;
}

/** openapi 上 security: [] の公開ルート。認証が有効でもアクセスを許す。 */
const PUBLIC_PATHS = new Set(["/health/live", "/capabilities", "/sources"]);

export const DEFAULT_RATE_LIMIT_PER_MINUTE = 120;

/**
 * Route table. Paths are relative to API_BASE_PATH; further endpoints are
 * added by appending rows here.
 */
const ROUTES: readonly Route[] = [
  { method: "GET", path: "/health/live", handler: handleHealthLive },
  { method: "GET", path: "/health/ready", handler: handleHealthReady },
  { method: "GET", path: "/elevation", handler: handleElevation },
  { method: "GET", path: "/capabilities", handler: handleCapabilities },
  { method: "GET", path: "/sources", handler: handleSources },
];

/**
 * Dispatches a request to its matching route. Unmatched routes (unknown path or
 * unsupported method) return INVALID_INPUT (400): the domain error taxonomy has
 * no routing-level code, and reusing NO_COVERAGE (404) would pollute its
 * geographic "data absent, not safe" meaning used by monitoring.
 */
export async function route(context: RequestContext, deps: RouterDeps = {}): Promise<Response> {
  const { request, url, requestId } = context;

  // 1) Rate limit (defense in depth)。エッジルールの補助として全APIへ適用する。
  const rateLimit = deps.rateLimit;
  if (rateLimit !== undefined) {
    const clientKey = request.headers.get("cf-connecting-ip") ?? "unknown";
    const decision = rateLimit(clientKey);
    if (!decision.allowed) {
      const response = problemResponse(
        "RATE_LIMITED",
        "リクエストが多すぎます。時間をおいて再試行してください。",
        {
          detail: `1分あたりの上限を超えました。${decision.retryAfterSec}秒後に再試行してください。`,
          instance: url.pathname,
          requestId,
        },
      );
      const headers = new Headers(response.headers);
      headers.set("retry-after", String(decision.retryAfterSec));
      return new Response(response.body, { status: response.status, headers });
    }
  }

  // 2) Cloudflare Access JWT の Worker 側検証 (設定時のみ有効)。
  //    公開ルート (openapi security: []) と未設定時は従来どおり通過する。
  const accessVerify = deps.accessVerify;
  const routePath = url.pathname.startsWith(API_BASE_PATH)
    ? url.pathname.slice(API_BASE_PATH.length)
    : url.pathname;
  if (accessVerify !== undefined && !PUBLIC_PATHS.has(routePath)) {
    const result = await accessVerify(extractBearerToken(request));
    if (!result.ok) {
      return problemResponse(
        result.reason,
        result.reason === "UNAUTHENTICATED" ? "認証が必要です。" : "アクセスが許可されていません。",
        {
          detail: result.detail,
          instance: url.pathname,
          requestId,
        },
      );
    }
  }

  for (const entry of ROUTES) {
    if (request.method === entry.method && url.pathname === API_BASE_PATH + entry.path) {
      return entry.handler(context);
    }
  }

  return problemResponse("INVALID_INPUT", "リクエスト先のエンドポイントが存在しません。", {
    detail: `${request.method} ${url.pathname} は定義されていません。`,
    instance: url.pathname,
    requestId,
  });
}

// env 設定ごとに1つのウィンドウをリクエスト間で共有する (Worker は同一 isolate
// 内で fetch を繰り返し処理するため、モジュールスコープで十分)。
let defaultRateLimiter: { config: string; limiter: SlidingWindowRateLimiter } | null = null;

/**
 * env の設定からルーター依存を組み立てる。rate limit のウィンドウ状態は
 * 設定値が同じ間はモジュールスコープで共有する。
 */
export function buildRouterDeps(env: Env): RouterDeps {
  const limit = parseRateLimit(env.RATE_LIMIT_PER_MINUTE, DEFAULT_RATE_LIMIT_PER_MINUTE);
  const config = String(limit);
  const cached = defaultRateLimiter;
  const limiter =
    cached !== null && cached.config === config
      ? cached.limiter
      : new SlidingWindowRateLimiter(limit, 60_000);
  defaultRateLimiter = { config, limiter };
  return { rateLimit: (key) => limiter.check(key) };
}
