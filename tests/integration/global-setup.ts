import { execFileSync } from "node:child_process";
import { Client } from "pg";
import "dotenv/config";

/**
 * Global setup (vitest.integration.config.ts): ensures the isolated test
 * database exists and applies the current migrations to it BEFORE any test
 * worker starts. Mirrors what CI does (`migrate deploy` against a dedicated
 * test database) — it never touches dev/production data.
 */
export default async function globalSetup(): Promise<void> {
  const testDbUrl = process.env.TEST_DATABASE_URL;
  if (!testDbUrl) throw new Error("TEST_DATABASE_URL is required to run integration tests");

  await ensureTestDatabase(testDbUrl);

  // Apply migrations to the test database. dotenv won't override an env var
  // we set first, so MIGRATION_DATABASE_URL points at the test DB here.
  process.env.MIGRATION_DATABASE_URL = testDbUrl;
  execFileSync("pnpm", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: process.env,
  });
}

async function ensureTestDatabase(url: string): Promise<void> {
  const parsed = new URL(url);
  const dbName = parsed.pathname.replace(/^\//, "");
  if (!dbName) throw new Error(`Could not parse database name from TEST_DATABASE_URL: ${url}`);

  // Connect to the maintenance database and create the test DB if missing.
  const maintenanceUrl = new URL(url);
  maintenanceUrl.pathname = "/postgres";
  const client = new Client({ connectionString: maintenanceUrl.toString() });
  await client.connect();
  try {
    const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (result.rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`[integration] created test database "${dbName}"`);
    }
  } finally {
    await client.end();
  }
}
