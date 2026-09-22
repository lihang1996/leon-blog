import { revalidatePath, revalidateTag } from "next/cache";
import {
  applyInvalidationPlan,
  IMMEDIATE_REVALIDATE,
  type InvalidationPlan,
} from "@/lib/cache/cache-invalidation";
import { logger } from "@/lib/logger/logger";

/**
 * Runs a cache invalidation plan AFTER a successful DB commit (architecture
 * §13.3 / §13.4). Failures are logged, never thrown — the DB stays the source
 * of truth.
 *
 * Uses `{ expire: 0 }` (not `"max"`) so publish/archive is visible on the next
 * public request instead of serving stale-while-revalidate list caches.
 */
export async function applyInvalidation(plan: InvalidationPlan, requestId: string): Promise<void> {
  await applyInvalidationPlan(plan, {
    revalidatePath: (path) => {
      revalidatePath(path);
    },
    revalidateTag: (tag, profile) => {
      revalidateTag(tag, profile ?? IMMEDIATE_REVALIDATE);
    },
    onError: (message) => {
      logger.error("cache.invalidation_failed", { requestId, message });
    },
  });
}
