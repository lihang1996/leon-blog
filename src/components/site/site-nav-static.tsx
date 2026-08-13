import Link from "next/link";
import { siteNav } from "@/config/site-content";

/**
 * Static (server-rendered) navigation links used as the Suspense fallback for
 * SiteNav. Identical structure to the client links; the client version adds the
 * current-route underline after hydration.
 */
export function SiteNavStatic({ className = "" }: { className?: string }) {
  return (
    <nav className={className} aria-label="主导航">
      {siteNav.map((item) => (
        <Link key={item.href} href={item.href} className="focus-nav text-sm text-text transition-colors hover:text-accent-text">
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
