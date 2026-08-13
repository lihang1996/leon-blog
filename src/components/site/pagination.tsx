import Link from "next/link";
import type { PaginationInfo } from "@/lib/pagination";

/**
 * Prev / next pagination (UI spec §8.1). The caller builds the href so search
 * pages can preserve their `q` parameter.
 */
export function Pagination({
  pagination,
  makeHref,
}: {
  pagination: Pick<PaginationInfo, "page" | "totalPages">;
  makeHref: (page: number) => string;
}) {
  const { page, totalPages } = pagination;
  if (totalPages <= 1) return null;

  const linkClass =
    "focus-surface inline-flex min-h-11 items-center rounded-md border border-border bg-surface px-4 text-sm text-text transition-colors hover:border-accent-text hover:text-accent-text";

  return (
    <nav aria-label="分页" className="flex items-center justify-center gap-4 py-10">
      {page > 1 ? (
        <Link href={makeHref(page - 1)} className={linkClass}>
          上一页
        </Link>
      ) : (
        <span className="inline-flex min-h-11 items-center px-4 text-sm text-text-muted" aria-hidden="true">
          上一页
        </span>
      )}
      <span aria-current="page" className="rounded-md bg-bg px-2 py-1 text-sm font-medium text-text-muted">
        第 {page} / {totalPages} 页
      </span>
      {page < totalPages ? (
        <Link href={makeHref(page + 1)} className={linkClass}>
          下一页
        </Link>
      ) : (
        <span className="inline-flex min-h-11 items-center px-4 text-sm text-text-muted" aria-hidden="true">
          下一页
        </span>
      )}
    </nav>
  );
}
