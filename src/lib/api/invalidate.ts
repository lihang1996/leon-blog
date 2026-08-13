import { revalidatePath, revalidateTag } from "next/cache";
import { applyInvalidationPlan, type InvalidationPlan } from "@/lib/cache/cache-invalidation";
import { logger } from "@/lib/logger/logger";

/**
 * Runs a cache invalidation plan AFTER a successful DB commit (architecture
 * §13.3 / §13.4). Failures are logged, never thrown — the DB stays the source
 * of truth.
 */
export async function applyInvalidation(plan: InvalidationPlan, requestId: string): Promise<void> {
  await applyInvalidationPlan(plan, {
    revalidatePath: (path) => {
      revalidatePath(path);
    },
    revalidateTag: (tag) => {
      revalidateTag(tag, "max");
    },
    onError: (message) => {
      logger.error("cache.invalidation_failed", { requestId, message });
    },
  });
}
