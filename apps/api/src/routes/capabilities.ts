import type { RequestContext } from "../router.js";
import { jsonResponse } from "../http.js";

/**
 * GET /capabilities (openapi getCapabilities)。
 * 現在実装済みの機能を正直に列挙する。計画上の機能や未実装のDB機能は含めない。
 */
export function handleCapabilities(context: RequestContext): Response {
  return jsonResponse(
    {
      data: {
        postgis: false,
        layers: ["std", "pale", "photo", "slope", "hillshade"],
        exportFormats: ["markdown", "csv", "json"],
      },
      meta: {
        requestId: context.requestId,
        generatedAt: new Date().toISOString(),
      },
    },
    200,
    context.requestId,
  );
}
