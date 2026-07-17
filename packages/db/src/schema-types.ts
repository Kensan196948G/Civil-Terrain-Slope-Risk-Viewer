import type { QualityGrade, RiskStatus } from "@civil-terrain/domain";

/**
 * Raw row shapes for the tables defined in migrations/0001_init.sql.
 *
 * Property names are snake_case to mirror the physical columns returned by a
 * `SELECT` (the PostgreSQL driver does not camel-case column names). The
 * application layer maps these rows into the camelCase domain types.
 *
 * Representation choices at this boundary:
 * - `timestamptz` columns are typed as ISO-8601 `string`.
 * - `numeric` and `bigint` columns are typed as `string`; the driver returns
 *   them as strings to preserve exact precision.
 * - `jsonb` columns are typed as `JsonValue`; callers validate and narrow them
 *   into domain types.
 * - Nullable columns are `T | null`. The column is always present in a row, so
 *   these are required properties whose value may be null -- not optional
 *   properties (which, under exactOptionalPropertyTypes, would mean the key can
 *   be absent).
 */

/** Any value expressible as JSON, used for jsonb columns. */
export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** analysis_runs.analysis_type domain. */
export type AnalysisType = "POINT" | "BUFFER" | "PROFILE" | "COMPARE";

/**
 * analysis_runs.status domain -- the persisted terminal states. Distinct from
 * the domain AnalysisStatus (which also models in-flight states); the stored
 * value is only ever one of these four outcomes.
 */
export type AnalysisRunStatus = "COMPLETE" | "PARTIAL" | "UNKNOWN" | "FAILED";

export interface DataSourceRow {
  readonly id: string;
  readonly source_key: string;
  readonly name: string;
  readonly provider: string;
  readonly base_url: string;
  readonly terms_url: string;
  readonly attribution: string;
  readonly cache_ttl_sec: number;
  readonly enabled: boolean;
  readonly priority: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface DataSourceVersionRow {
  readonly id: string;
  readonly data_source_id: string;
  readonly detected_version: string | null;
  readonly schema_hash: string;
  readonly terms_checked_at: string | null;
  readonly active_from: string;
  readonly active_to: string | null;
}

export interface ConfigVersionRow {
  readonly id: string;
  readonly slope_bins_deg: JsonValue;
  readonly range_limits: JsonValue;
  readonly rule_json: JsonValue;
  readonly schema_version: string;
  readonly approved_by: string | null;
  readonly applied_at: string | null;
  readonly created_at: string;
}

export interface AnalysisRunRow {
  readonly id: string;
  readonly public_id: string;
  readonly user_id: string | null;
  readonly analysis_type: AnalysisType;
  readonly center_lat: string;
  readonly center_lon: string;
  readonly request_json: JsonValue;
  readonly result_json: JsonValue | null;
  readonly status: AnalysisRunStatus;
  readonly config_version_id: string | null;
  readonly algorithm_version: string;
  readonly expires_at: string | null;
  readonly created_at: string;
}

export interface AnalysisEvidenceRow {
  readonly id: string;
  readonly analysis_run_id: string;
  readonly data_source_version_id: string;
  readonly tile_hash: string;
  readonly retrieved_at: string;
  readonly quality: QualityGrade | null;
  readonly processing_note: string | null;
}

export interface CheckCardRow {
  readonly id: string;
  readonly analysis_run_id: string;
  readonly code: string;
  readonly status: RiskStatus;
  readonly observation: string;
  readonly recommended_checks: JsonValue;
  readonly evidence_ids: JsonValue;
  readonly algorithm_version: string;
  readonly distance_m: string | null;
}

export interface FetchLogRow {
  readonly id: string;
  readonly request_id: string;
  readonly data_source_id: string;
  readonly host: string;
  readonly http_status: number | null;
  readonly latency_ms: number | null;
  readonly cache_status: string | null;
  readonly bytes_transferred: string | null;
  readonly error_code: string | null;
  readonly created_at: string;
}

export interface AuditLogRow {
  readonly id: string;
  readonly actor: string;
  readonly action: string;
  readonly target: string;
  readonly before_json: JsonValue | null;
  readonly after_json: JsonValue | null;
  readonly request_id: string | null;
  readonly created_at: string;
}
