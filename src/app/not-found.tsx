import Link from "next/link";

/** Fallback 404 when no closer not-found exists (outside (site)/(admin)). */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="text-center">
        <h1 className="font-serif-cn text-2xl font-bold text-text">404 · 页面不存在</h1>
        <p className="mt-2 text-text-muted">没有找到你要访问的页面。</p>
        <p className="mt-6">
          <Link href="/" className="focus-link text-accent-text underline underline-offset-4 hover:text-accent">
            返回首页
          </Link>
        </p>
      </div>
    </div>
  );
}
