/**
 * Pre-build sitemap DB gate (FR-23.3 / delivery AC-23-03).
 *
 * The sitemap route reads every published post (all pages) plus the
 * category/tag indexes from PostgreSQL during static generation. Next 16
 * converts a FAILED prerender into a dynamic route rather than failing the
 * build, so a broken database previously produced exit 0 with nothing
 * shipped. This gate runs BEFORE `next build` and FAILS CLOSED.
 *
 * Environment source parity (Codex review round 8): the gate loads env files
 * with Next's OWN loader — @next/env's loadEnvConfig, resolved from the
 * installed `next` package's dependency tree — in PRODUCTION build mode
 * (file order and precedence therefore identical to `next build`: explicit
 * process.env wins, then .env.production.local, .env.local, .env.production,
 * .env). No hand-rolled file list, and no DOTENV_CONFIG_PATH redirection
 * (Next build does not honor it — accepting it here would let the gate
 * verify a different database than the one the build compiles against). If
 * no source provides DATABASE_URL the gate exits NON-ZERO.
 *
 * The gate then executes the EXACT runtime snapshot function
 * (readSitemapSnapshotWith — shared with src/modules/sitemap): every
 * published-post page through the last one plus the category and tag
 * indexes, inside one RepeatableRead transaction. Any failing leg fails the
 * build. Failure logs carry a stable stage + error code + sanitized
 * host:port endpoint ONLY — never the connection string, credentials, or
 * raw error text.
 *
 * No new dependencies (tsx + pg + @prisma/adapter-pg + next itself).
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
// Relative imports (not the @/ alias) so tsx resolves them from any cwd.
import { PrismaClient } from "../src/generated/prisma/client";
import { readSitemapSnapshotWith } from "../src/modules/sitemap/sitemap.snapshot.core";

export type DatabaseUrlResolution =
  | { kind: "environment"; url: string }
  | { kind: "next-env-files"; url: string }
  | { kind: "missing" };

type NextEnvModule = {
  loadEnvConfig: (
    dir: string,
    dev: boolean,
    logs?: { log?: () => void; warn?: () => void; error?: () => void },
    forceReload?: boolean,
  ) => unknown;
};

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Resolve Next's OWN @next/env through the installed next package — never a hardcoded store path. */
async function loadNextEnvLoader(): Promise<NextEnvModule["loadEnvConfig"]> {
  const requireFromNext = createRequire(path.join(REPO_ROOT, "node_modules", "next", "package.json"));
  const nextEnvPath = requireFromNext.resolve("@next/env");
  const imported = (await import(pathToFileURL(nextEnvPath).href)) as NextEnvModule & {
    default?: NextEnvModule;
  };
  const loadEnvConfig = imported.loadEnvConfig ?? imported.default?.loadEnvConfig;
  if (typeof loadEnvConfig !== "function") {
    throw new Error("@next/env loadEnvConfig not found");
  }
  return loadEnvConfig;
}

/**
 * Resolve DATABASE_URL with EXACTLY the sources `next build` uses, in the
 * same precedence: an explicit environment variable first; otherwise Next's
 * production env files loaded by @next/env itself. Exported for tests.
 */
export async function resolveDatabaseUrlForBuild(dir: string): Promise<DatabaseUrlResolution> {
  const fromEnvironment = process.env.DATABASE_URL?.trim();
  if (fromEnvironment) return { kind: "environment", url: fromEnvironment };

  const loadEnvConfig = await loadNextEnvLoader();
  // Mirror `next build`: production mode. Restored afterwards so importing
  // this module leaves no side effects on the host process. (Next's types
  // mark NODE_ENV read-only for app code; this standalone script owns it.)
  const writableEnv = process.env as Record<string, string | undefined>;
  const previousNodeEnv = writableEnv.NODE_ENV;
  writableEnv.NODE_ENV = "production";
  try {
    loadEnvConfig(dir, /* dev */ false, { log: () => undefined, warn: () => undefined, error: () => undefined });
  } finally {
    if (previousNodeEnv === undefined) delete writableEnv.NODE_ENV;
    else writableEnv.NODE_ENV = previousNodeEnv;
  }
  const fromFiles = process.env.DATABASE_URL?.trim();
  if (fromFiles) return { kind: "next-env-files", url: fromFiles };
  return { kind: "missing" };
}

/** Stable, credential-free failure label: error code + host:port endpoint only. */
function summarizeFailure(error: unknown, url: string): string {
  const parts: string[] = [];
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code ?? (error as { errorCode?: unknown }).errorCode;
    if (typeof code === "string" && code.length > 0) parts.push(`code=${code}`);
    else {
      const name = (error as { name?: unknown }).name;
      if (typeof name === "string" && name.length > 0) parts.push(`type=${name}`);
    }
  }
  try {
    const parsed = new URL(url);
    if (parsed.hostname && parsed.port) parts.push(`endpoint=${parsed.hostname}:${parsed.port}`);
  } catch {
    // Unparseable URL — omit the endpoint label.
  }
  return parts.join(" ") || "unknown";
}

async function main(): Promise<number> {
  const resolution = await resolveDatabaseUrlForBuild(process.cwd());
  if (resolution.kind === "missing") {
    console.error("[prebuild:sitemap-db] FAILED stage=resolve: no DATABASE_URL from the environment or Next env files");
    return 1;
  }

  const pool = new Pool({ connectionString: resolution.url, connectionTimeoutMillis: 5_000, statement_timeout: 15_000, max: 1 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const snapshot = await readSitemapSnapshotWith(prisma);
    console.log(
      `[prebuild:sitemap-db] ok stage=snapshot: ${snapshot.posts.length} published post(s), ` +
        `${snapshot.categorySlugs.length} categor(ies), ${snapshot.tagSlugs.length} tag(s) ` +
        `(source=${resolution.kind})`,
    );
    return 0;
  } catch (error) {
    console.error(
      `[prebuild:sitemap-db] FAILED stage=snapshot (source=${resolution.kind}): ${summarizeFailure(error, resolution.url)}`,
    );
    return 1;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

// Entry guard: run as a script only when executed directly; importing the
// module (tests) has no side effects.
const invokedScript = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedScript && import.meta.filename === invokedScript) {
  const exitCode = await main();
  process.exit(exitCode);
}
