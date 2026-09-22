import { AppError, ErrorCodes } from "@/lib/errors";

/**
 * CSRF boundary for self-built admin write endpoints (architecture §11.4).
 * Auth.js handles its own CSRF on /api/auth/*; these rules apply to every
 * /api/v1/admin/* write method: same-origin Origin + application/json.
 *
 * Production uses the existing canonical NEXT_PUBLIC_SITE_URL, not caller-
 * controlled Host/forwarded headers. Development/test use the direct Request
 * URL to support local ports and isolated tests; forwarded headers are ignored.
 */
function normalizedOriginOf(rawUrl: string, originHeader = false): string | null {
  try {
    if (/[\\\u0000-\u0020\u007f]/.test(rawUrl)) return null;
    const url = new URL(rawUrl);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
    if (originHeader && (url.pathname !== "/" || url.search || url.hash)) return null;
    return url.origin; // URL normalizes casing and default ports on both sides.
  } catch {
    return null;
  }
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new AppError(ErrorCodes.FORBIDDEN, 403, "缺少 Origin 头,拒绝跨站请求");
  }
  const normalizedOrigin = normalizedOriginOf(origin, true);
  if (!normalizedOrigin) {
    throw new AppError(ErrorCodes.FORBIDDEN, 403, "Origin 不合法,拒绝跨站请求");
  }
  const expectedOrigin = normalizedOriginOf(
    process.env.NODE_ENV === "production"
      ? process.env.NEXT_PUBLIC_SITE_URL ?? ""
      : request.url,
  );
  if (!expectedOrigin || normalizedOrigin !== expectedOrigin) {
    throw new AppError(ErrorCodes.FORBIDDEN, 403, "Origin 不匹配,拒绝跨站请求");
  }
}

export function assertJsonContentType(request: Request): void {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new AppError(ErrorCodes.UNSUPPORTED_MEDIA_TYPE, 415, "仅接受 application/json");
  }
}

/** Both checks in one call for write handlers. */
export function assertSameOriginJson(request: Request): void {
  assertSameOrigin(request);
  assertJsonContentType(request);
}
