import { randomBytes } from "node:crypto";

/**
 * Per-request context (architecture §17.1). Carries a requestId that links
 * logs, errors, and the `X-Request-Id` response header.
 */
export type RequestContext = {
  requestId: string;
  method: string;
  path: string;
  userId?: string;
  startedAt: number;
};

export function newRequestId(): string {
  return `req_${randomBytes(6).toString("hex")}`;
}

export function createRequestContext(request: Request): RequestContext {
  return {
    requestId: newRequestId(),
    method: request.method,
    path: new URL(request.url).pathname,
    startedAt: Date.now(),
  };
}

export function requestIdHeader(ctx: Pick<RequestContext, "requestId">): Record<string, string> {
  return { "X-Request-Id": ctx.requestId };
}
