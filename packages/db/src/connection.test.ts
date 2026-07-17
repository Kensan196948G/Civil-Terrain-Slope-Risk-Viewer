import { describe, expect, it } from "vitest";
import { isPostgresConnectionString, loadDatabaseConfig } from "./connection.js";

describe("loadDatabaseConfig", () => {
  it("returns the connection string for a valid postgres:// URL", () => {
    const config = loadDatabaseConfig({
      DATABASE_URL: "postgres://user:pass@host:5432/civil_terrain",
    });
    expect(config.connectionString).toBe("postgres://user:pass@host:5432/civil_terrain");
  });

  it("accepts the postgresql:// scheme", () => {
    const config = loadDatabaseConfig({
      DATABASE_URL: "postgresql://user:pass@host/db",
    });
    expect(config.connectionString).toBe("postgresql://user:pass@host/db");
  });

  it("trims surrounding whitespace", () => {
    const config = loadDatabaseConfig({ DATABASE_URL: "  postgres://host/db  " });
    expect(config.connectionString).toBe("postgres://host/db");
  });

  it("throws when DATABASE_URL is unset", () => {
    expect(() => loadDatabaseConfig({})).toThrow(/DATABASE_URL is not set/);
  });

  it("throws when DATABASE_URL is blank", () => {
    expect(() => loadDatabaseConfig({ DATABASE_URL: "   " })).toThrow(/DATABASE_URL is not set/);
  });

  it("throws when DATABASE_URL has an unsupported scheme", () => {
    expect(() => loadDatabaseConfig({ DATABASE_URL: "mysql://host/db" })).toThrow(
      /must be a PostgreSQL connection string/,
    );
  });
});

describe("isPostgresConnectionString", () => {
  it("accepts postgres:// and postgresql:// URIs", () => {
    expect(isPostgresConnectionString("postgres://host/db")).toBe(true);
    expect(isPostgresConnectionString("postgresql://host/db")).toBe(true);
  });

  it("rejects other schemes, empty values, and a bare scheme", () => {
    expect(isPostgresConnectionString("http://host/db")).toBe(false);
    expect(isPostgresConnectionString("")).toBe(false);
    expect(isPostgresConnectionString("postgres://")).toBe(false);
  });
});
