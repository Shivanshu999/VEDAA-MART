import { describe, expect, it } from "vitest";
import { assertIsolatedDatabaseTarget, isPostgresIntegrationOptedIn } from "./test-database.js";

describe("isolated PostgreSQL test database guard", () => {
  it("requires an explicit command-level opt-in separate from .env", () => {
    expect(isPostgresIntegrationOptedIn(undefined, "postgresql://localhost/test")).toBe(false);
    expect(isPostgresIntegrationOptedIn("1", undefined)).toBe(false);
    expect(isPostgresIntegrationOptedIn("1", "postgresql://localhost/test")).toBe(true);
  });

  it("rejects the same database even when one URL uses the Neon pooler hostname", () => {
    expect(() => assertIsolatedDatabaseTarget(
      "postgresql://test:secret@ep-example-pooler.c-2.us-east-1.aws.neon.tech/vedaa?sslmode=require",
      { DATABASE_URL: "postgresql://dev:secret@ep-example.c-2.us-east-1.aws.neon.tech/vedaa?sslmode=require" },
    )).toThrow("TEST_DATABASE_URL resolves to the same PostgreSQL database as DATABASE_URL.");
  });

  it("allows a different database target", () => {
    expect(() => assertIsolatedDatabaseTarget(
      "postgresql://test:secret@localhost:5432/vedaa_test?schema=public",
      { DATABASE_URL: "postgresql://dev:secret@ep-development-pooler.c-2.us-east-1.aws.neon.tech/vedaa?sslmode=require" },
    )).not.toThrow();
  });
});
