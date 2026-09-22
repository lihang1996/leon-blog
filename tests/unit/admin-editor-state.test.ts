import { describe, expect, it } from "vitest";
import { draftFromPost, editorContent, emptyEditorDraft, mutationErrorMessage, mutationNeedsReview, serializeEditorSnapshot } from "@/components/views/admin/editor-state";
import type { AdminPostItem } from "@/lib/client-api";

const post: AdminPostItem = {
  id: "post-1", version: 4, title: "Title", slug: "title", excerpt: "Excerpt", contentMd: "Body",
  status: "DRAFT", categoryId: null, tagIds: [], publishedAt: null,
};

describe("editor snapshot and payload helpers", () => {
  it("starts blank and clean, and detects clearing or reverting a field", () => {
    const blank = emptyEditorDraft();
    const baseline = serializeEditorSnapshot(blank);
    expect(serializeEditorSnapshot(emptyEditorDraft())).toBe(baseline);
    expect(serializeEditorSnapshot({ ...blank, title: "A" })).not.toBe(baseline);
    expect(serializeEditorSnapshot({ ...blank, title: "" })).toBe(baseline);
  });

  it("treats tag selection as a set without mutating input order", () => {
    const draft = { ...emptyEditorDraft(), tagIds: ["b", "a"] };
    expect(serializeEditorSnapshot(draft)).toBe(serializeEditorSnapshot({ ...draft, tagIds: ["a", "b"] }));
    expect(draft.tagIds).toEqual(["b", "a"]);
  });

  it("every editable field participates in dirty detection", () => {
    const blank = emptyEditorDraft();
    const saved = serializeEditorSnapshot(blank);
    for (const key of Object.keys(blank) as (keyof typeof blank)[]) {
      expect(serializeEditorSnapshot({ ...blank, [key]: key === "tagIds" ? ["tag"] : "edited" })).not.toBe(saved);
    }
  });

  it("saved snapshots are immutable and cannot mark later edits clean", () => {
    const draft = draftFromPost(post);
    const submitted = serializeEditorSnapshot(draft);
    draft.contentMd = "typed after submission";
    draft.tagIds.push("new-tag");
    expect(serializeEditorSnapshot(draft)).not.toBe(submitted);
    expect(JSON.parse(submitted).contentMd).toBe("Body");
    expect(JSON.parse(submitted).tagIds).toEqual([]);
  });

  it("loads null fields as empty, with no previous identity leaking in", () => {
    const first = draftFromPost({ ...post, categoryId: "old-category", tagIds: ["old-tag"], seoTitle: "Old" });
    const next = draftFromPost(post);
    expect(first.categoryId).toBe("old-category");
    expect(next).toMatchObject({ categoryId: "", tagIds: [], seoTitle: "", coverImageUrl: "", seoImageUrl: "" });
    expect(next.tagIds).not.toBe(post.tagIds);
  });

  it("sends explicit nulls for cleared optional fields and preserves published slugs", () => {
    const draft = { ...emptyEditorDraft(), title: " Title ", excerpt: " Excerpt ", contentMd: " Body ", slug: " new-slug " };
    expect(editorContent(draft, false)).toMatchObject({ title: "Title", excerpt: "Excerpt", contentMd: "Body", slug: "new-slug", categoryId: null, seoTitle: null, seoDescription: null, coverImageUrl: null, seoImageUrl: null });
    expect(editorContent(draft, true)).not.toHaveProperty("slug");
    expect(editorContent(emptyEditorDraft(), false).slug).toBeUndefined();
  });
});

describe("write recovery decisions", () => {
  it.each([undefined, null, 0, 409, 500, 502])("requires explicit review for status %s", (status) => {
    expect(mutationNeedsReview({ error: "failed", status })).toBe(true);
  });

  it("does not lock known validation rejections, but never treats incomplete success as saved", () => {
    expect(mutationNeedsReview({ error: "invalid title", status: 422 })).toBe(false);
    expect(mutationNeedsReview({ error: null, status: 200 })).toBe(true);
    expect(mutationNeedsReview({ error: "conflict", status: 400, errorCode: "VERSION_CONFLICT" })).toBe(true);
  });

  it("keeps actionable error text and request ID without proposing a blind retry", () => {
    const message = mutationErrorMessage({ error: "版本冲突", status: 409, requestId: "request-123" });
    expect(message).toContain("版本冲突");
    expect(message).toContain("当前输入已保留");
    expect(message).toContain("不要重复提交");
    expect(message).toContain("request-123");
  });
});
