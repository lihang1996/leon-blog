export function adminPostsHref(status: string, pageNumber: number): string {
  const params = new URLSearchParams();
  if (status !== "ALL") params.set("status", status);
  if (pageNumber > 1) params.set("page", String(pageNumber));
  const qs = params.toString();
  return qs ? `/admin/posts?${qs}` : "/admin/posts";
}
