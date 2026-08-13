import { categoryService } from "@/modules/category";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CategoryManager } from "@/components/admin/category-manager";

export default async function AdminCategoriesPage() {
  await requireAdmin();
  const categories = await categoryService.listAdminCategories();

  return (
    <div>
      <h1 className="font-serif-cn text-2xl font-bold md:text-3xl">分类管理</h1>
      <p className="mt-2 text-sm text-text-muted">删除分类不会删除文章，相关文章会变为无分类。</p>
      <div className="mt-6">
        <CategoryManager initialCategories={categories} />
      </div>
    </div>
  );
}
