import { requestIdHeader } from "@/lib/api/request-context";

/**
 * Standard API response envelope (PRD §6.7):
 *   success  -> { data }
 *   paged    -> { data, pagination: { page, pageSize, total, totalPages } }
 *   delete   -> 204 no body
 */
export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function apiSuccess<T>(
  data: T,
  ctx: { requestId: string },
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return Response.json({ data }, { status, headers: { ...requestIdHeader(ctx), "Cache-Control": "no-store", ...extraHeaders } });
}

export function apiCreated<T>(
  data: T,
  ctx: { requestId: string },
  extraHeaders?: Record<string, string>,
): Response {
  return Response.json({ data }, { status: 201, headers: { ...requestIdHeader(ctx), "Cache-Control": "no-store", ...extraHeaders } });
}

export function apiPaginated<T>(
  data: T[],
  pagination: Pagination,
  ctx: { requestId: string },
): Response {
  return Response.json({ data, pagination }, { status: 200, headers: { ...requestIdHeader(ctx), "Cache-Control": "no-store" } });
}

export function apiNoContent(
  ctx: { requestId: string },
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(null, { status: 204, headers: { ...requestIdHeader(ctx), "Cache-Control": "no-store", ...extraHeaders } });
}
