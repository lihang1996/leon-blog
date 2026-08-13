import { describe, expect, it } from "vitest";
import {
  isAcceptableSlug,
  isReservedSlug,
  isValidSlug,
  normalizeEmail,
  normalizeTagName,
  slugifyTitle,
} from "@/lib/slug";

describe("isValidSlug", () => {
  it("accepts lowercase alphanumeric and single hyphens", () => {
    expect(isValidSlug("nextjs-app-router")).toBe(true);
    expect(isValidSlug("a")).toBe(true);
    expect(isValidSlug("post-1234abcd")).toBe(true);
  });

  it("rejects uppercase, spaces, leading/trailing/double hyphens, empty", () => {
    expect(isValidSlug("Nextjs")).toBe(false);
    expect(isValidSlug("hello world")).toBe(false);
    expect(isValidSlug("-hello")).toBe(false);
    expect(isValidSlug("hello-")).toBe(false);
    expect(isValidSlug("hello--world")).toBe(false);
    expect(isValidSlug("")).toBe(false);
  });

  it("rejects reserved paths", () => {
    expect(isReservedSlug("admin")).toBe(true);
    expect(isReservedSlug("api")).toBe(true);
    expect(isReservedSlug("login")).toBe(true);
    expect(isAcceptableSlug("admin")).toBe(false);
    expect(isAcceptableSlug("my-admin")).toBe(true);
  });
});

describe("slugifyTitle", () => {
  it("slugifies ascii titles", () => {
    expect(slugifyTitle("Hello World  App")).toBe("hello-world-app");
  });

  it("falls back to post-{random} for Chinese/emoji titles", () => {
    const random = () => "abcd1234";
    expect(slugifyTitle("使用 TypeScript 构建博客", random)).toBe("post-abcd1234");
    expect(slugifyTitle("!!!", random)).toBe("post-abcd1234");
  });

  it("uses the injected random source", () => {
    expect(slugifyTitle("中文标题", () => "abcdefgh")).toBe("post-abcdefgh");
  });
});

describe("normalize helpers", () => {
  it("normalizes email to lowercase trimmed", () => {
    expect(normalizeEmail("  Admin@Example.COM ")).toBe("admin@example.com");
  });

  it("collapses whitespace in tag names and preserves case", () => {
    expect(normalizeTagName("  Next   Js ")).toBe("Next Js");
  });
});
