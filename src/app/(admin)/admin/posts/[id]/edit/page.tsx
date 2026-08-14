import { notFound } from "next/navigation";
import { postQueryService } from "@/modules/post";
import { categoryService } from "@/modules/category";
import { tagService } from "@/modules/tag";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isUuid } from "@/lib/api/admin-id";
import { getAllowedImageHosts } from "@/lib/env";
import { PostForm } from "@/components/admin/post-form";

type Props = { params: Promise<{ id: string }> };

export default async function EditPostPage({ params }: Props) {
  await requireAdmin();

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const post = await postQueryService.getAdminPost(id);
  if (!post) notFound();

  const [categories, tags] = await Promise.all([
    categoryService.listAdminCategories(),
    tagService.listAdminTags(),
  ]);

  return (
    <div>
      <h1 className="font-serif-cn text-2xl font-bold md:text-3xl">编辑文章</h1>
      <div className="mt-6">
        <PostForm post={post} categories={categories} tags={tags} allowedImageHosts={getAllowedImageHosts()} />
      </div>
    </div>
  );
}
