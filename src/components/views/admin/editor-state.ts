import type { AdminPostItem } from "@/lib/client-api";

export interface EditorDraft {
  title: string;
  slug: string;
  excerpt: string;
  contentMd: string;
  categoryId: string;
  tagIds: string[];
  seoTitle: string;
  seoDescription: string;
  coverImageUrl: string;
  seoImageUrl: string;
}

export function emptyEditorDraft(): EditorDraft {
  return {
    title: "", slug: "", excerpt: "", contentMd: "", categoryId: "", tagIds: [],
    seoTitle: "", seoDescription: "", coverImageUrl: "", seoImageUrl: "",
  };
}

export function draftFromPost(post: AdminPostItem): EditorDraft {
  return {
    title: post.title ?? "", slug: post.slug ?? "", excerpt: post.excerpt ?? "",
    contentMd: post.contentMd ?? "", categoryId: post.categoryId ?? "",
    tagIds: [...(post.tagIds ?? [])], seoTitle: post.seoTitle ?? "",
    seoDescription: post.seoDescription ?? "", coverImageUrl: post.coverImageUrl ?? "",
    seoImageUrl: post.seoImageUrl ?? "",
  };
}

export function serializeEditorSnapshot(draft: EditorDraft): string {
  return JSON.stringify({ ...draft, tagIds: [...draft.tagIds].sort() });
}

export function editorContent(draft: EditorDraft, publishedBefore: boolean) {
  return {
    title: draft.title.trim(), excerpt: draft.excerpt.trim(), contentMd: draft.contentMd.trim(),
    ...(!publishedBefore ? { slug: draft.slug.trim() || undefined } : {}),
    categoryId: draft.categoryId || null, tagIds: [...draft.tagIds],
    seoTitle: draft.seoTitle.trim() || null, seoDescription: draft.seoDescription.trim() || null,
    coverImageUrl: draft.coverImageUrl.trim() || null, seoImageUrl: draft.seoImageUrl.trim() || null,
  };
}

export interface MutationFailure {
  error: string | null;
  errorCode?: string | null;
  status?: number | null;
  requestId?: string | null;
}

export function mutationNeedsReview(result: MutationFailure): boolean {
  // A transport error or server error cannot prove that the write did not commit.
  return !result.error || !result.status || result.status >= 500 || result.status === 409 || result.errorCode === "POST_VERSION_CONFLICT" || result.errorCode === "VERSION_CONFLICT";
}

export function mutationErrorMessage(result: MutationFailure): string {
  const message = result.error || "响应不完整，无法确认操作结果";
  const guidance = mutationNeedsReview(result)
    ? " 当前输入已保留；请先核对服务器内容，不要重复提交。重新加载会要求确认丢弃当前输入。"
    : "";
  return `${message}${guidance}${result.requestId ? `（请求 ID：${result.requestId}）` : ""}`;
}
