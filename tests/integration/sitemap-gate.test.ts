import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { Client } from "pg";

/**
 * FR-23.3 gate evidence (Codex review round 8 — environment source parity):
 * the gate resolves DATABASE_URL with Next's OWN loader (@next/env,
 * production mode), so it can never verify a different database than the one
 * `next build` compiles against. All spawns run in throwaway EMPTY
 * directories (never the repo cwd — the loader there would read the real
 * project .env files), with the inherited DB variables stripped and NO
 * DOTENV_CONFIG_PATH steering (the production script does not honor it).
 * Priority cases use fabricated DEAD-port URLs; the choice is observed
 * through the sanitized `endpoint=host:port` label — connection strings are
 * never echoed. Leg faults are injected in a throwaway database; the shared
 * snapshot function runs against real PostgreSQL.
 */
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "../../..");
const GATE_SCRIPT = path.join(REPO_ROOT, "scripts/prebuild-sitemap-db.ts");
const TSX_BIN = path.join(REPO_ROOT, "node_modules/.bin/tsx");
const GATE_DB_NAME = "leon_blog_gate_test";
const GATE_URL = `postgresql://postgres:postgres@localhost:5432/${GATE_DB_NAME}`;
// Fabricated dead endpoints — unreachable, fabricated credentials only.
const DEAD_A = "postgresql://gate:gate@127.0.0.1:59991/leon_gate_pri_test";
const DEAD_B = "postgresql://gate:gate@127.0.0.1:59992/leon_gate_pri_test";
const DEAD_C = "postgresql://gate:gate@127.0.0.1:59993/leon_gate_pri_test";

/** Created AND tracked — every throwaway workdir is cleaned by afterAll. */
function trackedWorkdir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "leon-gate-env-"));
  workdirs.push(dir);
  return dir;
}

function sanitizedEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.DATABASE_URL;
  delete env.MIGRATION_DATABASE_URL;
  delete env.TEST_DATABASE_URL;
  delete env.DOTENV_CONFIG_PATH; // the production gate must not be steered by it
  return { ...env, ...overrides } as NodeJS.ProcessEnv;
}

function runGate(env: Record<string, string | undefined> = {}, cwd: string = trackedWorkdir()): { status: number; output: string } {
  try {
    const output = execFileSync(TSX_BIN, [GATE_SCRIPT], {
      cwd,
      env: sanitizedEnv(env),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 90_000,
    });
    return { status: 0, output };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string; message?: string };
    return { status: err.status ?? -1, output: `${err.stdout ?? ""}${err.stderr ?? ""}${err.message ?? ""}` };
  }
}

/** No connection string, user:password, or scheme may ever reach the output. */
function expectNoCredentialLeak(output: string): void {
  expect(output).not.toMatch(/postgres(ql)?:\/\//i);
  expect(output).not.toMatch(/\w+:\w+@/);
}

const workdirs: string[] = [];
let maintenance: Client;

beforeAll(async () => {
  maintenance = new Client({ connectionString: "postgresql://postgres:postgres@localhost:5432/postgres" });
  await maintenance.connect();
  await maintenance.query(`DROP DATABASE IF EXISTS ${GATE_DB_NAME} WITH (FORCE)`);
  await maintenance.query(`CREATE DATABASE ${GATE_DB_NAME}`);
  execFileSync("pnpm", ["prisma", "migrate", "deploy"], {
    cwd: REPO_ROOT,
    env: { ...process.env, MIGRATION_DATABASE_URL: GATE_URL } as NodeJS.ProcessEnv,
    stdio: "ignore",
    timeout: 90_000,
  });
  const gate = new Client({ connectionString: GATE_URL });
  await gate.connect();
  await gate.query(`INSERT INTO users (id, email, display_name, password_hash, is_active, session_version, created_at, updated_at)
    VALUES ('11111111-1111-4111-8111-111111111111', 'gate@test.dev', 'gate', 'x', true, 1, now(), now())`);
  for (let i = 1; i <= 3; i++) {
    await gate.query(
      `INSERT INTO posts (id, title, slug, excerpt, content_md, status, published_at, author_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'e', 'x', 'PUBLISHED', now(), '11111111-1111-4111-8111-111111111111', now(), now())`,
      [`gate-${i}`, `gate-${i}`],
    );
  }
  await gate.query(`INSERT INTO categories (id, name, slug, sort_order, version, created_at, updated_at)
    VALUES (gen_random_uuid(), '门', 'gate-cat', 0, 0, now(), now())`);
  await gate.query(`INSERT INTO tags (id, name, slug, version, created_at, updated_at)
    VALUES (gen_random_uuid(), '门签', 'gate-tag', 0, now(), now())`);
  await gate.end();
});

afterAll(async () => {
  await maintenance.query(`DROP DATABASE IF EXISTS ${GATE_DB_NAME} WITH (FORCE)`).catch(() => undefined);
  await maintenance.end().catch(() => undefined);
  for (const dir of workdirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("gate env-source parity with next build (@next/env, production mode)", () => {
  it("explicit process.env.DATABASE_URL outranks every env file (observed via sanitized endpoint label)", () => {
    const dir = trackedWorkdir();
    writeFileSync(path.join(dir, ".env"), `DATABASE_URL=${DEAD_A}\n`);
    writeFileSync(path.join(dir, ".env.production.local"), `DATABASE_URL=${DEAD_B}\n`);
    const result = runGate({ DATABASE_URL: DEAD_C }, dir);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("endpoint=127.0.0.1:59993");
    expect(result.output).not.toContain("59991");
    expect(result.output).not.toContain("59992");
    expect(result.output).toContain("source=environment");
    expectNoCredentialLeak(result.output);
  });

  it(".env.production.local beats .env when both define DATABASE_URL (Next production order)", () => {
    const dir = trackedWorkdir();
    writeFileSync(path.join(dir, ".env"), `DATABASE_URL=${DEAD_A}\n`);
    writeFileSync(path.join(dir, ".env.production.local"), `DATABASE_URL=${DEAD_B}\n`);
    const result = runGate({}, dir);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("endpoint=127.0.0.1:59992");
    expect(result.output).not.toContain("59991");
    expect(result.output).toContain("source=next-env-files");
    expectNoCredentialLeak(result.output);
  });

  it(".env.production beats .env (fabricated dead ports, no real database touched)", () => {
    const dir = trackedWorkdir();
    writeFileSync(path.join(dir, ".env"), `DATABASE_URL=${DEAD_A}\n`);
    writeFileSync(path.join(dir, ".env.production"), `DATABASE_URL=${DEAD_C}\n`);
    const result = runGate({}, dir);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("endpoint=127.0.0.1:59993");
    expect(result.output).not.toContain("59991");
    expectNoCredentialLeak(result.output);
  });

  it(".env.local beats .env.production (Next production order, fabricated dead ports)", () => {
    const dir = trackedWorkdir();
    writeFileSync(path.join(dir, ".env.production"), `DATABASE_URL=${DEAD_C}\n`);
    writeFileSync(path.join(dir, ".env.local"), `DATABASE_URL=${DEAD_B}\n`);
    const result = runGate({}, dir);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("endpoint=127.0.0.1:59992");
    expect(result.output).not.toContain("59993");
    expect(result.output).toContain("source=next-env-files");
    expectNoCredentialLeak(result.output);
  });

  it("no-config (empty directory, DB variables stripped) fails closed at stage=resolve", () => {
    const result = runGate();
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("stage=resolve");
    expect(result.output).toContain("no DATABASE_URL");
    expectNoCredentialLeak(result.output);
  });

  it("DOTENV_CONFIG_PATH is NOT honored by the production gate (Next build ignores it)", () => {
    const dir = trackedWorkdir();
    // A steering file pretending to redirect the loader — must be ignored, so
    // the (only) real source .env.production.local still wins.
    writeFileSync(path.join(dir, ".env.steering"), `DATABASE_URL=${DEAD_A}\n`);
    writeFileSync(path.join(dir, ".env.production.local"), `DATABASE_URL=${DEAD_B}\n`);
    const result = runGate({ DOTENV_CONFIG_PATH: path.join(dir, ".env.steering") }, dir);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("endpoint=127.0.0.1:59992");
    expect(result.output).not.toContain("59991");
    expectNoCredentialLeak(result.output);
  });
});

describe("prebuild sitemap gate snapshot legs (FR-23.3, throwaway database)", () => {
  it("passes on a healthy migrated database (full snapshot read)", () => {
    const result = runGate({ DATABASE_URL: GATE_URL });
    expect(result.status).toBe(0);
    expect(result.output).toContain("3 published post(s)");
    expect(result.output).toContain("source=environment");
    expectNoCredentialLeak(result.output);
  });

  it("fails closed on an unreachable database", () => {
    const result = runGate({ DATABASE_URL: "postgresql://127.0.0.1:59999/leon_blog_test" });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("FAILED stage=snapshot");
    expectNoCredentialLeak(result.output);
  });

  it("fails when the POSTS leg of the snapshot read breaks", async () => {
    const gate = new Client({ connectionString: GATE_URL });
    await gate.connect();
    await gate.query("DROP TABLE posts CASCADE");
    await gate.end();
    const result = runGate({ DATABASE_URL: GATE_URL });
    expect(result.status).not.toBe(0);
    expectNoCredentialLeak(result.output);
  });

  it("fails when the CATEGORY index leg breaks (even with posts readable)", async () => {
    const gate = new Client({ connectionString: GATE_URL });
    await gate.connect();
    await gate.query("DROP TABLE categories CASCADE");
    await gate.end();
    const result = runGate({ DATABASE_URL: GATE_URL });
    expect(result.status).not.toBe(0);
    expectNoCredentialLeak(result.output);
  });

  it("fails when the TAG index leg breaks", async () => {
    const gate = new Client({ connectionString: GATE_URL });
    await gate.connect();
    await gate.query("DROP TABLE tags CASCADE");
    await gate.end();
    const result = runGate({ DATABASE_URL: GATE_URL });
    expect(result.status).not.toBe(0);
    expectNoCredentialLeak(result.output);
  });
});
