// Relative import so this core stays loadable by the pre-build gate from any cwd.
import { Prisma } from "../../generated/prisma/client";

/**
 * Sitemap snapshot reader — CORE (FR-23 / architecture §15.2).
 *
 * This module is deliberately free of `server-only` and of the global prisma
 * singleton: the production path binds them via sitemap.snapshot.ts, and the
 * pre-build gate (scripts/prebuild-sitemap-db.ts) runs THE SAME function with
 * its own client so the gate's read semantics can never drift from the
 * runtime's.
 *
 * Every page of published posts plus the category/tag indexes is read inside
 * ONE PostgreSQL REPEATABLE READ transaction: PostgreSQL takes the snapshot at
 * the transaction's first read, so all pages observe the same committed state.
 * A publish/archive racing the traversal is therefore either wholly visible
 * or wholly invisible — a mixed sitemap is impossible by construction.
 * Failing reads throw: callers must NOT fall back to a partial "successful"
 * sitemap (delivery FR-23.1).
 *
 * Public-only by query shape: `status: "PUBLISHED"` is hard-coded; drafts and
 * archived posts can never enter the snapshot (FR-23.5).
 */
export type SitemapSnapshot = {
  posts: { slug: string; updatedAt: Date }[];
  categorySlugs: string[];
  tagSlugs: string[];
};

export const SITEMAP_PAGE_SIZE = 50;

export async function readSitemapSnapshotWith(client: {
  $transaction: PrismaClientLike["$transaction"];
}): Promise<SitemapSnapshot> {
  return client.$transaction(
    async (tx) => {
      const posts: SitemapSnapshot["posts"] = [];
      for (let page = 0; ; page++) {
        const rows = await tx.post.findMany({
          where: { status: "PUBLISHED" },
          select: { slug: true, updatedAt: true },
          orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
          skip: page * SITEMAP_PAGE_SIZE,
          take: SITEMAP_PAGE_SIZE,
        });
        posts.push(...rows);
        if (rows.length < SITEMAP_PAGE_SIZE) break;
      }
      const categories = await tx.category.findMany({ select: { slug: true }, orderBy: { slug: "asc" } });
      const tags = await tx.tag.findMany({ select: { slug: true }, orderBy: { slug: "asc" } });
      return {
        posts,
        categorySlugs: categories.map((row) => row.slug),
        tagSlugs: tags.map((row) => row.slug),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

/** Structural stand-in so this module stays importable outside the app tree. */
type PrismaClientLike = import("../../generated/prisma/client").PrismaClient;
