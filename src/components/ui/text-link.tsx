import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Text link (UI spec §8.3): underline + arrow for article jumps, accent color
 * for emphasis. Never relies on color alone.
 */
export function TextLink({
  href,
  children,
  withArrow = true,
  className = "",
}: {
  href: string;
  children: ReactNode;
  withArrow?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`focus-link inline-flex items-center gap-1.5 text-accent-text underline underline-offset-4 hover:text-accent ${className}`}
    >
      {children}
      {withArrow ? <span aria-hidden="true">→</span> : null}
    </Link>
  );
}
