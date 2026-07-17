import type { Provenance } from "@civil-terrain/domain";

/**
 * A raw, unnormalized payload fetched from an external data source.
 * Keeps the untouched bytes plus enough metadata to build provenance later.
 */
export interface RawArtifact {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly sourceUrl: string;
  /** ISO 8601 timestamp of when the artifact was fetched. */
  readonly fetchedAt: string;
  readonly httpStatus: number;
}

/** Per-request context passed into a fetch call. */
export interface FetchContext {
  readonly requestId: string;
  readonly signal?: AbortSignal;
}

/** Per-request context passed into a normalize call. */
export interface NormalizeContext {
  readonly requestId: string;
}

/**
 * Contract for accessing one external data source (e.g. GSI DEM tiles).
 *
 * The pipeline is intentionally split into discrete steps so each stage can be
 * tested and cached independently:
 *   validateRequest -> buildRequests -> fetch -> normalize (+ provenance).
 *
 * Sprint 0 defines the interface only; concrete adapter classes and the actual
 * network I/O are implemented in a later sprint.
 */
export interface DataAdapter<TRequest, TNormalized> {
  readonly sourceKey: string;
  validateRequest(input: unknown): TRequest;
  buildRequests(input: TRequest): URL[];
  fetch(input: TRequest, ctx: FetchContext): Promise<RawArtifact[]>;
  normalize(raw: RawArtifact[], ctx: NormalizeContext): Promise<TNormalized>;
  provenance(raw: RawArtifact[]): Provenance[];
}
