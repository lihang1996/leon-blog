import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const readOnlySpecs = new Set([
  "tests/e2e/ui-csp-regression.spec.ts",
  "tests/e2e/focus-style-contract.spec.ts",
]);
const forbiddenEnvironmentNames = [
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
];
const forbiddenEnvironment = forbiddenEnvironmentNames.find(
  (name) => process.env[name] !== undefined,
);
if (forbiddenEnvironment) {
  process.stderr.write(`The project E2E gate refuses environment override ${forbiddenEnvironment}\n`);
  process.exit(2);
}

const forbiddenOption = args.find(
  (arg) =>
    arg === "--config" ||
    arg.startsWith("--config=") ||
    arg.startsWith("-c") ||
    arg === "--reporter" ||
    arg.startsWith("--reporter="),
);

const collectionOnly = args.length === 1 && args[0] === "--list";
const readOnlyRun =
  args.length > 0 &&
  args.every(
    (arg) =>
      readOnlySpecs.has(arg) &&
      !/[|*+?()[\]{}^$\\]/.test(arg) &&
      !arg.split("/").includes(".."),
  );
const fullProtectedRun = args.length === 0 || (!collectionOnly && !readOnlyRun);

if (forbiddenOption) {
  process.stderr.write(
    `The project E2E gate fixes its Playwright config and reporter; refusing ${forbiddenOption}\n`,
  );
  process.exit(2);
}

if (fullProtectedRun && process.env.AGENT_OS_TEST_RESOURCE_SENTINEL !== "true") {
  process.stderr.write(
    "Full E2E requires AGENT_OS_TEST_RESOURCE_SENTINEL=true; refusing protected suites\n",
  );
  process.exit(2);
}

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const projectConfig = fileURLToPath(new URL("../playwright.config.ts", import.meta.url));
const childEnv = { ...process.env };
delete childEnv.AGENT_OS_E2E_READ_ONLY_CAPABILITY;
if (readOnlyRun) childEnv.AGENT_OS_E2E_READ_ONLY_CAPABILITY = "v1";
const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(
  executable,
  [
    "exec",
    "playwright",
    "test",
    `--config=${projectConfig}`,
    ...(collectionOnly ? ["--list"] : args),
  ],
  {
    cwd: projectRoot,
    stdio: "inherit",
    env: childEnv,
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
