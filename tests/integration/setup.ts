import "dotenv/config";

/**
 * Integration-test environment (runs in every worker before test modules load).
 * Points the app's runtime DATABASE_URL at the isolated TEST_DATABASE_URL so
 * `@/lib/db/prisma` and `@/lib/env` connect to the test database — never the
 * dev or production one.
 */
if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required to run integration tests");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
