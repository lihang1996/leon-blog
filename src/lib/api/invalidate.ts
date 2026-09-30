import { revalidatePath, revalidateTag } from "next/cache";
import {
  applyInvalidationPlan,
  IMMEDIATE_REVALIDATE,
  type InvalidationPlan,
} from "@/lib/cache/cache-invalidation";
import { logger } from "@/lib/logger/logger";

/**
 * Value of the `X-Public-Cache-Status` response header on admin writes
 * (FR-03 / delivery §4.2):
 *   invalidated  — every invalidation target was marked stale (next request
 *                   regenerates; `revalidatePath/revalidateTag` only mark).
 *   failed       — the business write committed but ≥1 target failed.
 *   not-required — the write cannot change public output (e.g. draft create).
 */
export type PublicCacheStatus = "invalidated" | "failed" | "not-required";

export const PUBLIC_CACHE_STATUS_HEADER = "X-Public-Cache-Status";

/**
 * Runs a cache invalidation plan AFTER a successful DB commit (architecture
 * §13.3 / §13.4). Failures are logged, never thrown — the DB stays the source
 * of truth — but the outcome is RETURNED so the route can set
 * `X-Public-Cache-Status: failed` and the client can warn + retry only the
 * refresh (FR-03: business result and cache-refresh result are separate).
 *
 * Uses `{ expire: 0 }` (not `"max"`) so publish/archive is visible on the next
 * public request instead of serving stale-while-revalidate list caches.
 */
export async function applyInvalidation(
  plan: InvalidationPlan,
  requestId: string,
  entity?: { kind: string; id?: string; version?: number },
): Promise<PublicCacheStatus> {
  const result = await applyInvalidationPlan(plan, {
    revalidatePath: (path) => {
      revalidatePath(path);
    },
    revalidateTag: (tag, profile) => {
      revalidateTag(tag, profile ?? IMMEDIATE_REVALIDATE);
    },
    onError: (message) => {
      // Structured per FR-03.4: request ID, stage, entity id/version, failed
      // target — never passwords, article bodies, or DB connection info.
      logger.error("cache.invalidation_failed", {
        requestId,
        stage: "post-commit",
        entityKind: entity?.kind,
        entityId: entity?.id,
        entityVersion: entity?.version,
        message,
      });
    },
  });
  return result.ok ? "invalidated" : "failed";
}
