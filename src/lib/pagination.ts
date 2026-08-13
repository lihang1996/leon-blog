/**
 * Shared pagination helpers (PRD §6.7 / architecture §22.2).
 * Public list endpoints default to 10 per page and cap at 50.
 */

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;
// Upper bound for `page` so a crafted `?page=999999999` cannot produce a
// huge SKIP/OFFSET on a public, uncached list endpoint.
export const MAX_PAGE = 100_000;

export type PageParams = { page: number; pageSize: number };

export type PaginationInfo = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function parsePageParam(value: string | string[] | null | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return NaN;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : NaN;
}

/** Clamps page/pageSize to safe ranges. */
export function normalizePageParams(
  params: { page?: string | string[] | null; pageSize?: string | string[] | null },
  defaultPageSize = DEFAULT_PAGE_SIZE,
  maxPageSize = MAX_PAGE_SIZE,
): PageParams {
  const page = Math.min(MAX_PAGE, Math.max(1, parsePageParam(params.page) || 1));
  const rawSize = parsePageParam(params.pageSize);
  const pageSize = Math.min(maxPageSize, Math.max(1, Number.isFinite(rawSize) ? rawSize : defaultPageSize));
  return { page, pageSize };
}

export function computePagination(page: number, pageSize: number, total: number): PaginationInfo {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * True when the requested page is beyond the last page while data exists.
 * Public list pages redirect such URLs to the last valid page instead of
 * rendering a misleading empty state and caching a throwaway page key
 * (FIND-207 fix).
 */
export function isPageOutOfRange(page: number, totalPages: number): boolean {
  return totalPages > 0 && page > totalPages;
}

/** Zero-based skip for Prisma queries. */
export function offsetOf(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}
