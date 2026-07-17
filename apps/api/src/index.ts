import type { Env, ExecutionContext } from "./env.js";
import { problemResponse } from "./http.js";
import { route } from "./router.js";

/**
 * Worker entry point. A single top-level try/catch guarantees that every
 * failure path returns a Problem Details response instead of leaking a raw
 * error, and stamps a request id for tracing.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const requestId = crypto.randomUUID();
    try {
      const url = new URL(request.url);
      return await route({ request, env, ctx, url, requestId });
    } catch (error) {
      console.error("Unhandled error while handling request", { requestId, error });
      // Detail is withheld: internal errors must not expose internals (openapi InternalError).
      return problemResponse("INTERNAL_ERROR", "内部エラーが発生しました。", { requestId });
    }
  },
};
