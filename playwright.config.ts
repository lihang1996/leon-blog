import { defineConfig, devices } from "@playwright/test";
import ConnectionParameters from "pg/lib/connection-parameters.js";

const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = configuredBaseUrl ?? "http://127.0.0.1:3000";

function assertLoopbackBaseUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PLAYWRIGHT_BASE_URL must be a valid absolute URL");
  }

  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  if (!loopbackHosts.has(url.hostname) || !["http:", "https:"].includes(url.protocol)) {
    throw new Error(
      `PLAYWRIGHT_BASE_URL must use an HTTP(S) loopback host; refusing ${url.origin}`,
    );
  }
}

assertLoopbackBaseUrl(baseURL);

const focusProjectSpecs = [
  /(?:^|\/)focus-style-contract\.spec\.ts$/,
  /(?:^|\/)focus-keyboard-a11y\.spec\.ts$/,
  /(?:^|\/)focus-route-matrix\.spec\.ts$/,
  /(?:^|\/)focus-forced-colors\.spec\.ts$/,
];
const cliArgs = process.argv.slice(2);
const isCollectionOnly =
  cliArgs.filter((arg) => arg !== "test").length === 2 &&
  cliArgs.some((arg) => arg.startsWith("--config=")) &&
  cliArgs.at(-1) === "--list" &&
  process.env.PWTEST_WATCH === undefined;
const isExplicitReadOnlyRun = process.env.AGENT_OS_E2E_READ_ONLY_CAPABILITY === "v1";

for (const forbiddenEnv of [
  "PWTEST_WATCH",
  "PWPAUSE",
  "PWDEBUG",
  "PW_TEST_REPORTER",
  "PW_TEST_SOURCE_TRANSFORM",
  "PW_TEST_SOURCE_TRANSFORM_SCOPE",
  "PGHOST",
  "PGHOSTADDR",
  "PGPORT",
  "PGUSER",
  "PGDATABASE",
  "PGOPTIONS",
  "PGSERVICE",
  "PGSERVICEFILE",
]) {
  if (process.env[forbiddenEnv] !== undefined) {
    throw new Error(`Full E2E refuses environment override ${forbiddenEnv}`);
  }
}

type DatabaseIdentity = {
  protocol: "postgresql:";
  hostname: string;
  port: string;
  username: string;
  database: string;
  schema: string;
};

function databaseIdentity(value: string | undefined, envName: string): DatabaseIdentity {
  if (!value) throw new Error(`Full E2E requires ${envName}`);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Full E2E requires ${envName} to be a valid PostgreSQL URL`);
  }

  const connectionIdentityQueryKeys = new Set([
    "host",
    "port",
    "user",
    "username",
    "password",
    "database",
    "db",
  ]);
  const identityOverride = [...url.searchParams.keys()].find((key) =>
    connectionIdentityQueryKeys.has(key.toLowerCase()),
  );
  if (identityOverride) {
    throw new Error(
      `Full E2E refuses ${envName} identity override query parameter: ${identityOverride}`,
    );
  }

  const protocol = url.protocol === "postgres:" ? "postgresql:" : url.protocol;
  const schema = url.searchParams.get("schema")?.trim() || "public";
  let effective: ConnectionParameters;
  try {
    // This is the exact parser used by the runtime `new Pool({ connectionString })`.
    effective = new ConnectionParameters({ connectionString: value });
  } catch {
    throw new Error(`Full E2E requires ${envName} to be parseable by the PostgreSQL runtime`);
  }
  const rawHost = effective.host;
  const database = effective.database;
  const username = effective.user;
  let hostname: string;
  try {
    hostname = new URL(`http://${rawHost}`).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    throw new Error(`Full E2E requires ${envName} to use a canonical TCP host`);
  }

  if (
    protocol !== "postgresql:" ||
    !hostname ||
    !username ||
    !database ||
    database.includes("/") ||
    !/^[\p{L}\p{N}_-]+$/u.test(database) ||
    !schema ||
    effective.options
  ) {
    throw new Error(
      `Full E2E requires ${envName} to identify protocol, host, user, one database, and schema`,
    );
  }

  return {
    protocol,
    // A DNS root-label suffix denotes the same host (example.test. === example.test).
    hostname,
    port: String(effective.port),
    username,
    database,
    schema,
  };
}

function sameDatabaseIdentity(left: DatabaseIdentity, right: DatabaseIdentity): boolean {
  return (
    left.protocol === right.protocol &&
    left.hostname === right.hostname &&
    left.port === right.port &&
    left.username === right.username &&
    left.database === right.database &&
    left.schema === right.schema
  );
}

function samePhysicalDatabaseIdentity(
  left: DatabaseIdentity,
  right: DatabaseIdentity,
): boolean {
  return (
    left.protocol === right.protocol &&
    left.hostname === right.hostname &&
    left.port === right.port &&
    left.username === right.username &&
    left.database === right.database
  );
}

function assertWriteCapableE2ESafety(): void {
  if (isCollectionOnly || isExplicitReadOnlyRun) return;

  if (process.env.AGENT_OS_TEST_RESOURCE_SENTINEL !== "true") {
    throw new Error(
      "Full E2E requires AGENT_OS_TEST_RESOURCE_SENTINEL=true; refusing protected suites",
    );
  }

  const runtimeDatabase = databaseIdentity(process.env.DATABASE_URL, "DATABASE_URL");
  const declaredTestDatabase = databaseIdentity(process.env.TEST_DATABASE_URL, "TEST_DATABASE_URL");
  const isTestName = (name: string) => /(?:^|[-_])(test|ci|e2e|tmp)(?:$|[-_])/i.test(name);

  if (!isTestName(runtimeDatabase.database)) {
    throw new Error("Full E2E requires DATABASE_URL to name an isolated test/ci/e2e/tmp database");
  }
  if (!sameDatabaseIdentity(runtimeDatabase, declaredTestDatabase)) {
    throw new Error(
      "Full E2E requires DATABASE_URL and TEST_DATABASE_URL to have the same full isolated resource identity",
    );
  }

  if (process.env.MIGRATION_DATABASE_URL) {
    const migrationDatabase = databaseIdentity(
      process.env.MIGRATION_DATABASE_URL,
      "MIGRATION_DATABASE_URL",
    );
    if (!isTestName(migrationDatabase.database) || !sameDatabaseIdentity(runtimeDatabase, migrationDatabase)) {
      throw new Error(
        "Full E2E refuses a non-isolated or full-identity-mismatched MIGRATION_DATABASE_URL",
      );
    }
  }

  const protectedConnectionGroups = [
    { label: "development", envNames: ["DEVELOPMENT_DATABASE_URL", "DEV_DATABASE_URL"] },
    { label: "preview", envNames: ["PREVIEW_DATABASE_URL"] },
    { label: "production", envNames: ["PRODUCTION_DATABASE_URL", "PROD_DATABASE_URL"] },
  ];

  // A self-declared TEST_DATABASE_URL is not proof of isolation. The controller
  // must provide every protected environment identity so this check fails closed
  // when development, preview, or production cannot be compared.
  for (const group of protectedConnectionGroups) {
    const suppliedEnvNames = group.envNames.filter((envName) => process.env[envName]);
    if (suppliedEnvNames.length === 0) {
      throw new Error(
        `Full E2E requires a controller-bound ${group.label} database identity for comparison`,
      );
    }
    for (const envName of suppliedEnvNames) {
      const protectedDatabase = databaseIdentity(process.env[envName], envName);
      // The current pg Pool + PrismaPg construction does not configure adapter
      // schema selection. A different `?schema=` therefore cannot prove a
      // different physical resource; reject matching host/user/database even
      // when the declared schema differs.
      if (samePhysicalDatabaseIdentity(runtimeDatabase, protectedDatabase)) {
        throw new Error(`Full E2E refuses a test resource that matches ${envName}`);
      }
    }
  }
}

assertWriteCapableE2ESafety();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    locale: "zh-CN",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "tablet-focus",
      testMatch: focusProjectSpecs,
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
    },
    {
      name: "wide-focus",
      testMatch: focusProjectSpecs,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: configuredBaseUrl
    ? undefined
    : {
        command: "pnpm build && pnpm start",
        url: baseURL,
        reuseExistingServer: false,
        timeout: 180_000,
      },
});
