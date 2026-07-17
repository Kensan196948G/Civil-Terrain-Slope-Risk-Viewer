/**
 * Database connection configuration.
 *
 * Sprint 0 scope: this module only assembles and validates the connection
 * string from the environment. It never opens a connection -- apps/api
 * establishes the real connection later via the Cloudflare Hyperdrive binding.
 */
export interface DatabaseConfig {
  readonly connectionString: string;
}

const DATABASE_URL_KEY = "DATABASE_URL";

// PostgreSQL connection URIs use either the postgres:// or postgresql:// scheme.
const POSTGRES_URL_PATTERN = /^postgres(?:ql)?:\/\/.+/i;

/**
 * Returns true when the value looks like a PostgreSQL connection URI. This is a
 * syntactic check only; it does not attempt any network connection.
 */
export function isPostgresConnectionString(value: string): boolean {
  return POSTGRES_URL_PATTERN.test(value);
}

/**
 * Reads and validates the database connection string from the given
 * environment map, throwing an actionable error when it is missing or has an
 * unsupported scheme.
 */
export function loadDatabaseConfig(env: Record<string, string | undefined>): DatabaseConfig {
  const raw = env[DATABASE_URL_KEY]?.trim();

  if (raw === undefined || raw === "") {
    throw new Error(
      `${DATABASE_URL_KEY} is not set. Define it in the environment before ` +
        `connecting to the database (see .env.example). For apps/api it is ` +
        `provided as a Wrangler secret and must never be committed.`,
    );
  }

  if (!isPostgresConnectionString(raw)) {
    throw new Error(
      `${DATABASE_URL_KEY} must be a PostgreSQL connection string starting ` +
        `with "postgres://" or "postgresql://".`,
    );
  }

  return { connectionString: raw };
}
