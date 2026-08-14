import { categoryService } from "@/modules/category";
import { tagService } from "@/modules/tag";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAllowedImageHosts } from "@/lib/env";
import { PostForm } from "@/components/admin/post-form";

export default async function NewPostPage() {
  await requireAdmin();

  const [categories, tags] = await Promise.all([
    categoryService.listAdminCategories(),
    tagService.listAdminTags(),
  ]);

  return (
    <div>
      <h1 className="font-serif-cn text-2xl font-bold md:text-3xl">新建文章</h1>
      <p className="mt-2 text-sm text-text-muted">创建后会保存为草稿，预览与发布在编辑页操作。</p>
      <div className="mt-6">
        <PostForm post={null} categories={categories} tags={tags} allowedImageHosts={getAllowedImageHosts()} />
      </div>
    </div>
  );
}
