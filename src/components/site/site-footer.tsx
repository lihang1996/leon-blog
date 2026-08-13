import Link from "next/link";
import { Suspense } from "react";
import { siteName } from "@/lib/env";
import { siteNav } from "@/config/site-content";
import { SiteFooterNav } from "@/components/site/site-footer-nav";

/** Computed at module load so prerendered pages stay time-stable. */
const COPYRIGHT_YEAR = new Date().getFullYear();

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto flex max-w-blog flex-col gap-4 px-page py-12 text-sm text-text-muted md:flex-row md:items-center md:justify-between">
        <p>© {COPYRIGHT_YEAR} {siteName} · 用 Next.js 与 TypeScript 记录学习</p>
        <nav className="flex gap-6" aria-label="页脚导航">
          <Suspense
            fallback={siteNav.slice(0, 3).map((item) => (
              <Link key={item.href} href={item.href} className="focus-nav hover:text-accent-text">
                {item.label}
              </Link>
            ))}
          >
            <SiteFooterNav />
          </Suspense>
        </nav>
      </div>
    </footer>
  );
}
