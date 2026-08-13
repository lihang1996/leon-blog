import { ZodError } from "zod";
import { AppError, ErrorCodes } from "@/lib/errors";
import { logger } from "@/lib/logger/logger";
import { requestIdHeader, type RequestContext } from "@/lib/api/request-context";

/**
 * Converts any thrown error into the standard error response
 * (PRD §6.7 / §6.8). Never leaks stack traces, DB connection info, or
 * internal paths. 4xx → warn log, 5xx / unknown → error log.
 */

/**
 * Redacts any URI (`scheme://user:pass@host:port/db?query`) from error
 * messages so internal logs never capture connection-string style secrets —
 * including the host, which can reveal deployment topology. Over-redaction of
 * an ordinary https URL in a log line is acceptable; the client only ever sees
 * the generic 500 envelope regardless.
 */
const URI_PATTERN = /[a-z][a-z0-9+.-]*:\/\/[^\s"']+/gi;

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(URI_PATTERN, "***");
}

export function handleApiError(error: unknown, ctx: RequestContext): Response {
  const requestId = ctx.requestId;

  if (error instanceof AppError) {
    const isServerError = error.status >= 500;
    if (isServerError) {
      // A 5xx AppError message may carry internals — never echo it to the
      // client, and redact it before logging (same contract as the generic 500
      // path). Only the stable error code is surfaced.
      logger.error("api.error", { requestId, code: error.code, message: safeErrorMessage(error) });
    } else {
      logger.warn("api.rejected", { requestId, code: error.code, message: error.message });
    }
    // Business (4xx) errors carry `details` (field-level issues) so the admin
    // forms can map them back onto inputs — never stack/internals. 5xx omits
    // both the raw message and details.
    return Response.json(
      {
        error: {
          code: error.code,
          message: isServerError ? "服务器内部错误" : error.message,
          ...(!isServerError && error.details !== undefined ? { details: error.details } : {}),
          requestId,
        },
      },
      { status: error.status, headers: requestIdHeader(ctx) },
    );
  }

  if (error instanceof SyntaxError) {
    // `await request.json()` throws a SyntaxError on a malformed JSON body —
    // that is a client error (400), not an internal fault.
    logger.warn("api.invalid_json", { requestId });
    return Response.json(
      {
        error: {
          code: ErrorCodes.VALIDATION_FAILED,
          message: "请求体不是合法的 JSON",
          requestId,
        },
      },
      { status: 400, headers: requestIdHeader(ctx) },
    );
  }

  if (error instanceof ZodError) {
    const issues = error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    logger.warn("api.validation_failed", { requestId, issues: issues.map((i) => i.path) });
    return Response.json(
      {
        error: {
          code: ErrorCodes.VALIDATION_FAILED,
          message: "输入校验失败",
          details: issues,
          requestId,
        },
      },
      { status: 422, headers: requestIdHeader(ctx) },
    );
  }

  logger.error("api.unhandled", {
    requestId,
    name: error instanceof Error ? error.name : typeof error,
    message: safeErrorMessage(error),
  });
  return Response.json(
    {
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: "服务器内部错误",
        requestId,
      },
    },
    { status: 500, headers: requestIdHeader(ctx) },
  );
}
