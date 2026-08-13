import { AppError, ErrorCodes } from "@/lib/errors";
import { siteUrl } from "@/lib/env";

/**
 * CSRF boundary for self-built admin write endpoints (architecture §11.4).
 * Auth.js handles its own CSRF on /api/auth/*; these rules apply to every
 * /api/v1/admin/* write method: same-origin Origin + application/json.
 */
function expectedOrigin(): string {
  return new URL(siteUrl).origin;
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new AppError(ErrorCodes.FORBIDDEN, 403, "缺少 Origin 头,拒绝跨站请求");
  }
  if (origin !== expectedOrigin()) {
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
