/** Resolve a login callback to a normalized admin path, never back to login. */
export function resolveAdminCallbackUrl(
  raw: string | null | undefined,
  origin?: string,
): string {
  if (!raw || /[\\\u0000-\u0020\u007f]/.test(raw)) return "/admin";

  try {
    const base = new URL(origin ?? "https://callback.invalid");
    if (!/^https?:$/.test(base.protocol)) return "/admin";
    const relative = raw.startsWith("/") && !raw.startsWith("//");
    // Absolute callbacks require a known origin. Never infer it from the input.
    if (!relative && (!origin || !/^https?:\/\//i.test(raw))) return "/admin";
    const url = new URL(raw, base);
    if (url.origin !== base.origin || url.username || url.password) return "/admin";

    // URL resolves dot segments. Reject ambiguous encoded path delimiters and
    // second-pass encodings before checking the decoded route boundary.
    const path = decodeURIComponent(url.pathname);
    if (/%|[\\\u0000-\u0020\u007f]/.test(path) || /%2f/i.test(url.pathname)) return "/admin";
    if (path !== "/admin" && !path.startsWith("/admin/")) return "/admin";
    if (path === "/admin/login" || path.startsWith("/admin/login/")) return "/admin";
    if (path.includes("//")) return "/admin";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/admin";
  }
}
