import { config as loadDotEnv } from "dotenv";
import { fileURLToPath } from "node:url";

const explicitlyProvidedTestUrl = process.env.TEST_DATABASE_URL;
const explicitlyEnabledPostgresTests = process.env.VEDAA_RUN_POSTGRES_INTEGRATION === "1";

loadDotEnv({
  path: fileURLToPath(new URL("../../../../.env", import.meta.url)),
  override: false,
  quiet: true,
});

function databaseIdentity(connectionUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(connectionUrl);
  } catch {
    throw new Error("Database test URLs must be valid PostgreSQL URLs.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("Database test URLs must use PostgreSQL.");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/-pooler(?=\.|$)/g, "");
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!hostname || !databaseName) {
    throw new Error("Database test URLs must include a host and database name.");
  }
  return `${hostname}/${databaseName}`;
}

export function assertIsolatedDatabaseTarget(
  testUrl: string,
  referenceUrls: Record<string, string | undefined>,
): void {
  const testIdentity = databaseIdentity(testUrl);
  for (const [name, referenceUrl] of Object.entries(referenceUrls)) {
    if (referenceUrl && databaseIdentity(referenceUrl) === testIdentity) {
      throw new Error(`TEST_DATABASE_URL resolves to the same PostgreSQL database as ${name}.`);
    }
  }
}

export function isPostgresIntegrationOptedIn(
  explicitOptIn: string | undefined,
  testUrl: string | undefined,
): boolean {
  return explicitOptIn === "1" && Boolean(testUrl);
}

export function initializeTestDatabase(): boolean {
  const testUrl = explicitlyProvidedTestUrl;
  if (!testUrl || !explicitlyEnabledPostgresTests) return false;

  const referenceUrls = Object.fromEntries(
    Object.entries(process.env).filter(([name, value]) =>
      name !== "TEST_DATABASE_URL" &&
      value &&
      /(?:DATABASE_URL|POSTGRES_URL|DB_URL)$/i.test(name),
    ),
  );
  assertIsolatedDatabaseTarget(testUrl, referenceUrls);
  process.env.DATABASE_URL = testUrl;
  return true;
}
