import type { Env, ExecutionContext } from "./env.js";
import { problemResponse } from "./http.js";
import { handleHealthLive, handleHealthReady } from "./routes/health.js";

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

/**
 * Route table. Paths are relative to API_BASE_PATH. Sprint 0 ships the health
 * endpoints only; further endpoints are added by appending rows here.
 */
const ROUTES: readonly Route[] = [
  { method: "GET", path: "/health/live", handler: handleHealthLive },
  { method: "GET", path: "/health/ready", handler: handleHealthReady },
];

/**
 * Dispatches a request to its matching route. Unmatched routes (unknown path or
 * unsupported method) return INVALID_INPUT (400): the domain error taxonomy has
 * no routing-level code, and reusing NO_COVERAGE (404) would pollute its
 * geographic "data absent, not safe" meaning used by monitoring.
 */
export function route(context: RequestContext): Response | Promise<Response> {
  const { request, url, requestId } = context;

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
