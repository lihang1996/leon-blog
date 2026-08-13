"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const adminNav = [
  { href: "/admin", label: "概览" },
  { href: "/admin/posts", label: "文章" },
  { href: "/admin/categories", label: "分类" },
  { href: "/admin/tags", label: "标签" },
];

/**
 * Admin shell header (UI spec §8.2). Lightweight workbench — not a SaaS side
 * rail. Sign-out clears the Auth.js cookie; the "view site" link opens the
 * public blog in a new tab.
 */
export function AdminHeader({ displayName }: { displayName: string }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-blog items-center justify-between px-page">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="focus-link-strong font-serif-cn text-base font-bold text-text">
            管理后台
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="管理导航">
            {adminNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`focus-nav rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive(item.href)
                    ? "bg-bg font-medium text-accent-text"
                    : "text-text-muted hover:text-text"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-text-muted sm:inline">{displayName}</span>
          <Link
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="focus-link text-sm text-accent-text underline underline-offset-4 hover:text-accent"
          >
            查看站点 ↗
          </Link>
          <button
            type="button"
            onClick={() => signOut({ redirectTo: "/admin/login" })}
            className="focus-action-secondary inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm text-text transition-colors hover:border-danger hover:text-danger"
          >
            退出
          </button>
        </div>
      </div>
      <nav className="flex items-center gap-1 overflow-x-auto px-page md:hidden" aria-label="管理导航（移动端）">
        {adminNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={`focus-nav whitespace-nowrap px-3 py-2 text-sm ${
              isActive(item.href) ? "font-medium text-accent-text" : "text-text-muted"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
