import { describe, expect, it } from "vitest";
import {
  CACHE_NOTICE_SUBJECT,
  cacheNoticeFromStatus,
  cacheNoticeText,
  cacheRefreshWarningText,
  classifyMutationFailure,
  createFlowDisposition,
  createFlowOutcomeOf,
  draftFromPost,
  editorContent,
  editorWriteAllowed,
  emptyEditorDraft,
  evaluateCacheStatus,
  inlineTagErrorMessage,
  mutationErrorMessage,
  mutationNeedsReview,
  parseStoredCacheNotice,
  serializeEditorSnapshot,
} from "@/components/views/admin/editor-state";
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

describe("write recovery decisions (FR-02 / delivery §4.1)", () => {
  it.each([undefined, null, 0, 500, 502])("classifies status %s as an UNKNOWN outcome that needs review", (status) => {
    const result = { error: "failed", status };
    expect(classifyMutationFailure(result)).toBe("unknown");
    expect(mutationNeedsReview(result)).toBe(true);
  });

  it("unique-field conflict 409s are definite rejections the user can fix and resubmit", () => {
    for (const errorCode of [
      "POST_SLUG_EXISTS",
      "CATEGORY_NAME_EXISTS",
      "CATEGORY_SLUG_EXISTS",
      "TAG_NAME_EXISTS",
      "TAG_SLUG_EXISTS",
    ]) {
      const result = { error: "已存在", status: 409, errorCode };
      expect(classifyMutationFailure(result)).toBe("rejection");
      expect(mutationNeedsReview(result)).toBe(false);
    }
  });

  it("only optimistic-version conflicts lock the editor for review", () => {
    for (const errorCode of [
      "POST_CONCURRENT_MODIFICATION",
      "CATEGORY_CONCURRENT_MODIFICATION",
      "TAG_CONCURRENT_MODIFICATION",
    ]) {
      const result = { error: "版本冲突", status: 409, errorCode };
      expect(classifyMutationFailure(result)).toBe("conflict");
      expect(mutationNeedsReview(result)).toBe(true);
    }
  });

  it("a 409 with an unrecognized code stays unknown — the server never proves the write did not commit", () => {
    expect(classifyMutationFailure({ error: "conflict", status: 409 })).toBe("unknown");
    expect(classifyMutationFailure({ error: "conflict", status: 409, errorCode: "SOMETHING_ELSE" })).toBe("unknown");
    expect(mutationNeedsReview({ error: "conflict", status: 409, errorCode: "SOMETHING_ELSE" })).toBe(true);
  });

  it("validation errors and known 404s are definite rejections that keep the editor editable", () => {
    expect(classifyMutationFailure({ error: "invalid title", status: 422 })).toBe("rejection");
    expect(mutationNeedsReview({ error: "invalid title", status: 422 })).toBe(false);
    expect(classifyMutationFailure({ error: "标签不存在", status: 404, errorCode: "TAG_NOT_FOUND" })).toBe("rejection");
    expect(mutationNeedsReview({ error: "标签不存在", status: 404, errorCode: "TAG_NOT_FOUND" })).toBe(false);
  });

  it("identity/permission failures are definite refusals, never treated as content saves", () => {
    for (const result of [
      { error: "请先登录", status: 401, errorCode: "AUTH_REQUIRED" },
      { error: "会话已失效", status: 401, errorCode: "AUTH_INVALID" },
      { error: "账号已停用", status: 403, errorCode: "ADMIN_DISABLED" },
      { error: "无权访问", status: 403, errorCode: "FORBIDDEN" },
    ]) {
      expect(classifyMutationFailure(result)).toBe("auth");
      expect(mutationNeedsReview(result)).toBe(false);
      expect(mutationErrorMessage(result)).toContain("并未保存");
    }
  });

  it("never treats an incomplete success as saved (corrupt 2xx stays unknown)", () => {
    expect(mutationNeedsReview({ error: null, status: 200 })).toBe(true);
    expect(mutationNeedsReview({ error: null, status: 201 })).toBe(true);
    // An unparseable 2xx body proves nothing about the commit (AC-02-04):
    // it must stay unknown so a retry cannot silently repeat a create.
    expect(classifyMutationFailure({ error: "服务器返回了无法识别的数据", status: 200, errorCode: "INVALID_RESPONSE" })).toBe("unknown");
    expect(mutationNeedsReview({ error: "服务器返回了无法识别的数据", status: 200, errorCode: "INVALID_RESPONSE" })).toBe(true);
  });

  it("no longer special-cases phantom codes the server does not emit (FR-02.4)", () => {
    // POST_VERSION_CONFLICT / VERSION_CONFLICT do not exist in src/lib/errors.ts;
    // a 4xx carrying them is just a definite rejection now.
    expect(mutationNeedsReview({ error: "conflict", status: 400, errorCode: "VERSION_CONFLICT" })).toBe(false);
    expect(mutationNeedsReview({ error: "conflict", status: 422, errorCode: "POST_VERSION_CONFLICT" })).toBe(false);
  });

  it("keeps actionable error text and request ID without proposing a blind retry", () => {
    const message = mutationErrorMessage({ error: "版本冲突", status: 409, errorCode: "POST_CONCURRENT_MODIFICATION", requestId: "request-123" });
    expect(message).toContain("版本冲突");
    expect(message).toContain("已保留");
    expect(message).toContain("request-123");
  });

  it("definite rejections tell the user to fix and resubmit instead of demanding review", () => {
    const message = mutationErrorMessage({ error: "文章 slug 已存在", status: 409, errorCode: "POST_SLUG_EXISTS" });
    expect(message).toContain("文章 slug 已存在");
    expect(message).toContain("修改后重新保存");
    expect(message).not.toContain("不要重复提交");
  });

  it("scopes inline duplicate-tag rejections to the tag input (FR-02.3)", () => {
    const message = inlineTagErrorMessage({ error: "标签名已存在", status: 409, errorCode: "TAG_NAME_EXISTS" });
    expect(message).toContain("选择已有标签");
    // Unknown outcomes still escalate to the article-level review path.
    expect(inlineTagErrorMessage({ error: "网络请求失败，请检查连接后重试", status: 0, errorCode: "NETWORK_ERROR" })).toContain("不要重复提交");
  });
});

describe("public cache status header evaluation (FR-03 / delivery §4.2)", () => {
  it("trusts only the three contract values", () => {
    expect(evaluateCacheStatus("invalidated")).toBe("invalidated");
    expect(evaluateCacheStatus("failed")).toBe("failed");
    expect(evaluateCacheStatus("not-required")).toBe("not-required");
  });

  it("treats a missing or illegal header as unknown, never as a successful refresh", () => {
    expect(evaluateCacheStatus(undefined)).toBe("unknown");
    expect(evaluateCacheStatus(null)).toBe("unknown");
    expect(evaluateCacheStatus("")).toBe("unknown");
    expect(evaluateCacheStatus("success")).toBe("unknown");
    expect(evaluateCacheStatus("INVALIDATED")).toBe("unknown");
  });
});

describe("create-flow disposition state machine (FR-01 / AC-01-03/04/05, Codex review round 2)", () => {
  const ID = "11111111-1111-4111-8111-111111111111";
  const EDIT_URL = `/admin/posts/${ID}/edit`;

  it("with no confirmed create, the /new address stays and nothing locks (input preservation is FR-02's job)", () => {
    for (const outcome of ["create-unconfirmed", "created-only", "update-succeeded", "update-rejection", "update-conflict", "update-auth", "update-unknown"] as const) {
      expect(createFlowDisposition({ adoptedId: null, outcome })).toEqual({
        softNavigateTo: null,
        normalizeAddressTo: null,
        writeLock: null,
      });
    }
  });

  it("create-only draft success soft-navigates to /edit (fresh server state)", () => {
    expect(createFlowDisposition({ adoptedId: ID, outcome: "created-only" })).toEqual({
      softNavigateTo: EDIT_URL,
      normalizeAddressTo: null,
      writeLock: null,
    });
  });

  it("create + update success soft-navigates to /edit", () => {
    expect(createFlowDisposition({ adoptedId: ID, outcome: "update-succeeded" })).toEqual({
      softNavigateTo: EDIT_URL,
      normalizeAddressTo: null,
      writeLock: null,
    });
  });

  it("definite rejection (422/409-unique/404…) moves the address to /edit WITHOUT remounting and stays writable (AC-01-03/04)", () => {
    const d = createFlowDisposition({ adoptedId: ID, outcome: "update-rejection" });
    expect(d.softNavigateTo).toBeNull();        // no router.replace → no state loss
    expect(d.normalizeAddressTo).toBe(EDIT_URL); // history.replaceState → address matches identity
    expect(d.writeLock).toBeNull();              // fix-and-retry (PATCH) stays possible
  });

  it("version conflict moves the address to /edit as well; the existing needsReview lock governs recovery", () => {
    const d = createFlowDisposition({ adoptedId: ID, outcome: "update-conflict" });
    expect(d.normalizeAddressTo).toBe(EDIT_URL);
    expect(d.softNavigateTo).toBeNull();
    expect(d.writeLock).toBeNull();
  });

  it.each([
    ["auth failure (401/403) — a fresh /edit GET could bounce to login", "update-auth", "auth"],
    ["unknown outcome — the write may have committed", "update-unknown", "unknown"],
  ])("%s → address normalized AND read-only recovery lock", (_label, outcome, reason) => {
    const d = createFlowDisposition({ adoptedId: ID, outcome: outcome as "update-auth" | "update-unknown" });
    expect(d.softNavigateTo).toBeNull();
    expect(d.normalizeAddressTo).toBe(EDIT_URL);
    expect(d.writeLock).toEqual({ reason, postId: ID });
  });

  it("maps classified failures onto flow outcomes one-to-one", () => {
    expect(createFlowOutcomeOf("rejection")).toBe("update-rejection");
    expect(createFlowOutcomeOf("conflict")).toBe("update-conflict");
    expect(createFlowOutcomeOf("auth")).toBe("update-auth");
    expect(createFlowOutcomeOf("unknown")).toBe("update-unknown");
  });
});

describe("editor write gate (writable-control restriction, Codex review round 2)", () => {
  const openState = { busy: false, saving: false, loading: false, needsReview: false, recoveryLock: null };

  it("allows writes only from a clean idle state", () => {
    expect(editorWriteAllowed(openState)).toBe(true);
  });

  it.each([
    ["a write in flight", { busy: true }],
    ["a save in flight", { saving: true }],
    ["an explicit reload", { loading: true }],
    ["pending review", { needsReview: true }],
    ["the read-only recovery lock", { recoveryLock: { reason: "auth" } }],
  ])("blocks every editor mutation during %s", (_label, patch) => {
    expect(editorWriteAllowed({ ...openState, ...patch })).toBe(false);
  });
});

describe("cache warning handoff via sessionStorage (FR-03, Codex review #3)", () => {
  const marker = (postId: string, kind: string, action: string) =>
    JSON.stringify({ postId, notice: { kind, action } });

  it("treats an absent marker as absent", () => {
    expect(parseStoredCacheNotice(null, "post-1")).toEqual({ kind: "absent" });
    expect(parseStoredCacheNotice("", "post-1")).toEqual({ kind: "absent" });
  });

  it("marks corrupt markers invalid so the caller may drop them", () => {
    expect(parseStoredCacheNotice("{not json", "post-1")).toEqual({ kind: "invalid" });
    expect(parseStoredCacheNotice("42", "post-1")).toEqual({ kind: "invalid" });
    expect(parseStoredCacheNotice(JSON.stringify({ notice: { kind: "failed", action: "save" } }), "post-1")).toEqual({ kind: "invalid" });
    expect(parseStoredCacheNotice(marker("post-1", "weird", "save"), "post-1")).toEqual({ kind: "invalid" });
    expect(parseStoredCacheNotice(marker("post-1", "failed", "not-an-action"), "post-1")).toEqual({ kind: "invalid" });
  });

  it("never hands another article's warning to this editor (mismatch keeps the marker)", () => {
    expect(parseStoredCacheNotice(marker("post-other", "failed", "delete"), "post-1")).toEqual({ kind: "mismatch" });
    // A /new instance (no id) can never consume a stored marker either.
    expect(parseStoredCacheNotice(marker("post-1", "failed", "delete"), null)).toEqual({ kind: "mismatch" });
  });

  it("adopts the warning only on an exact article-id match", () => {
    expect(parseStoredCacheNotice(marker("post-1", "failed", "publish"), "post-1")).toEqual({
      kind: "match",
      notice: { kind: "failed", action: "publish" },
    });
    expect(parseStoredCacheNotice(marker("post-1", "unknown", "save"), "post-1")).toEqual({
      kind: "match",
      notice: { kind: "unknown", action: "save" },
    });
  });
});

describe("cache warning copy and notice construction (FR-03 §4.2.1-2, Codex review #4)", () => {
  it("builds a warning only for failed/unknown refreshes", () => {
    expect(cacheNoticeFromStatus("invalidated", "save")).toBeNull();
    expect(cacheNoticeFromStatus("not-required", "save")).toBeNull();
    expect(cacheNoticeFromStatus("failed", "archive")).toEqual({ kind: "failed", action: "archive" });
    expect(cacheNoticeFromStatus(undefined, "delete")).toEqual({ kind: "unknown", action: "delete" });
    expect(cacheNoticeFromStatus("bogus", "tag")).toEqual({ kind: "unknown", action: "tag" });
  });

  it("wording separates the confirmed write from the refresh outcome and the retry", () => {
    expect(cacheRefreshWarningText("文章已归档", "failed")).toContain("文章已归档，但公开内容刷新失败");
    expect(cacheRefreshWarningText("文章已删除", "unknown")).toContain("公开缓存状态未知");
    expect(cacheNoticeText({ kind: "failed", action: "tag" })).toContain(CACHE_NOTICE_SUBJECT.tag);
    expect(cacheNoticeText({ kind: "failed", action: "archive" })).toContain("重试公开内容刷新");
    expect(cacheNoticeText({ kind: "failed", action: "archive" })).toContain("不会重复提交内容");
  });

  it("keeps a subject for every admin write kind that can fail its refresh", () => {
    for (const action of ["save", "publish", "archive", "restore", "delete", "tag"] as const) {
      expect(typeof CACHE_NOTICE_SUBJECT[action]).toBe("string");
    }
  });
});
