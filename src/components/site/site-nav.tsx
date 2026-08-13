"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { siteNav } from "@/config/site-content";

/**
 * Desktop navigation links. A tiny client island only so the current route can
 * be marked with text + underline (UI spec §2.1) — the links themselves stay
 * regular anchors.
 */
export function SiteNav({ className = "" }: { className?: string }) {
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className={className} aria-label="主导航">
      {siteNav.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`focus-nav text-sm transition-colors ${
              active
                ? "text-accent-text"
                : "text-text hover:text-accent-text"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
