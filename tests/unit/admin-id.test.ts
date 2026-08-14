import { describe, expect, it } from "vitest";
import { isUuid, assertAdminUuid } from "@/lib/api/admin-id";
import { ErrorCodes, AppError } from "@/lib/errors";

describe("isUuid / assertAdminUuid", () => {
  it("accepts canonical UUIDs", () => {
    expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
  });

  it("rejects illegal ids that would otherwise hit Prisma", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("550e8400e29b41d4a716446655440000")).toBe(false);
  });

  it("throws VALIDATION_FAILED 422 for illegal ids", () => {
    try {
      assertAdminUuid("abc");
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCodes.VALIDATION_FAILED);
      expect((error as AppError).status).toBe(422);
    }
  });
});
