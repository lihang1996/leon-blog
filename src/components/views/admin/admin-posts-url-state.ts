/**
 * FR-08 URL-state contract for the admin posts list.
 *
 *   status = ALL | DRAFT | PUBLISHED | ARCHIVED   (default ALL, omitted)
 *   sort   = published | updated                  (default published, omitted)
 *   page   = positive integer ≤ MAX_ADMIN_PAGE    (default 1, omitted)
 *
 * Defaults are omitted from the address; illegal/duplicate/unknown params
 * are normalized exactly once via a replace (never push, never a loop);
 * user-driven changes enter history with push and return to page 1.
 * Non-contract parameters never influence the list.
 */

export type AdminPostStatusFilter = "ALL" | "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type AdminPostSort = "published" | "updated";

export const ADMIN_POSTS_STATUS_FILTERS: readonly AdminPostStatusFilter[] = ["ALL", "DRAFT", "PUBLISHED", "ARCHIVED"];
export const ADMIN_POSTS_SORTS: readonly AdminPostSort[] = ["published", "updated"];

/** Mirrors the API-side page cap (`src/lib/pagination.ts` MAX_PAGE). */
export const MAX_ADMIN_PAGE = 100_000;

export interface AdminPostsQuery {
  status: AdminPostStatusFilter;
  sort: AdminPostSort;
  page: number;
}

export const DEFAULT_ADMIN_POSTS_QUERY: AdminPostsQuery = { status: "ALL", sort: "published", page: 1 };

export interface ParsedAdminPostsQuery extends AdminPostsQuery {
  /**
   * True when the raw query string carries anything the canonical address
   * would not (illegal values, duplicates, defaults, unknown params, page
   * overflow) — the caller then issues a single `replace` to stabilize it.
   */
  needsNormalization: boolean;
}

function parseStatus(raw: string | null): AdminPostStatusFilter {
  return ADMIN_POSTS_STATUS_FILTERS.includes(raw as AdminPostStatusFilter)
    ? (raw as AdminPostStatusFilter)
    : DEFAULT_ADMIN_POSTS_QUERY.status;
}

function parseSort(raw: string | null): AdminPostSort {
  return ADMIN_POSTS_SORTS.includes(raw as AdminPostSort) ? (raw as AdminPostSort) : DEFAULT_ADMIN_POSTS_QUERY.sort;
}

function parsePage(raw: string | null): number {
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_ADMIN_POSTS_QUERY.page;
  const page = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_ADMIN_PAGE) return DEFAULT_ADMIN_POSTS_QUERY.page;
  return page;
}

export function parseAdminPostsQuery(searchParams: URLSearchParams): ParsedAdminPostsQuery {
  // getAll → first value wins for duplicates (URLSearchParams.get behavior
  // kept explicit here so the rule is testable).
  const status = parseStatus(searchParams.getAll("status")[0] ?? null);
  const sort = parseSort(searchParams.getAll("sort")[0] ?? null);
  const page = parsePage(searchParams.getAll("page")[0] ?? null);
  const query = { status, sort, page };
  return { ...query, needsNormalization: buildAdminPostsSearch(query) !== searchParams.toString() };
}

/** Canonical search string — fixed key order, defaults omitted. */
export function buildAdminPostsSearch(query: AdminPostsQuery): string {
  const params = new URLSearchParams();
  if (query.status !== DEFAULT_ADMIN_POSTS_QUERY.status) params.set("status", query.status);
  if (query.sort !== DEFAULT_ADMIN_POSTS_QUERY.sort) params.set("sort", query.sort);
  if (query.page !== DEFAULT_ADMIN_POSTS_QUERY.page) params.set("page", String(query.page));
  return params.toString();
}

export function buildAdminPostsHref(query: AdminPostsQuery): string {
  const search = buildAdminPostsSearch(query);
  return `/admin/posts${search ? `?${search}` : ""}`;
}

/**
 * A fresh navigation for a user-driven control change: conditions reset to
 * page 1 and the entry is pushed into history (FR-08.2).
 */
export function controlChangeHref(
  current: AdminPostsQuery,
  change: Partial<Pick<AdminPostsQuery, "status" | "sort">>,
): string {
  return buildAdminPostsHref({ ...current, ...change, page: 1 });
}

/** Corrections (invalid/overflow/deleted-last-row pages) replace, not push. */
export function pageCorrectionHref(current: AdminPostsQuery, page: number): string {
  const clamped = Math.min(MAX_ADMIN_PAGE, Math.max(1, Math.trunc(page) || 1));
  return buildAdminPostsHref({ ...current, page: clamped });
}
