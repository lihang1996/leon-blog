import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  readSitemapSnapshotWith,
  SITEMAP_PAGE_SIZE,
  type SitemapSnapshot,
} from "./sitemap.snapshot.core";

/**
 * Sitemap snapshot reader — production binding (FR-23 / architecture §15.2).
 * The query semantics live in sitemap.snapshot.core.ts so the pre-build gate
 * executes the exact same reads; this module only binds the global prisma
 * client and keeps the server-only guard for the app tree.
 */
export async function readSitemapSnapshot(): Promise<SitemapSnapshot> {
  return readSitemapSnapshotWith(prisma);
}

export { SITEMAP_PAGE_SIZE };
export type { SitemapSnapshot };
