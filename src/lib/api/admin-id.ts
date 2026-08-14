import { ErrorCodes, unprocessable } from "@/lib/errors";

/**
 * UUID pre-check for admin `{id}` params (PRD §6.8). Prisma `@db.Uuid` throws a
 * driver error on illegal strings; validating first maps those to 422 instead
 * of 500. HTML pages call `isUuid` and `notFound()`; JSON APIs call
 * `assertAdminUuid`.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function assertAdminUuid(id: string): void {
  if (!isUuid(id)) {
    throw unprocessable(ErrorCodes.VALIDATION_FAILED, "id 必须是合法的 UUID");
  }
}
