import { describe, expect, it } from "vitest";
import {
  canTransition,
  canHardDelete,
  isSlugEditable,
  validatePublish,
  type PublishCheckInput,
} from "@/modules/post/post-policy";

describe("post state machine", () => {
  it("allows DRAFT→PUBLISHED, PUBLISHED→ARCHIVED, ARCHIVED→DRAFT", () => {
    expect(canTransition("DRAFT", "PUBLISHED")).toBe(true);
    expect(canTransition("PUBLISHED", "ARCHIVED")).toBe(true);
    expect(canTransition("ARCHIVED", "DRAFT")).toBe(true);
  });

  it("rejects all other transitions", () => {
    expect(canTransition("DRAFT", "ARCHIVED")).toBe(false);
    expect(canTransition("PUBLISHED", "DRAFT")).toBe(false);
    expect(canTransition("ARCHIVED", "PUBLISHED")).toBe(false);
    expect(canTransition("DRAFT", "DRAFT")).toBe(false);
  });

  it("only drafts can be hard-deleted", () => {
    expect(canHardDelete("DRAFT")).toBe(true);
    expect(canHardDelete("PUBLISHED")).toBe(false);
    expect(canHardDelete("ARCHIVED")).toBe(false);
  });
});

describe("slug editability", () => {
  it("is editable only before first publish", () => {
    expect(isSlugEditable(null)).toBe(true);
    expect(isSlugEditable(new Date("2026-01-01T00:00:00Z"))).toBe(false);
  });
});

describe("validatePublish", () => {
  const validInput: PublishCheckInput = {
    title: "一篇可发布文章",
    slug: "a-publishable-post",
    excerpt: "摘要",
    contentMd: "正文内容",
    tagCount: 0,
    seoTitle: null,
    seoDescription: null,
    coverImageUrl: null,
    seoImageUrl: null,
    isAuthorActive: true,
    isImageUrlAllowed: () => true,
  };

  it("passes a valid input", () => {
    expect(validatePublish(validInput)).toHaveLength(0);
  });

  it("reports missing required fields", () => {
    const issues = validatePublish({ ...validInput, title: "", excerpt: "", contentMd: "" });
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("TITLE_EMPTY");
    expect(codes).toContain("EXCERPT_EMPTY");
    expect(codes).toContain("CONTENT_EMPTY");
  });

  it("rejects an invalid slug", () => {
    const issues = validatePublish({ ...validInput, slug: "BAD slug" });
    expect(issues.some((i) => i.code === "SLUG_FORMAT")).toBe(true);
  });

  it("rejects unsafe image URLs via the injected policy", () => {
    const issues = validatePublish({
      ...validInput,
      coverImageUrl: "https://evil.example.com/x.png",
      isImageUrlAllowed: () => false,
    });
    expect(issues.some((i) => i.code === "COVER_IMAGE_NOT_ALLOWED")).toBe(true);
  });

  it("rejects an inactive author and too many tags", () => {
    const issues = validatePublish({ ...validInput, tagCount: 11, isAuthorActive: false });
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("TOO_MANY_TAGS");
    expect(codes).toContain("AUTHOR_INACTIVE");
  });
});
