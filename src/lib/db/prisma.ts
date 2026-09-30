import "server-only";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { logger } from "@/lib/logger/logger";

/**
 * Global Prisma Client singleton (architecture §8.4).
 *
 * - One client + one pg connection pool per process. Serverless cold starts
 *   build a fresh pool; local dev reuses the instance via globalThis so hot
 *   reload does not leak connections.
 * - The pooled `DATABASE_URL` is passed to the pg driver adapter. This module
 *   is server-only and must never be imported by a Client Component.
 */

declare global {
  var __leonBlogPrisma: { prisma: PrismaClient; pool: Pool } | undefined;
}

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required to construct the Prisma client");
  }
  return new Pool({ connectionString: url, max: 10 });
}

function buildClient(): { prisma: PrismaClient; pool: Pool } {
  const pool = createPool();
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  logger.debug("prisma.client.constructed");
  return { prisma, pool };
}

const globalStore = globalThis as typeof globalThis & { __leonBlogPrisma?: { prisma: PrismaClient; pool: Pool } };

const store = (globalStore.__leonBlogPrisma ??= buildClient());
export const prisma: PrismaClient = store.prisma;
export const pgPool: Pool = store.pool;

/**
 * Detect a Prisma unique-constraint violation (P2002) structurally. We check
 * the `code` field rather than `instanceof PrismaClientKnownRequestError` so the
 * detection survives generated-client shape changes across Prisma versions.
 */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

/** Prisma "record to update/delete not found" (including optimistic-lock misses). */
export function isNotFoundViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2025";
}

/**
 * The first field of the violated unique constraint. With the pg driver
 * adapter (architecture §8.4) the field names live under
 * `meta.driverAdapterError.cause.constraint.fields`; `meta.target` is kept as a
 * fallback for adapters that expose it directly.
 */
export function uniqueViolationField(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const meta = (error as {
    meta?: {
      target?: string | string[];
      driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } };
    };
  }).meta;
  const driverFields = meta?.driverAdapterError?.cause?.constraint?.fields;
  if (Array.isArray(driverFields) && driverFields.length > 0) return driverFields[0]!;
  const target = Array.isArray(meta?.target) ? meta?.target[0] : meta?.target;
  return typeof target === "string" && target.length > 0 ? target : null;
}

/**
 * Prisma foreign-key violation (P2003). Structural check like the unique
 * violation helper above (FR-21): only ever the START of the classification —
 * callers must additionally whitelist the CONSTRAINT (see
 * `foreignKeyConstraintName`) before mapping anything to a business error.
 */
export function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2003";
}

/**
 * The violated FK constraint name. With the pg driver adapter the underlying
 * PostgreSQL error carries `constraint` as a plain string (e.g.
 * "post_tags_tag_id_fkey") under the same `driverAdapterError.cause` path as
 * the unique-violation fields.
 */
export function foreignKeyConstraintName(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const meta = (error as {
    meta?: {
      constraint?: unknown;
      driverAdapterError?: { cause?: { constraint?: unknown } };
    };
  }).meta;
  const candidate = meta?.driverAdapterError?.cause?.constraint ?? meta?.constraint;
  // Raw pg errors expose `constraint` as a plain string; Prisma's serialized
  // form carries it as `{ index: "…_fkey" }` (verified against the real
  // adapter — see tests/integration/taxonomy-versions.test.ts).
  if (typeof candidate === "string" && candidate.length > 0) return candidate;
  if (typeof candidate === "object" && candidate !== null) {
    const index = (candidate as { index?: unknown }).index;
    if (typeof index === "string" && index.length > 0) return index;
  }
  return null;
}
