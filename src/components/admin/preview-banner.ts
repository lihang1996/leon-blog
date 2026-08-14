import type { PostStatus } from "@/modules/post/post-policy";

const PREVIEW_BANNER: Record<PostStatus, string> = {
  DRAFT: "草稿预览 · 仅管理员可见",
  PUBLISHED: "已发布预览 · 仅管理员可见",
  ARCHIVED: "已归档预览 · 仅管理员可见",
};

export function previewBannerLabel(status: PostStatus): string {
  return PREVIEW_BANNER[status];
}
