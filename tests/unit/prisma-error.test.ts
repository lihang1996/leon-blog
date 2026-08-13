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

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/leon_blog_test";
  const mod = await import("@/lib/db/prisma");
  isUniqueViolation = mod.isUniqueViolation;
  uniqueViolationField = mod.uniqueViolationField;
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
