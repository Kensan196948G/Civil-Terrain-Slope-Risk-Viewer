/**
 * Typed client for GET /elevation (openapi getElevation).
 *
 * Every API outcome maps to an explicit variant — "no data" and "upstream
 * failed" are distinct states, never collapsed into a generic error, so the UI
 * can honour Unknown is not Safe (要件 2.1: 欠損をリスクなしと誤認させない).
 */

export interface ElevationProvenanceDto {
  readonly sourceName: string;
  readonly sourceUrl: string;
  readonly termsUrl: string;
  readonly retrievedAt: string;
}

export interface ElevationPointDto {
  readonly coordinate: { readonly lat: number; readonly lon: number };
  readonly elevationM: number;
  readonly source: string;
  readonly quality: { readonly grade: string; readonly coverage: string };
  readonly provenance?: readonly ElevationProvenanceDto[];
}

export type ElevationResult =
  | { readonly kind: "ok"; readonly point: ElevationPointDto }
  | { readonly kind: "no-coverage" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "error"; readonly message: string };

/** Matches .env.example VITE_API_BASE_URL; the vite dev proxy serves /api/v1. */
const API_BASE_URL: string =
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "/api/v1";

export async function fetchElevation(
  coordinate: { readonly lat: number; readonly lon: number },
  fetchImpl: typeof fetch = fetch,
): Promise<ElevationResult> {
  const url = `${API_BASE_URL}/elevation?lat=${coordinate.lat}&lon=${coordinate.lon}`;

  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    return { kind: "error", message: String(error) };
  }

  if (response.status === 404) {
    return { kind: "no-coverage" };
  }
  if (response.status === 503) {
    return { kind: "unavailable" };
  }
  if (!response.ok) {
    return { kind: "error", message: `HTTP ${response.status}` };
  }

  try {
    const body = (await response.json()) as { data: ElevationPointDto };
    if (typeof body.data?.elevationM !== "number") {
      return { kind: "error", message: "unexpected response shape" };
    }
    return { kind: "ok", point: body.data };
  } catch (error) {
    return { kind: "error", message: `invalid JSON (${String(error)})` };
  }
}
