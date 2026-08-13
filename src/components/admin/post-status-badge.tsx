import type { PostStatus } from "@/modules/post";

const STATUS_MAP: Record<PostStatus, { label: string; className: string }> = {
  DRAFT: { label: "草稿", className: "border-border bg-bg text-text-muted" },
  PUBLISHED: { label: "已发布", className: "border-success/40 bg-success/10 text-success" },
  ARCHIVED: { label: "已归档", className: "border-warning/40 bg-warning/10 text-warning" },
};

export function PostStatusBadge({ status }: { status: PostStatus }) {
  const meta = STATUS_MAP[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}
