import { describe, expect, it } from "vitest";
import { emptyEditorDraft } from "@/components/views/admin/editor-state";
import {
  EDITOR_FIELD_INPUT_IDS,
  EDITOR_LIMITS,
  editorFieldInputId,
  firstErroredField,
  mapMutationFailureToFields,
  seoSectionNeedsExpand,
  validateEditorDraft,
} from "@/components/views/admin/editor-validation";

function draftWith(overrides: Partial<ReturnType<typeof emptyEditorDraft>>) {
  return { ...emptyEditorDraft(), title: "标题", excerpt: "摘要", contentMd: "正文", ...overrides };
}

describe("validateEditorDraft (FR-07 client-side limits mirror the server)", () => {
  it("accepts 120-char titles and 300-char excerpts, rejects 121/301 (AC-07-01)", () => {
    expect(validateEditorDraft(draftWith({ title: "a".repeat(120) }), { slugLocked: false })).toEqual({});
    expect(validateEditorDraft(draftWith({ excerpt: "b".repeat(300) }), { slugLocked: false })).toEqual({});

    const longTitle = validateEditorDraft(draftWith({ title: "a".repeat(121) }), { slugLocked: false });
    expect(longTitle.title).toContain("标题不能超过 120");
    const longExcerpt = validateEditorDraft(draftWith({ excerpt: "b".repeat(301) }), { slugLocked: false });
    expect(longExcerpt.excerpt).toContain("摘要不能超过 300");
  });

  it("flags multiple fields at once with each field's Chinese message (AC-07-02)", () => {
    const errors = validateEditorDraft(draftWith({ title: "", excerpt: "", contentMd: "" }), { slugLocked: false });
    expect(errors.title).toContain("请填写标题");
    expect(errors.excerpt).toContain("请填写摘要");
    expect(errors.contentMd).toContain("请填写正文");
  });

  it("blank input around a too-long value still reports the length error, keeping the input", () => {
    const errors = validateEditorDraft(draftWith({ title: ` ${"a".repeat(121)} ` }), { slugLocked: false });
    expect(errors.title).toContain("当前 121");
  });

  it("slug rules: over-length, illegal format, reserved path (AC-07-04)", () => {
    expect(validateEditorDraft(draftWith({ slug: "x".repeat(161) }), { slugLocked: false }).slug).toContain("160");
    expect(validateEditorDraft(draftWith({ slug: "Not-Lower" }), { slugLocked: false }).slug).toContain("小写字母");
    expect(validateEditorDraft(draftWith({ slug: "-lead" }), { slugLocked: false }).slug).toBeTruthy();
    // Reserved path — mirror of the server's isAcceptableSlug.
    expect(validateEditorDraft(draftWith({ slug: "admin" }), { slugLocked: false }).slug).toContain("保留");
    // Locked (published before): the slug is no longer editable, so no error.
    expect(validateEditorDraft(draftWith({ slug: "Not-Lower" }), { slugLocked: true }).slug).toBeUndefined();
  });

  it("SEO over-limit errors are field-scoped (AC-07-02)", () => {
    const errors = validateEditorDraft(draftWith({
      seoTitle: "t".repeat(61),
      seoDescription: "d".repeat(161),
    }), { slugLocked: false });
    expect(errors.seoTitle).toContain("SEO 标题不能超过 60");
    expect(errors.seoDescription).toContain("SEO 描述不能超过 160");
  });

  it("image URLs must be site-absolute or https and bounded", () => {
    expect(validateEditorDraft(draftWith({ coverImageUrl: "http://insecure.example/x.png" }), { slugLocked: false }).coverImageUrl)
      .toContain("https");
    expect(validateEditorDraft(draftWith({ seoImageUrl: "/uploads/ok.png" }), { slugLocked: false }).seoImageUrl).toBeUndefined();
    expect(validateEditorDraft(draftWith({ seoImageUrl: `https://x/${"a".repeat(2100)}` }), { slugLocked: false }).seoImageUrl)
      .toContain("2048");
  });

  it("content length counts raw characters against the 204800 cap", () => {
    expect(validateEditorDraft(draftWith({ contentMd: "x".repeat(EDITOR_LIMITS.contentMd + 1) }), { slugLocked: false }).contentMd)
      .toContain("正文不能超过 204800");
  });
});

describe("mapMutationFailureToFields (server detail mapping, AC-07-03)", () => {
  it("maps create-path zod details (`title`) onto the title field", () => {
    const mapped = mapMutationFailureToFields({
      error: "输入校验失败", status: 422, errorCode: "VALIDATION_FAILED",
      details: [{ path: "title", message: "标题不能超过 120 个字符" }],
    });
    expect(mapped.fieldErrors.title).toContain("120");
    expect(mapped.summary).toEqual([]);
  });

  it("maps update-path `content.title` onto the SAME title field", () => {
    const mapped = mapMutationFailureToFields({
      error: "输入校验失败", status: 422, errorCode: "VALIDATION_FAILED",
      details: [{ path: "content.title", message: "标题不能超过 120 个字符" }],
    });
    expect(mapped.fieldErrors.title).toBeTruthy();
  });

  it("maps array paths like `tagIds.3` onto the tagIds field", () => {
    const mapped = mapMutationFailureToFields({
      error: "输入校验失败", status: 422, errorCode: "VALIDATION_FAILED",
      details: [{ path: "tagIds.3", message: "无效的 UUID" }],
    });
    expect(mapped.fieldErrors.tagIds).toBeTruthy();
  });

  it("maps server policy issue codes (TITLE_TOO_LONG, SEO_TITLE_TOO_LONG…) to their fields", () => {
    const mapped = mapMutationFailureToFields({
      error: "标签不能超过 10 个", status: 422, errorCode: "POST_NOT_READY",
      details: [
        { code: "TOO_MANY_TAGS", message: "标签不能超过 10 个" },
        { code: "SEO_TITLE_TOO_LONG", message: "SEO 标题不能超过 60 个字符" },
        { code: "MARKDOWN_IMAGE_NOT_ALLOWED", message: "正文图片必须是站内地址或白名单内的 HTTPS 地址" },
      ],
    });
    expect(mapped.fieldErrors.tagIds).toBeTruthy();
    expect(mapped.fieldErrors.seoTitle).toBeTruthy();
    expect(mapped.fieldErrors.contentMd).toBeTruthy();
  });

  it("unknown paths and unrecognized details land in the summary, never vanish (FR-07.6)", () => {
    const mapped = mapMutationFailureToFields({
      error: "输入校验失败", status: 422, errorCode: "VALIDATION_FAILED",
      details: [{ path: "mystery.field", message: "未知原因" }, { weird: true }, "杂项"],
    });
    expect(mapped.fieldErrors).toEqual({});
    expect(mapped.summary.some((line) => line.includes("未知原因"))).toBe(true);
  });

  it("business code POST_SLUG_EXISTS maps to the slug field with friendly copy", () => {
    const mapped = mapMutationFailureToFields({ error: "slug 已存在", status: 409, errorCode: "POST_SLUG_EXISTS" });
    expect(mapped.fieldErrors.slug).toContain("已被其他文章使用");
  });

  it("413 maps to a clear body-too-large explanation, not a generic field error (AC-07-04)", () => {
    const mapped = mapMutationFailureToFields({ error: "请求体过大", status: 413, errorCode: "HTTP_ERROR" });
    expect(mapped.fieldErrors.contentMd).toContain("413");
  });
});

describe("field-error helpers", () => {
  it("firstErroredField follows the UI order", () => {
    expect(firstErroredField({ seoTitle: "x", title: "y" })).toBe("title");
    expect(firstErroredField({ seoDescription: "x" })).toBe("seoDescription");
    expect(firstErroredField({})).toBeNull();
  });

  it("seoSectionNeedsExpand is true for SEO-section fields only", () => {
    expect(seoSectionNeedsExpand({ title: "x" })).toBe(false);
    expect(seoSectionNeedsExpand({ seoTitle: "x" })).toBe(true);
    expect(seoSectionNeedsExpand({ coverImageUrl: "x", slug: "y" })).toBe(true);
  });
});

describe("editorFieldInputId (FR-07.3 focus mapping)", () => {
  it("maps every hyphenated input id — camelCase field names must not be string-interpolated", () => {
    expect(editorFieldInputId("seoTitle")).toBe("editor-seo-title");
    expect(editorFieldInputId("seoDescription")).toBe("editor-seo-description");
    expect(editorFieldInputId("coverImageUrl")).toBe("editor-cover-url");
    expect(editorFieldInputId("seoImageUrl")).toBe("editor-share-url");
    expect(editorFieldInputId("contentMd")).toBe("editor-content");
    expect(editorFieldInputId("title")).toBe("editor-title");
    expect(editorFieldInputId("excerpt")).toBe("editor-excerpt");
    expect(editorFieldInputId("slug")).toBe("editor-slug");
    expect(editorFieldInputId("categoryId")).toBe("editor-category");
  });

  it("fields without a single focusable input return null instead of a wrong id", () => {
    expect(editorFieldInputId("tagIds")).toBeNull();
  });

  it("no mapped id accidentally equals the camelCase interpolation the old code produced", () => {
    // Regression guard for the round-1 bug: `editor-${field}` produced
    // editor-seoTitle / editor-seoDescription etc., which match no input.
    for (const id of Object.values(EDITOR_FIELD_INPUT_IDS)) {
      expect(id).not.toMatch(/[A-Z]/);
    }
  });
});
