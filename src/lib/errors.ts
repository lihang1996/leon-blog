/**
 * Unified error type (architecture §10.5). Business services throw AppError;
 * Route Handlers map it to the standard error response via handleApiError.
 * Never include stack traces, DB connection info, or internal paths in messages.
 */

export const ErrorCodes = {
  AUTH_REQUIRED: "AUTH_REQUIRED",
  AUTH_INVALID: "AUTH_INVALID",
  ADMIN_DISABLED: "ADMIN_DISABLED",
  POST_NOT_FOUND: "POST_NOT_FOUND",
  POST_SLUG_EXISTS: "POST_SLUG_EXISTS",
  INVALID_POST_TRANSITION: "INVALID_POST_TRANSITION",
  POST_NOT_READY: "POST_NOT_READY",
  CATEGORY_NOT_FOUND: "CATEGORY_NOT_FOUND",
  CATEGORY_SLUG_EXISTS: "CATEGORY_SLUG_EXISTS",
  CATEGORY_NAME_EXISTS: "CATEGORY_NAME_EXISTS",
  CATEGORY_DELETE_CONFLICT: "CATEGORY_DELETE_CONFLICT",
  TAG_NOT_FOUND: "TAG_NOT_FOUND",
  TAG_SLUG_EXISTS: "TAG_SLUG_EXISTS",
  TAG_NAME_EXISTS: "TAG_NAME_EXISTS",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  RATE_LIMITED: "RATE_LIMITED",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  FORBIDDEN: "FORBIDDEN",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** 401 — not logged in or session invalid. */
export function authError(code: ErrorCode = ErrorCodes.AUTH_REQUIRED, message = "请先登录"): AppError {
  return new AppError(code, 401, message);
}

/** 403 — logged in but not allowed. */
export function forbidden(message = "无权访问该资源"): AppError {
  return new AppError(ErrorCodes.FORBIDDEN, 403, message);
}

/** 404 — resource does not exist. */
export function notFound(code: ErrorCode, message: string): AppError {
  return new AppError(code, 404, message);
}

/** 409 — unique-field conflict (slug / name / email). */
export function conflict(code: ErrorCode, message: string): AppError {
  return new AppError(code, 409, message);
}

/** 422 — well-formed input that fails business validation. */
export function unprocessable(code: ErrorCode, message: string, details?: unknown): AppError {
  return new AppError(code, 422, message, details);
}
