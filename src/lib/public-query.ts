import { DEFAULT_PAGE_SIZE, MAX_PAGE, MAX_PAGE_SIZE, normalizePageParams, type PageParams, type PaginationInfo } from "./pagination";

export type PublicSearchParams = Record<string, string | string[] | undefined>;
export type PublicQuery = PageParams & {
  q: string;
  category: string;
  tag: string;
  sort: "latest" | "updated";
};

export function firstQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizePublicQuery(params: PublicSearchParams, defaultPageSize = 10): PublicQuery {
  return {
    ...normalizePageParams(params, defaultPageSize),
    q: (firstQueryValue(params.q) ?? "").trim().slice(0, 50),
    category: (firstQueryValue(params.category) ?? "").trim(),
    tag: (firstQueryValue(params.tag) ?? "").trim(),
    sort: firstQueryValue(params.sort) === "updated" ? "updated" : "latest",
  };
}

/** Bound numeric service inputs before they become cache keys. */
export function normalizePublicPage(params: PageParams): PageParams {
  return {
    page: Number.isFinite(params.page) ? Math.min(MAX_PAGE, Math.max(1, Math.trunc(params.page))) : 1,
    pageSize: Number.isFinite(params.pageSize) ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(params.pageSize))) : DEFAULT_PAGE_SIZE,
  };
}

/** Keep unrelated query conditions when navigating or correcting a page URL. */
export function publicQueryHref(
  pathname: string,
  params: PublicSearchParams | URLSearchParams,
  changes: Record<string, string | number | undefined>,
): string {
  const next = params instanceof URLSearchParams ? new URLSearchParams(params) : new URLSearchParams();
  if (!(params instanceof URLSearchParams)) {
    for (const [key, value] of Object.entries(params)) {
      for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
        next.append(key, item);
      }
    }
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === "" || (key === "page" && Number(value) === 1)) next.delete(key);
    else next.set(key, String(value));
  }
  const search = next.toString();
  return `${pathname}${search ? `?${search}` : ""}`;
}

/** Correct malformed/capped/out-of-range pages once, including empty lists. */
export function publicPageRedirect(
  pathname: string,
  params: PublicSearchParams,
  pagination: PaginationInfo,
): string | null {
  const page = Math.min(pagination.page, Math.max(1, pagination.totalPages));
  const rawPage = firstQueryValue(params.page);
  if ((rawPage === undefined && page === 1) || rawPage === String(page)) return null;
  return publicQueryHref(pathname, params, { page });
}
