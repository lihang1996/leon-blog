"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AdminPostDTO } from "@/modules/post";
import type { AdminCategoryDTO } from "@/modules/category";
import type { AdminTagDTO } from "@/modules/tag";
import { Button } from "@/components/ui/button";
import { FormField, adminInputClass } from "@/components/admin/form-field";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { mapErrorToFields } from "@/components/admin/post-form-errors";

/**
 * Post editor (UI spec §8.2 / architecture §6.2). Single client form writing
 * through the admin Route Handlers; success triggers router.refresh() so the
 * next server render reads fresh data. Slug is locked once the post has ever
 * been published. Preview opens the protected preview page in a new tab.
 */

type ApiError = {
  code?: string;
  message?: string;
  details?: { path?: string; code?: string; message: string }[];
};

type Props = {
  post?: AdminPostDTO | null;
  categories: AdminCategoryDTO[];
  tags: AdminTagDTO[];
};

type FieldErrors = Partial<Record<keyof ReturnType<typeof collectContent> | "global", string>>;

const POST_CODE_FIELDS: Readonly<Record<string, keyof FieldErrors>> = {
  POST_SLUG_EXISTS: "slug",
  CATEGORY_NOT_FOUND: "categoryId",
  TAG_NOT_FOUND: "tagIds",
};

function describedBy(...ids: Array<string | false | null | undefined>): string | undefined {
  const value = ids.filter(Boolean).join(" ");
  return value || undefined;
}

function collectContent(state: {
  title: string;
  excerpt: string;
  contentMd: string;
  slug: string;
  categoryId: string;
  tagIds: string[];
  coverImageUrl: string;
  seoTitle: string;
  seoDescription: string;
  seoImageUrl: string;
}) {
  return {
    title: state.title.trim(),
    excerpt: state.excerpt.trim(),
    contentMd: state.contentMd,
    slug: state.slug.trim() || undefined,
    categoryId: state.categoryId || null,
    tagIds: state.tagIds,
    coverImageUrl: state.coverImageUrl.trim() || null,
    seoTitle: state.seoTitle.trim() || null,
    seoDescription: state.seoDescription.trim() || null,
    seoImageUrl: state.seoImageUrl.trim() || null,
  };
}

export function PostForm({ post: initialPost, categories, tags }: Props) {
  const router = useRouter();
  const [post, setPost] = useState<AdminPostDTO | null>(initialPost ?? null);
  const [title, setTitle] = useState(initialPost?.title ?? "");
  const [slug, setSlug] = useState(initialPost?.slug ?? "");
  const [excerpt, setExcerpt] = useState(initialPost?.excerpt ?? "");
  const [contentMd, setContentMd] = useState(initialPost?.contentMd ?? "");
  const [categoryId, setCategoryId] = useState(initialPost?.categoryId ?? "");
  const [tagIds, setTagIds] = useState<string[]>(initialPost?.tagIds ?? []);
  const [coverImageUrl, setCoverImageUrl] = useState(initialPost?.coverImageUrl ?? "");
  const [seoTitle, setSeoTitle] = useState(initialPost?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(initialPost?.seoDescription ?? "");
  const [seoImageUrl, setSeoImageUrl] = useState(initialPost?.seoImageUrl ?? "");

  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const seoDetailsRef = useRef<HTMLDetailsElement>(null);

  const slugLocked = post !== null && post.publishedAt !== null;
  const status = post?.status ?? "DRAFT";
  const isArchived = status === "ARCHIVED";
  const isPublished = status === "PUBLISHED";
  const tagLimitReached = tagIds.length >= 10;
  const hasSeoError = Boolean(errors.seoTitle || errors.seoDescription || errors.seoImageUrl);

  useEffect(() => {
    if (hasSeoError && seoDetailsRef.current) seoDetailsRef.current.open = true;
  }, [hasSeoError]);

  const currentContent = () =>
    collectContent({ title, slug, excerpt, contentMd, categoryId, tagIds, coverImageUrl, seoTitle, seoDescription, seoImageUrl });

  function applyError(error: ApiError) {
    // Validation details and top-level business conflicts share the same field
    // channel so every recoverable input error receives aria-invalid/error UI.
    const next = mapErrorToFields(error.details) as FieldErrors;
    const topLevelField = error.code ? POST_CODE_FIELDS[error.code] : undefined;
    if (topLevelField && !next[topLevelField]) {
      next[topLevelField] = error.message ?? "输入内容无效";
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setErrors({ global: error.message ?? "操作失败，请重试" });
  }

  async function run<T>(action: string, url: string, init: RequestInit): Promise<{ data?: T; error?: ApiError }> {
    setBusy(action);
    setErrors({});
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
      const json = await res.json().catch(() => null);
      if (res.ok) return { data: json?.data ?? null };
      return { error: (json?.error as ApiError) ?? { message: "请求失败" } };
    } catch {
      return { error: { message: "网络错误，请重试" } };
    } finally {
      setBusy(null);
    }
  }

  async function ensureDraftId(): Promise<string | null> {
    if (post) return post.id;
    const result = await run<AdminPostDTO>("save", "/api/v1/admin/posts", {
      method: "POST",
      body: JSON.stringify(currentContent()),
    });
    if (result.error) {
      applyError(result.error);
      return null;
    }
    if (result.data) {
      setPost(result.data);
      router.replace(`/admin/posts/${result.data.id}/edit`);
      return result.data.id;
    }
    return null;
  }

  async function handleSave() {
    const id = await ensureDraftId();
    if (!id) return;
    const result = await run<AdminPostDTO>("save", `/api/v1/admin/posts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ content: currentContent() }),
    });
    if (result.error) {
      applyError(result.error);
      return;
    }
    if (result.data) setPost(result.data);
    router.refresh();
  }

  async function handlePublish() {
    const id = await ensureDraftId();
    if (!id) return;
    const result = await run<AdminPostDTO>("publish", `/api/v1/admin/posts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ content: currentContent(), action: "publish" }),
    });
    if (result.error) {
      applyError(result.error);
      return;
    }
    if (result.data) setPost(result.data);
    router.push(`/admin/posts/${id}/edit`);
    router.refresh();
  }

  async function handleTransition(action: "archive" | "restore") {
    if (!post) return;
    const result = await run<AdminPostDTO>(action, `/api/v1/admin/posts/${post.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    });
    if (result.error) {
      applyError(result.error);
      return;
    }
    if (result.data) setPost(result.data);
    router.refresh();
  }

  async function handleDelete() {
    if (!post) return;
    const result = await run<null>("delete", `/api/v1/admin/posts/${post.id}`, { method: "DELETE" });
    if (result.error) {
      setConfirmDelete(false);
      applyError(result.error);
      return;
    }
    router.push("/admin/posts");
    router.refresh();
  }

  function toggleTag(tagId: string) {
    setTagIds((current) => {
      if (current.includes(tagId)) return current.filter((id) => id !== tagId);
      if (current.length >= 10) return current;
      return [...current, tagId];
    });
  }

  const previewUrl = post ? `/admin/posts/${post.id}/preview` : null;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void handleSave();
      }}
      noValidate
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Left: content */}
        <div className="space-y-5">
          <FormField label="标题" htmlFor="post-title" error={errors.title}>
            <input
              id="post-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              required
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={describedBy(errors.title && "post-title-error")}
              className={adminInputClass}
            />
          </FormField>

          <FormField label="摘要" htmlFor="post-excerpt" error={errors.excerpt}>
            <textarea
              id="post-excerpt"
              value={excerpt}
              onChange={(event) => setExcerpt(event.target.value)}
              maxLength={300}
              rows={2}
              required
              aria-invalid={errors.excerpt ? true : undefined}
              aria-describedby={describedBy(errors.excerpt && "post-excerpt-error")}
              className={`${adminInputClass} h-auto py-2`}
            />
          </FormField>

          <FormField
            label="正文（Markdown）"
            htmlFor="post-content"
            error={errors.contentMd}
            hint="支持标题、列表、引用、链接、图片与代码块；不执行原始 HTML。"
          >
            <textarea
              id="post-content"
              value={contentMd}
              onChange={(event) => setContentMd(event.target.value)}
              rows={18}
              required
              aria-invalid={errors.contentMd ? true : undefined}
              aria-describedby={describedBy("post-content-hint", errors.contentMd && "post-content-error")}
              className={`${adminInputClass} h-auto py-2 font-mono text-sm leading-relaxed`}
            />
          </FormField>
        </div>

        {/* Right: metadata + actions */}
        <div className="space-y-5">
          <FormField
            label="Slug"
            htmlFor="post-slug"
            error={errors.slug}
            hint={slugLocked ? "文章发布后 slug 不可修改" : "留空则根据标题自动生成"}
          >
            <input
              id="post-slug"
              type="text"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              maxLength={160}
              disabled={slugLocked}
              aria-invalid={errors.slug ? true : undefined}
              aria-describedby={describedBy("post-slug-hint", errors.slug && "post-slug-error")}
              className={`${adminInputClass} disabled:cursor-not-allowed disabled:bg-bg disabled:text-text-muted`}
            />
          </FormField>

          <FormField label="分类" htmlFor="post-category" error={errors.categoryId}>
            <select
              id="post-category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              aria-invalid={errors.categoryId ? true : undefined}
              aria-describedby={describedBy(errors.categoryId && "post-category-error")}
              className={adminInputClass}
            >
              <option value="">无分类</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </FormField>

          <fieldset
            aria-describedby={["post-tags-limit", errors.tagIds ? "post-tags-error" : null].filter(Boolean).join(" ")}
            aria-invalid={errors.tagIds ? true : undefined}
          >
            <legend className="block text-sm font-medium text-text">标签（最多 10 个）</legend>
            <div
              className={`mt-1.5 max-h-44 space-y-1 overflow-y-auto rounded-md border bg-surface p-2 ${
                errors.tagIds ? "border-danger" : "border-border"
              }`}
            >
              {tags.length === 0 ? (
                <p className="px-2 py-1 text-xs text-text-muted">还没有标签，请先在“标签”页创建。</p>
              ) : (
                tags.map((tag) => {
                  const checked = tagIds.includes(tag.id);
                  const disabled = tagLimitReached && !checked;
                  return (
                    <label
                      key={tag.id}
                      className={`focus-choice flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
                        disabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-bg"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        aria-describedby="post-tags-limit"
                        onChange={() => toggleTag(tag.id)}
                        className="h-4 w-4 accent-[var(--color-accent)]"
                      />
                      <span>#{tag.name}</span>
                    </label>
                  );
                })
              )}
            </div>
            <p id="post-tags-limit" role={tagLimitReached ? "status" : undefined} className="mt-1 text-xs text-text-muted">
              {tagLimitReached ? "已选择 10 个标签；取消一个已选标签后可继续选择。" : `还可选择 ${10 - tagIds.length} 个标签。`}
            </p>
            {errors.tagIds ? (
              <p id="post-tags-error" role="alert" className="mt-1 text-xs text-danger">
                {errors.tagIds}
              </p>
            ) : null}
          </fieldset>

          <FormField label="封面图片 URL" htmlFor="post-cover" error={errors.coverImageUrl} hint="仅接受白名单内的 HTTPS 图片地址">
            <input
              id="post-cover"
              type="url"
              value={coverImageUrl}
              onChange={(event) => setCoverImageUrl(event.target.value)}
              aria-invalid={errors.coverImageUrl ? true : undefined}
              aria-describedby={describedBy("post-cover-hint", errors.coverImageUrl && "post-cover-error")}
              className={adminInputClass}
            />
          </FormField>

          <details ref={seoDetailsRef} className="rounded-md border border-border bg-surface p-3">
            <summary className="focus-disclosure -m-1 cursor-pointer rounded p-1 text-sm font-medium text-text">
              SEO 设置{hasSeoError ? <span className="ml-2 text-danger">（有错误）</span> : null}
            </summary>
            <div className="mt-4 space-y-4">
              <FormField label="SEO 标题" htmlFor="post-seo-title" error={errors.seoTitle} hint="最多 60 字，留空用文章标题">
                <input
                  id="post-seo-title"
                  type="text"
                  value={seoTitle}
                  onChange={(event) => setSeoTitle(event.target.value)}
                  maxLength={60}
                  aria-invalid={errors.seoTitle ? true : undefined}
                  aria-describedby={describedBy("post-seo-title-hint", errors.seoTitle && "post-seo-title-error")}
                  className={adminInputClass}
                />
              </FormField>
              <FormField
                label="SEO 描述"
                htmlFor="post-seo-desc"
                error={errors.seoDescription}
                hint="最多 160 字，留空用摘要"
              >
                <textarea
                  id="post-seo-desc"
                  value={seoDescription}
                  onChange={(event) => setSeoDescription(event.target.value)}
                  maxLength={160}
                  rows={3}
                  aria-invalid={errors.seoDescription ? true : undefined}
                  aria-describedby={describedBy("post-seo-desc-hint", errors.seoDescription && "post-seo-desc-error")}
                  className={`${adminInputClass} h-auto py-2`}
                />
              </FormField>
              <FormField label="分享图片 URL" htmlFor="post-seo-image" error={errors.seoImageUrl}>
                <input
                  id="post-seo-image"
                  type="url"
                  value={seoImageUrl}
                  onChange={(event) => setSeoImageUrl(event.target.value)}
                  aria-invalid={errors.seoImageUrl ? true : undefined}
                  aria-describedby={describedBy(errors.seoImageUrl && "post-seo-image-error")}
                  className={adminInputClass}
                />
              </FormField>
            </div>
          </details>

          {errors.global ? (
            <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {errors.global}
            </p>
          ) : null}

          <div className="rounded-md border border-border bg-surface p-3">
            <p className="text-xs text-text-muted">当前状态：{status === "DRAFT" ? "草稿" : status === "PUBLISHED" ? "已发布" : "已归档"}</p>
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div className="sticky bottom-0 mt-8 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-bg/95 px-4 py-4 backdrop-blur md:-mx-8 md:px-8">
        <Button type="button" pending={busy === "save"} onClick={() => void handleSave()}>
          保存草稿
        </Button>
        {previewUrl ? (
          <Button type="button" variant="secondary" onClick={() => window.open(previewUrl, "_blank", "noopener")}>
            预览
          </Button>
        ) : (
          <Button type="button" variant="secondary" disabled title="请先保存草稿">
            预览
          </Button>
        )}
        {isArchived ? (
          <Button type="button" variant="secondary" pending={busy === "restore"} onClick={() => void handleTransition("restore")}>
            恢复草稿
          </Button>
        ) : status === "DRAFT" ? (
          // Only drafts can be published — a PUBLISHED post has no publish action.
          <Button type="button" pending={busy === "publish"} onClick={() => void handlePublish()}>
            发布
          </Button>
        ) : null}
        {isPublished ? (
          <Button type="button" variant="secondary" pending={busy === "archive"} onClick={() => void handleTransition("archive")}>
            下线归档
          </Button>
        ) : null}
        <span className="flex-1" />
        {post && !isPublished && status !== "ARCHIVED" ? (
          <Button type="button" variant="danger" onClick={() => setConfirmDelete(true)}>
            删除草稿
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="删除这篇草稿？"
        description="删除后不可恢复。已发布或已归档文章不能删除。"
        confirmLabel="删除"
        danger
        pending={busy === "delete"}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </form>
  );
}
