import { loadDatabaseConfig } from "@civil-terrain/db";
import type { Env } from "../env.js";
import type { RequestContext } from "../router.js";
import { jsonResponse, problemResponse } from "../http.js";

/**
 * Liveness: reports only that the process can respond. It never checks
 * dependencies, so it always returns 200 (openapi HealthLiveResponse).
 */
export function handleHealthLive(context: RequestContext): Response {
  return jsonResponse({ status: "ok" }, 200, context.requestId);
}

/**
 * Readiness: reports whether dependencies are ready to serve traffic. Sprint 0
 * performs a config-only database check (no network connection). When a
 * dependency is not ready it returns 503 (openapi UpstreamUnavailable) rather
 * than rounding up to a healthy status.
 */
export function handleHealthReady(context: RequestContext): Response {
  const checks = { database: isDatabaseConfigured(context.env) };

  if (!checks.database) {
    return problemResponse("UPSTREAM_UNAVAILABLE", "依存先の準備が完了していません。", {
      detail: "データベース接続設定が読み込めません。",
      instance: context.url.pathname,
      requestId: context.requestId,
    });
  }

  return jsonResponse({ status: "ok", checks }, 200, context.requestId);
}

/**
 * True when a valid PostgreSQL connection string is configured. Hyperdrive is
 * preferred over a raw DATABASE_URL (see db-builder handoff). This validates the
 * string syntactically via the shared loader; it never opens a connection.
 */
function isDatabaseConfigured(env: Env): boolean {
  const connectionString = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;
  if (connectionString === undefined) {
    return false;
  }
  try {
    loadDatabaseConfig({ DATABASE_URL: connectionString });
    return true;
  } catch {
    return false;
  }
}
