import Link from "next/link";
import { Suspense } from "react";
import { siteName } from "@/lib/env";
import { SiteNav } from "@/components/site/site-nav";
import { SiteNavStatic } from "@/components/site/site-nav-static";
import { MobileNavDisclosure } from "@/components/site/mobile-nav-disclosure";

/**
 * Public header (architecture §6.7). The current-aware desktop navigation is a
 * minimal client island behind Suspense, as required by Next 16 Cache Components
 * on unknown dynamic paths. The static fallback preserves identical geometry.
 * Dynamic segments remain Partial Prerenders, so page-level `notFound()` can
 * render the 404 UI with a 200 shell status (see README "已知限制"); `/api/v1`
 * still returns the authoritative 404 response.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-blog items-center justify-between px-page">
        <Link
          href="/"
          className="focus-link-strong font-serif-cn text-lg font-bold tracking-tight text-text hover:text-accent-text"
        >
          {siteName}
        </Link>

        <Suspense fallback={<SiteNavStatic className="hidden items-center gap-8 lg:flex" />}>
          <SiteNav className="hidden items-center gap-8 lg:flex" />
        </Suspense>

        <MobileNavDisclosure />
      </div>
    </header>
  );
}
