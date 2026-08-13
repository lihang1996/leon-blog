import { describe, expect, it } from "vitest";
import { mapErrorToFields } from "@/components/admin/post-form-errors";

/**
 * Regression guard for the review finding: after `handleApiError` started
 * passing `error.details` through, the editor must not crash on business-rule
 * ValidationIssues which carry `{ code, message }` and no `path`. Unmapped
 * issues fall through to a global message instead of throwing.
 */
describe("mapErrorToFields", () => {
  it("maps business ValidationIssue codes to editor fields", () => {
    const result = mapErrorToFields([
      { code: "EXCERPT_EMPTY", message: "摘要不能为空" },
      { code: "COVER_IMAGE_NOT_ALLOWED", message: "封面图片必须是白名单内的 HTTPS 地址" },
    ]);
    expect(result).toEqual({
      excerpt: "摘要不能为空",
      coverImageUrl: "封面图片必须是白名单内的 HTTPS 地址",
    });
  });

  it("maps Zod issues by path", () => {
    const result = mapErrorToFields([{ path: "seoTitle", message: "SEO 标题不能超过 60 个字符" }]);
    expect(result).toEqual({ seoTitle: "SEO 标题不能超过 60 个字符" });
  });

  it("does not throw on `{code,message}` issues without a path (the regression)", () => {
    expect(() => mapErrorToFields([{ code: "SLUG_FORMAT", message: "slug 格式不正确" }])).not.toThrow();
    expect(mapErrorToFields([{ code: "SLUG_FORMAT", message: "slug 格式不正确" }])).toEqual({ slug: "slug 格式不正确" });
  });

  it("returns an empty object when no issue resolves to a field", () => {
    expect(mapErrorToFields([{ code: "AUTHOR_INACTIVE", message: "作者账号已停用" }])).toEqual({});
    expect(mapErrorToFields([{ code: "SOME_UNKNOWN_CODE", message: "x" }])).toEqual({});
    expect(mapErrorToFields(undefined)).toEqual({});
  });

  it("keeps the LAST message for a duplicated field and drops empty paths", () => {
    expect(mapErrorToFields([{ path: "", message: "x" }])).toEqual({});
    expect(
      mapErrorToFields([
        { code: "TITLE_EMPTY", message: "第一个" },
        { path: "title", message: "第二个" },
      ]),
    ).toEqual({ title: "第二个" });
  });

  it("ignores unknown paths and still uses a recognized business code", () => {
    expect(mapErrorToFields([{ path: "payload.unknown", message: "x" }])).toEqual({});
    expect(
      mapErrorToFields([
        { path: "payload.unknown", code: "SLUG_FORMAT", message: "slug 格式不正确" },
      ]),
    ).toEqual({ slug: "slug 格式不正确" });
  });
});
