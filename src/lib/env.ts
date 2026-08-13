import "server-only";
import { z } from "zod";

/**
 * Runtime env validation (architecture §18.3). Fail fast when the current
 * process is missing a required variable. Only non-sensitive values may be
 * prefixed NEXT_PUBLIC_ and this module must never be imported by a Client
 * Component (it would leak DB/secret handling into the browser bundle). The
 * `server-only` import turns a future accidental client import into a build
 * error instead of a silent crash.
 */
/** Known .env.example placeholder that must never reach production. */
const KNOWN_PLACEHOLDER_AUTH_SECRETS = [
  "replace-with-at-least-32-random-characters",
];

const runtimeEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z
    .string()
    .min(32)
    .refine(
      (value) => !KNOWN_PLACEHOLDER_AUTH_SECRETS.includes(value),
      "AUTH_SECRET is still the .env.example placeholder — generate a real secret with `openssl rand -base64 32`",
    ),
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_SITE_NAME: z.string().min(1).default("Leon 的博客"),
  ALLOWED_IMAGE_HOSTS: z.string().min(1),
});

const migrationEnvSchema = z.object({
  MIGRATION_DATABASE_URL: z.string().min(1),
});

function parseEnv<S extends z.ZodType>(schema: S, source: Record<string, string | undefined>): z.infer<S> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration — missing/invalid: ${details}`);
  }
  return result.data;
}

export const runtimeEnv = parseEnv(runtimeEnvSchema, process.env);

export const siteUrl = runtimeEnv.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
export const siteName = runtimeEnv.NEXT_PUBLIC_SITE_NAME;

export function getAllowedImageHosts(): string[] {
  return runtimeEnv.ALLOWED_IMAGE_HOSTS.split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

/** Only used by Prisma CLI/CI processes (prisma.config.ts / scripts). */
export function requireMigrationDatabaseUrl(): string {
  const result = migrationEnvSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error("Missing MIGRATION_DATABASE_URL for Prisma CLI/CI process");
  }
  return result.data.MIGRATION_DATABASE_URL;
}
