import { beforeAll, describe, expect, it } from "vitest";

/**
 * §4.3 lock discipline (Codex review round 6): the acquisition order for
 * taxonomy rows must be a single global stable order — categories before
 * tags, ids sorted — independent of input order and of the add/remove phase.
 * Two writers presenting reversed sets then request the SAME first lock, so
 * an A↔B deadlock cannot be constructed.
 *
 * The helper lives in `@/modules/post/post.repository`, which transitively
 * constructs the Prisma client at import time (no connection is opened), so
 * we set DATABASE_URL and use a dynamic import — same pattern as
 * prisma-error.test.ts — to keep this a pure unit test.
 */
type Repository = typeof import("@/modules/post/post.repository");
let orderTaxonomyBumps: Repository["orderTaxonomyBumps"];
const bump = (kind: "category" | "tag", id: string, failOnMissing = false) => ({ kind, id, failOnMissing });

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/leon_blog_test";
  ({ orderTaxonomyBumps } = await import("@/modules/post/post.repository"));
});

describe("orderTaxonomyBumps", () => {
  it("orders every category before every tag, ids sorted within each group", () => {
    const ordered = orderTaxonomyBumps([
      bump("tag", "t-b"),
      bump("category", "c-b"),
      bump("tag", "t-a"),
      bump("category", "c-a"),
    ]);
    expect(ordered.map((b) => `${b.kind}:${b.id}`)).toEqual(["category:c-a", "category:c-b", "tag:t-a", "tag:t-b"]);
  });

  it("is input-order independent — reversed writer inputs produce the SAME acquisition sequence", () => {
    const forward = orderTaxonomyBumps([bump("tag", "t-1"), bump("tag", "t-2"), bump("tag", "t-3")]);
    const reversed = orderTaxonomyBumps([bump("tag", "t-3"), bump("tag", "t-2"), bump("tag", "t-1")]);
    expect(forward).toEqual(reversed);
  });

  it("merges added and removed targets into ONE pass (no added-then-removed phases)", () => {
    const merged = orderTaxonomyBumps([
      bump("tag", "t-added-late", true),
      bump("tag", "t-removed-early", false),
      bump("tag", "t-added-early", true),
    ]);
    expect(merged.map((b) => b.id)).toEqual(["t-added-early", "t-added-late", "t-removed-early"]);
  });

  it("dedupes by kind+id, preferring the fail-on-missing variant", () => {
    const ordered = orderTaxonomyBumps([bump("tag", "t-1", false), bump("tag", "t-1", true)]);
    expect(ordered).toEqual([bump("tag", "t-1", true)]);
  });

  it("sorts by CODE POINTS regardless of locale collation (B before a)", () => {
    // Code-point: 'B'(66) < 'a'(97). Locale/case-insensitive collation would
    // place 'a' first — the lock order must not depend on the machine locale.
    const ordered = orderTaxonomyBumps([bump("tag", "a"), bump("tag", "B")]);
    expect(ordered.map((b) => b.id)).toEqual(["B", "a"]);
    const mixed = orderTaxonomyBumps([bump("category", "a"), bump("tag", "B"), bump("category", "B"), bump("tag", "a")]);
    expect(mixed.map((b) => `${b.kind}:${b.id}`)).toEqual(["category:B", "category:a", "tag:B", "tag:a"]);
  });

  it("drops empty/invalid ids instead of ordering them", () => {
    const ordered = orderTaxonomyBumps([bump("tag", ""), bump("tag", "t-1")]);
    expect(ordered).toEqual([bump("tag", "t-1")]);
  });
});
