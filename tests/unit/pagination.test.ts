import { describe, expect, it } from "vitest";
import { normalizePageParams, computePagination, offsetOf, MAX_PAGE, isPageOutOfRange } from "@/lib/pagination";

describe("normalizePageParams", () => {
  it("defaults missing params to page 1 / pageSize 10", () => {
    expect(normalizePageParams({})).toEqual({ page: 1, pageSize: 10 });
  });

  it("clamps page to >= 1 and pageSize to [1, 50]", () => {
    expect(normalizePageParams({ page: "0", pageSize: "999" })).toEqual({ page: 1, pageSize: 50 });
    expect(normalizePageParams({ page: "-3", pageSize: "0" })).toEqual({ page: 1, pageSize: 1 });
  });

  it("parses string and array values", () => {
    expect(normalizePageParams({ page: "3", pageSize: ["25"] })).toEqual({ page: 3, pageSize: 25 });
  });

  it("falls back to defaults for non-numeric input", () => {
    expect(normalizePageParams({ page: "abc", pageSize: "xyz" })).toEqual({ page: 1, pageSize: 10 });
  });

  it("caps page to MAX_PAGE so a crafted ?page=… cannot force a huge OFFSET", () => {
    expect(normalizePageParams({ page: String(MAX_PAGE + 9999) })).toEqual({ page: MAX_PAGE, pageSize: 10 });
  });
});

describe("computePagination", () => {
  it("computes totalPages with a minimum of 1", () => {
    expect(computePagination(1, 10, 35)).toEqual({ page: 1, pageSize: 10, total: 35, totalPages: 4 });
    expect(computePagination(1, 10, 0)).toMatchObject({ totalPages: 1 });
  });
});

describe("offsetOf", () => {
  it("computes zero-based offsets", () => {
    expect(offsetOf(1, 10)).toBe(0);
    expect(offsetOf(3, 10)).toBe(20);
  });
});

describe("isPageOutOfRange", () => {
  it("flags a page beyond the last page only when data exists", () => {
    expect(isPageOutOfRange(1, 4)).toBe(false);
    expect(isPageOutOfRange(4, 4)).toBe(false);
    expect(isPageOutOfRange(5, 4)).toBe(true);
    // Empty collection → totalPages stays 1, page 1 is never "out of range".
    expect(isPageOutOfRange(1, 1)).toBe(false);
  });
});
