import { GSI_DEM_SOURCES, GSI_TERMS_URL, GSI_TILE_BASE_URL } from "@civil-terrain/adapters";
import type { DemSource } from "@civil-terrain/domain";
import type { RequestContext } from "../router.js";
import { jsonResponse } from "../http.js";

/**
 * GET /sources (openapi listSources)。
 * 現在有効なDEMソースの一覧と帰属・利用条件を返す。
 * GSI タイルの利用条件は出典明記が必須 (地理院タイル利用規約)。
 */
export function handleSources(context: RequestContext): Response {
  const data = (Object.keys(GSI_DEM_SOURCES) as DemSource[]).map((sourceKey) => {
    const spec = GSI_DEM_SOURCES[sourceKey];
    return {
      sourceKey,
      sourceName: spec.name,
      sourceUrl: `${GSI_TILE_BASE_URL}${spec.path}/`,
      termsUrl: GSI_TERMS_URL,
      resolutionM: spec.resolutionM,
      // GSI タイルは 1 時間単位のキャッシュを許容 (過剰な再取得を避ける)。
      cacheTtlSec: 3600,
    };
  });

  return jsonResponse(
    {
      data,
      meta: {
        requestId: context.requestId,
        generatedAt: new Date().toISOString(),
      },
    },
    200,
    context.requestId,
  );
}
