import { tagService } from "@/modules/tag";
import { requireAdmin } from "@/lib/auth/require-admin";
import { TagManager } from "@/components/admin/tag-manager";

export default async function AdminTagsPage() {
  await requireAdmin();
  const tags = await tagService.listAdminTags();

  return (
    <div>
      <h1 className="font-serif-cn text-2xl font-bold md:text-3xl">标签管理</h1>
      <p className="mt-2 text-sm text-text-muted">删除标签仅移除文章关联，不会删除文章。</p>
      <div className="mt-6">
        <TagManager initialTags={tags} />
      </div>
    </div>
  );
}
