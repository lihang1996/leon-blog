import Link from "next/link";

/** Admin-segment 404 — wrapped by admin/layout (AdminHeader + requireAdmin). */
export default function AdminNotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="font-serif-cn text-2xl font-bold text-text">404 · 页面不存在</h1>
      <p className="mt-2 text-text-muted">没有找到你要访问的后台页面。</p>
      <p className="mt-6">
        <Link href="/admin" className="focus-link text-accent-text underline underline-offset-4 hover:text-accent">
          返回后台
        </Link>
      </p>
    </div>
  );
}
