-- Civil Terrain & Slope Risk Viewer -- initial schema (Sprint 0, 0001_init).
--
-- Target: Neon PostgreSQL, accessed from apps/api via the Cloudflare
-- Hyperdrive binding. This file is authored for review only in Sprint 0;
-- it is not applied to any database yet (DATABASE_URL is unset).
--
-- Conventions:
--   * Primary keys are uuid, defaulted with gen_random_uuid() (built into
--     PostgreSQL 13+, which Neon provides -- no pgcrypto extension required).
--   * All timestamps are timestamptz and are expected to hold UTC values.
--   * Monetary/measurement precision uses numeric so no floating point drift
--     occurs.
--
-- PostGIS is optional. Probe availability before applying and record the
-- result in the deployment log; the system must keep running even when the
-- extension is unavailable.
--   SELECT name, default_version, installed_version
--     FROM pg_available_extensions WHERE name = 'postgis';
-- When available, enable it (idempotent):
--   CREATE EXTENSION IF NOT EXISTS postgis;

-- External data sources (DEM tiles, hazard layers, ...), keyed by a stable
-- source_key such as 'gsi_dem5a_png'.
CREATE TABLE data_sources (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key    varchar(80)  NOT NULL UNIQUE,
  name          varchar(200) NOT NULL,
  provider      varchar(200) NOT NULL,
  base_url      text         NOT NULL,
  terms_url     text         NOT NULL,
  attribution   text         NOT NULL,
  cache_ttl_sec integer      NOT NULL DEFAULT 0 CHECK (cache_ttl_sec >= 0),
  enabled       boolean      NOT NULL DEFAULT false,
  priority      smallint     NOT NULL DEFAULT 0,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);

-- Point-in-time snapshots of a data source (detected upstream version, terms
-- state, schema fingerprint). Evidence rows reference a specific version so a
-- run stays reproducible even after the upstream source changes.
CREATE TABLE data_source_versions (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id   uuid         NOT NULL REFERENCES data_sources (id) ON DELETE CASCADE,
  detected_version varchar(120),
  schema_hash      char(64)     NOT NULL,
  terms_checked_at timestamptz,
  active_from      timestamptz  NOT NULL DEFAULT now(),
  active_to        timestamptz
);

-- Versioned analysis configuration (slope bins, range limits, card rules).
-- analysis_runs pin the config version they were computed with.
CREATE TABLE config_versions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slope_bins_deg jsonb       NOT NULL,
  range_limits   jsonb       NOT NULL,
  rule_json      jsonb       NOT NULL,
  schema_version varchar(20) NOT NULL,
  approved_by    varchar(200),
  applied_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- One analysis request/result. public_id is an unguessable ULID exposed to
-- clients; the internal uuid id is never exposed. center_lat/center_lon use
-- numeric(9,6) (approx. 0.1 m resolution) to avoid float drift.
CREATE TABLE analysis_runs (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id         varchar(26)  NOT NULL UNIQUE,
  user_id           uuid,
  analysis_type     varchar(30)  NOT NULL
                      CHECK (analysis_type IN ('POINT', 'BUFFER', 'PROFILE', 'COMPARE')),
  center_lat        numeric(9, 6) NOT NULL,
  center_lon        numeric(9, 6) NOT NULL,
  request_json      jsonb        NOT NULL,
  result_json       jsonb,
  status            varchar(20)  NOT NULL
                      CHECK (status IN ('COMPLETE', 'PARTIAL', 'UNKNOWN', 'FAILED')),
  config_version_id uuid         REFERENCES config_versions (id),
  algorithm_version varchar(40)  NOT NULL,
  expires_at        timestamptz,
  created_at        timestamptz  NOT NULL DEFAULT now()
);

-- Provenance for each tile/sample that fed a run (Evidence First). Ties a run
-- to the exact data_source_version and tile it consumed.
CREATE TABLE analysis_evidence (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_run_id        uuid        NOT NULL REFERENCES analysis_runs (id) ON DELETE CASCADE,
  data_source_version_id uuid        NOT NULL REFERENCES data_source_versions (id),
  tile_hash              char(64)    NOT NULL,
  retrieved_at           timestamptz NOT NULL,
  quality                varchar(20) CHECK (quality IN ('A', 'B', 'C', 'D', 'UNKNOWN')),
  processing_note        text
);

-- Individual "check required" cards produced by a run. There is deliberately
-- no aggregate risk score; each card stands alone with its own evidence refs.
CREATE TABLE check_cards (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_run_id    uuid        NOT NULL REFERENCES analysis_runs (id) ON DELETE CASCADE,
  code               varchar(80) NOT NULL,
  status             varchar(20) NOT NULL
                       CHECK (status IN ('REFERENCE', 'CHECK_REQUIRED', 'UNKNOWN')),
  observation        text        NOT NULL,
  recommended_checks jsonb       NOT NULL DEFAULT '[]'::jsonb,
  evidence_ids       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  algorithm_version  varchar(40) NOT NULL,
  distance_m         numeric
);

-- Operational log of outbound fetches to upstream data sources.
CREATE TABLE fetch_logs (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id        varchar(64)  NOT NULL,
  data_source_id    uuid         NOT NULL REFERENCES data_sources (id),
  host              varchar(255) NOT NULL,
  http_status       integer,
  latency_ms        integer,
  cache_status      varchar(20),
  bytes_transferred bigint,
  error_code        varchar(40),
  created_at        timestamptz  NOT NULL DEFAULT now()
);

-- Change trail for administrative actions (config approvals, source edits).
CREATE TABLE audit_logs (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  actor       varchar(200) NOT NULL,
  action      varchar(100) NOT NULL,
  target      varchar(200) NOT NULL,
  before_json jsonb,
  after_json  jsonb,
  request_id  varchar(64),
  created_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_analysis_runs_created_at ON analysis_runs (created_at DESC);
CREATE INDEX idx_analysis_runs_expires_at ON analysis_runs (expires_at);
CREATE INDEX idx_fetch_logs_source_time ON fetch_logs (data_source_id, created_at DESC);
CREATE INDEX idx_fetch_logs_error_time ON fetch_logs (error_code, created_at DESC)
  WHERE error_code IS NOT NULL;
