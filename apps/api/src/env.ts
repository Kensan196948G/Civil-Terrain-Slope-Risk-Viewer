/**
 * Cloudflare Hyperdrive binding. Only the field this Worker reads is declared,
 * which keeps apps/api free of @cloudflare/workers-types (the rest of the
 * monorepo is likewise dependency-light).
 */
export interface Hyperdrive {
  readonly connectionString: string;
}

/**
 * Bindings and secrets available to the Worker at runtime. All are optional so
 * that local runs and tests can supply just the subset they exercise.
 */
export interface Env {
  readonly DATABASE_URL?: string;
  readonly HYPERDRIVE?: Hyperdrive;
  readonly CF_ACCESS_TEAM_DOMAIN?: string;
  readonly CF_ACCESS_AUD?: string;
  /** Analyst 以上に与える Cloudflare Access Group ID (カンマ区切り)。 */
  readonly CF_ACCESS_ANALYST_GROUPS?: string;
  /** DataAdmin 以上に与える Cloudflare Access Group ID (カンマ区切り)。 */
  readonly CF_ACCESS_DATA_ADMIN_GROUPS?: string;
  /** SystemAdmin に与える Cloudflare Access Group ID (カンマ区切り)。 */
  readonly CF_ACCESS_ADMIN_GROUPS?: string;
  /** 分あたりのAPIリクエスト上限 (クライアントIP単位)。未設定時は 120。 */
  readonly RATE_LIMIT_PER_MINUTE?: string;
}

/**
 * Subset of the Cloudflare module-Worker ExecutionContext used here. Declared
 * locally to avoid a dependency on @cloudflare/workers-types.
 */
export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
