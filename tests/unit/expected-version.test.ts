import { describe, expect, it } from "vitest";
import { parseExpectedVersion } from "@/lib/api/expected-version";
import { ErrorCodes } from "@/lib/errors";

describe("parseExpectedVersion", () => {
  it.each([
    ['"0"', 0],
    ['"42"', 42],
    ['"007"', 7],
    [' \t"12"\t ', 12],
    ['"2147483647"', 2_147_483_647],
  ])("parses %s", (header, version) => {
    expect(parseExpectedVersion(header)).toBe(version);
  });

  it("requires an If-Match header (428)", () => {
    expect(() => parseExpectedVersion(null)).toThrowError(
      expect.objectContaining({ code: ErrorCodes.VALIDATION_FAILED, status: 428 }),
    );
  });

  it.each([
    "", " ", "0", "*", 'W/"0"', '"-1"', '"+1"', '"1.5"', '"1e2"',
    '""', '" 1"', '"1 "', '"0", "1"', '"1"garbage', '"2147483648"', '"9007199254740992"',
    `"${"9".repeat(400)}"`,
  ])("rejects invalid If-Match %s (422)", (header) => {
    expect(() => parseExpectedVersion(header)).toThrowError(
      expect.objectContaining({ code: ErrorCodes.VALIDATION_FAILED, status: 422 }),
    );
  });
});
