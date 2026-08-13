"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { siteNav } from "@/config/site-content";

export function SiteFooterNav() {
  const pathname = usePathname();

  return siteNav.slice(0, 3).map((item) => {
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`focus-nav ${active ? "text-accent-text" : "hover:text-accent-text"}`}
      >
        {item.label}
      </Link>
    );
  });
}
