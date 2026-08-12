import type { Env, ExecutionContext } from "./env.js";
import { applySecurityHeaders, problemResponse } from "./http.js";
import { buildRouterDeps, route } from "./router.js";
import { createAccessJwtVerifier } from "./security/access-auth.js";
import type { AccessJwtVerifier } from "./security/access-auth.js";

/**
 * Worker entry point. A single top-level try/catch guarantees that every
 * failure path returns a Problem Details response instead of leaking a raw
 * error, and stamps a request id for tracing.
 *
 * Security headers (CSP, nosniff, frame-ancestors, etc.) are applied to every
 * response — API routes and static assets alike.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const requestId = crypto.randomUUID();
    try {
      const url = new URL(request.url);
      const deps = buildRouterDeps(env);
      const accessVerifier = buildAccessVerifier(env);
      const response = await route(
        { request, env, ctx, url, requestId },
        accessVerifier === null
          ? deps
          : { ...deps, accessVerify: (token) => accessVerifier.verify(token) },
      );
      return applySecurityHeaders(response);
    } catch (error) {
      console.error("Unhandled error while handling request", {
        requestId,
        error,
      });
      // Detail is withheld: internal errors must not expose internals (openapi InternalError).
      const response = problemResponse("INTERNAL_ERROR", "内部エラーが発生しました。", {
        requestId,
      });
      return applySecurityHeaders(response);
    }
  },
};

/**
 * CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD の両方が設定されている場合のみ JWT
 * 検証器を返す。片方欠けは設定ミスの可能性が高いが、ロックアウトを避けるため
 * 未設定扱いとし、ログで検出できるようにする。
 */
function buildAccessVerifier(env: Env): AccessJwtVerifier | null {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
  const audience = env.CF_ACCESS_AUD;
  if (teamDomain === undefined || audience === undefined) {
    if (teamDomain !== undefined || audience !== undefined) {
      console.error(
        "CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD は両方設定してください。JWT検証を無効化します。",
      );
    }
    return null;
  }
  return createAccessJwtVerifier({ teamDomain, audience });
}
