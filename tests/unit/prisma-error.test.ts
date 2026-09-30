import { beforeAll, describe, expect, it } from "vitest";

/**
 * RQ-006 — Prisma P2002 detection helpers (architecture §8.4 + design FIND-001).
 * The helpers live in `@/lib/db/prisma`, which constructs a lazy pg Pool + client
 * at import time (no connection is opened), so we set DATABASE_URL and use a
 * dynamic import to keep this a pure unit test.
 */
type Helpers = typeof import("@/lib/db/prisma");
let isUniqueViolation: Helpers["isUniqueViolation"];
let uniqueViolationField: Helpers["uniqueViolationField"];
let isForeignKeyViolation: Helpers["isForeignKeyViolation"];
let foreignKeyConstraintName: Helpers["foreignKeyConstraintName"];

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/leon_blog_test";
  const mod = await import("@/lib/db/prisma");
  isUniqueViolation = mod.isUniqueViolation;
  uniqueViolationField = mod.uniqueViolationField;
  isForeignKeyViolation = mod.isForeignKeyViolation;
  foreignKeyConstraintName = mod.foreignKeyConstraintName;
});

describe("isUniqueViolation", () => {
  it("returns true for a Prisma P2002 error", () => {
    expect(isUniqueViolation({ code: "P2002", meta: {} })).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isUniqueViolation({ code: "P2025" })).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("P2002")).toBe(false);
  });
});

describe("uniqueViolationField", () => {
  it("reads the field from the pg driver adapter error shape", () => {
    const error = {
      code: "P2002",
      meta: {
        modelName: "Tag",
        driverAdapterError: {
          cause: { constraint: { fields: ["name"] } },
        },
      },
    };
    expect(uniqueViolationField(error)).toBe("name");
  });

  it("falls back to meta.target when the adapter shape is absent", () => {
    expect(uniqueViolationField({ meta: { target: ["slug"] } })).toBe("slug");
    expect(uniqueViolationField({ meta: { target: "slug" } })).toBe("slug");
  });

  it("returns null when no field information is present", () => {
    expect(uniqueViolationField({ meta: {} })).toBe(null);
    expect(uniqueViolationField({})).toBe(null);
    expect(uniqueViolationField(null)).toBe(null);
  });
});

describe("foreign-key violation detection (FR-21)", () => {
  it("recognizes P2003 structurally and never confuses other codes", () => {
    expect(isForeignKeyViolation({ code: "P2003" })).toBe(true);
    expect(isForeignKeyViolation({ code: "P2002" })).toBe(false);
    expect(isForeignKeyViolation(new Error("connect ECONNREFUSED"))).toBe(false);
    expect(isForeignKeyViolation(null)).toBe(false);
  });

  it("extracts the constraint name from both adapter shapes", () => {
    // Prisma-serialized pg error (verified against the real adapter)
    expect(foreignKeyConstraintName({
      code: "P2003",
      meta: { driverAdapterError: { cause: { constraint: { index: "post_tags_tag_id_fkey" } } } },
    })).toBe("post_tags_tag_id_fkey");
    // Raw pg error shape
    expect(foreignKeyConstraintName({
      code: "P2003",
      meta: { driverAdapterError: { cause: { constraint: "posts_category_id_fkey" } } },
    })).toBe("posts_category_id_fkey");
  });

  it("returns null for unrecognized shapes instead of guessing a constraint", () => {
    expect(foreignKeyConstraintName({ code: "P2003" })).toBeNull();
    expect(foreignKeyConstraintName({ code: "P2003", meta: { driverAdapterError: { cause: { constraint: { fields: ["author_id"] } } } } })).toBeNull();
    expect(foreignKeyConstraintName(new Error("boom"))).toBeNull();
  });
});
