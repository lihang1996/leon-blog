import { describe, expect, it } from "vitest";
import { formatDate } from "@/lib/format";

describe("formatDate", () => {
  it("renders dates in Asia/Shanghai deterministically regardless of process timezone", () => {
    // 2026-08-10T20:00:00Z == 2026-08-11 04:00 Asia/Shanghai.
    // On a UTC/US host the naive local-time formatting would render 8 月 10 日 —
    // a fixed timeZone keeps this stable everywhere.
    expect(formatDate("2026-08-10T20:00:00.000Z")).toBe("2026 年 8 月 11 日");
  });

  it("keeps an un-straddling timestamp stable too", () => {
    expect(formatDate("2026-08-10T02:00:00.000Z")).toBe("2026 年 8 月 10 日");
  });

  it("returns an empty string for invalid input", () => {
    expect(formatDate("not-a-date")).toBe("");
  });
});
