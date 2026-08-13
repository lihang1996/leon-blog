import Link from "next/link";

export default function SiteNotFound() {
  return (
    <div className="py-24 text-center">
      {/* Decorative only: hidden from AT and re-coloured above the near-1.4:1
          `text-border` contrast (FIND-212 fix). The real message is the h1. */}
      <p aria-hidden="true" className="font-serif-cn text-7xl font-bold text-text-muted select-none">
        404
      </p>
      <h1 className="mt-4 font-serif-cn text-2xl font-bold text-text">页面不存在</h1>
      <p className="mt-2 text-text-muted">你访问的页面可能已下线或地址有误。</p>
      <p className="mt-8">
        <Link
          href="/"
          className="focus-action-primary inline-flex min-h-11 items-center rounded-md bg-accent px-5 text-sm font-medium text-white hover:bg-accent-text"
        >
          返回首页
        </Link>
      </p>
    </div>
  );
}
