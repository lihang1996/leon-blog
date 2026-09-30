import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma, pgPool } from "@/lib/db/prisma";
import { readSitemapSnapshot, SITEMAP_PAGE_SIZE } from "@/modules/sitemap/sitemap.snapshot";
import sitemap from "@/app/sitemap";
import { resetDatabase, createAdminUser } from "./helpers";

/**
 * FR-23 — the sitemap must never fabricate a partial success and must read
 * every page from ONE RepeatableRead snapshot. Real PostgreSQL throughout;
 * fault injection is done at the prisma boundary (the only layer the route
 * trusts). Production-mode runtime cache behavior (stale snapshot serving
 * after a failed regeneration) is NOT covered here — see the batch report.
 */
let authorId: string;

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetDatabase();
  authorId = (await createAdminUser()).id;
});

async function publish(slug: string) {
  await prisma.post.create({
    data: { authorId, title: slug, slug, excerpt: "e", contentMd: "# c", status: "PUBLISHED", publishedAt: new Date() },
  });
}

describe("sitemap snapshot (FR-23)", () => {
  it("AC-23-01: an empty database yields exactly the base entries — a legal success", async () => {
    const entries = await sitemap();
    expect(entries.map((entry) => entry.url)).toHaveLength(4);
    expect(entries.every((entry) => !entry.url.includes("/posts/"))).toBe(true);
  });

  it("AC-23-04: only PUBLISHED posts enter the sitemap; drafts/archived/admin never leak", async () => {
    await publish("pub-one");
    await prisma.post.create({ data: { authorId, title: "d", slug: "draft-one", excerpt: "e", contentMd: "# c" } });
    await prisma.post.create({
      data: { authorId, title: "a", slug: "archived-one", excerpt: "e", contentMd: "# c", status: "ARCHIVED", publishedAt: new Date() },
    });
    const snapshot = await readSitemapSnapshot();
    expect(snapshot.posts.map((post) => post.slug)).toEqual(["pub-one"]);
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls.some((url) => url.endsWith("/draft-one"))).toBe(false);
    expect(urls.some((url) => url.endsWith("/archived-one"))).toBe(false);
    expect(urls.some((url) => url.includes("/admin"))).toBe(false);
  });

  it("traverses EVERY page beyond the 50-per-page cap — no silent truncation (AC-23-02 precondition)", async () => {
    const total = SITEMAP_PAGE_SIZE + 5;
    // one set-based INSERT keeps the setup fast
    await pgPool.query(
      `INSERT INTO posts (id, title, slug, excerpt, content_md, status, published_at, author_id, created_at, updated_at)
       SELECT gen_random_uuid(), 'generated-'||g, 'generated-'||g, 'x', 'x', 'PUBLISHED', '2026-09-29 00:00', $1, '2026-09-29', '2026-09-29'
       FROM generate_series(1, ${total}) AS g`,
      [authorId],
    );
    const snapshot = await readSitemapSnapshot();
    expect(snapshot.posts).toHaveLength(total);
    const entries = await sitemap();
    expect(entries.filter((entry) => entry.url.includes("/posts/generated-"))).toHaveLength(total);
  });

  it("a total read failure FAILS the route — the base-entries fallback is gone (FR-23.1 regression)", async () => {
    await publish("should-not-matter");
    vi.spyOn(prisma, "$transaction").mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:5432"));
    await expect(sitemap()).rejects.toThrow("ECONNREFUSED");
    await expect(readSitemapSnapshot()).rejects.toThrow();
  });

  it("AC-23-02: a failure on a LATER page still fails the whole snapshot — no partial success is committed", async () => {
    let page = 0;
    const spy = vi.spyOn(prisma, "$transaction");
    spy.mockImplementation(async (interaction: unknown) => {
      const tx = {
        post: {
          findMany: vi.fn(async () => {
            page += 1;
            if (page === 1) {
              return Array.from({ length: SITEMAP_PAGE_SIZE }, (_, i) => ({ slug: `page1-${i}`, updatedAt: new Date() }));
            }
            throw new Error("page 2 read failed");
          }),
        },
        category: { findMany: vi.fn(async () => []) },
        tag: { findMany: vi.fn(async () => []) },
      };
      return (interaction as (client: unknown) => Promise<unknown>)(tx);
    });
    await expect(readSitemapSnapshot()).rejects.toThrow("page 2 read failed");
    await expect(sitemap()).rejects.toThrow("page 2 read failed");
    spy.mockRestore();
  });

  it("requests a RepeatableRead transaction, and PostgreSQL RR keeps a traversal snapshot stable across concurrent commits (AC-23-05 basis)", async () => {
    const spy = vi.spyOn(prisma, "$transaction");
    await readSitemapSnapshot();
    expect(spy).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "RepeatableRead" }));
    spy.mockRestore();

    // Direct proof of the isolation semantics the module relies on: inside a
    // RR transaction, a post committed by ANOTHER connection mid-traversal is
    // invisible — a sitemap generated from this snapshot cannot mix states.
    await publish("before-snapshot");
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      const first = await client.query("SELECT count(*)::int AS n FROM posts WHERE status = 'PUBLISHED'");
      await publish("committed-mid-traversal");
      const second = await client.query("SELECT count(*)::int AS n FROM posts WHERE status = 'PUBLISHED'");
      expect(second.rows[0].n).toBe(first.rows[0].n); // snapshot frozen at first read
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    // after commit, the next snapshot is a NEW single consistent state
    const snapshot = await readSitemapSnapshot();
    expect(snapshot.posts.map((post) => post.slug)).toContain("committed-mid-traversal");
    expect(snapshot.posts.map((post) => post.slug)).toContain("before-snapshot");
  });
});
