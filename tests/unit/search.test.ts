import { describe, expect, it } from "vitest";
import { escapeLikePattern } from "@/lib/search";

describe("escapeLikePattern", () => {
  it("leaves plain keywords untouched", () => {
    expect(escapeLikePattern("nextjs")).toBe("nextjs");
    expect(escapeLikePattern("hello world")).toBe("hello world");
  });

  it("escapes LIKE wildcards and the escape char itself", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("back\\slash")).toBe("back\\\\slash");
  });

  it("escapes all occurrences", () => {
    expect(escapeLikePattern("a%b%c")).toBe("a\\%b\\%c");
    expect(escapeLikePattern("_a_")).toBe("\\_a\\_");
  });
});
