import { afterEach, describe, expect, it, vi } from "vitest";
import { assertSameOrigin } from "@/lib/api/same-origin";
import { ErrorCodes } from "@/lib/errors";

afterEach(() => vi.unstubAllEnvs());
const forbidden = expect.objectContaining({ code: ErrorCodes.FORBIDDEN });

describe("assertSameOrigin", () => {
  it("accepts the direct request origin in development/test", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(() => assertSameOrigin(new Request("https://blog.example.com/api", {
      headers: { origin: "https://BLOG.example.com:443" },
    }))).not.toThrow();
    expect(() => assertSameOrigin(new Request("http://localhost:3001/api", {
      headers: { origin: "http://localhost:3001" },
    }))).not.toThrow();
  });

  it("rejects a protocol mismatch even when the host is equal", () => {
    expect(() => assertSameOrigin(new Request("https://blog.example.com/api", {
      headers: { origin: "http://blog.example.com" },
    }))).toThrowError(forbidden);
  });

  it("uses the configured canonical origin behind a production proxy", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://BLOG.example.com:443/");
    expect(() => assertSameOrigin(new Request("http://internal:3000/api", {
      headers: { origin: "https://blog.example.com", host: "internal:3000" },
    }))).not.toThrow();
  });

  it("does not trust attacker-controlled forwarded or direct hosts in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://blog.example.com");
    expect(() => assertSameOrigin(new Request("https://evil.example/api", {
      headers: {
        origin: "https://evil.example", host: "evil.example",
        "x-forwarded-host": "evil.example", "x-forwarded-proto": "https",
      },
    }))).toThrowError(forbidden);
  });

  it("ignores forwarded headers even in development/test", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(() => assertSameOrigin(new Request("http://internal:3000/api", {
      headers: { origin: "https://blog.example.com", "x-forwarded-host": "blog.example.com", "x-forwarded-proto": "https" },
    }))).toThrowError(forbidden);
  });

  it.each([undefined, "not a url", "file:///tmp/site"])("fails closed with invalid production canonical URL %s", (url) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", url);
    expect(() => assertSameOrigin(new Request("https://blog.example.com/api", {
      headers: { origin: "https://blog.example.com" },
    }))).toThrowError(forbidden);
  });

  it.each(["null", "file:///tmp/site", "https://blog.example.com/path", "https://blog.example.com?x=1", "https://user@blog.example.com", "https://blog.example.com, https://evil.example"])("rejects malformed Origin %s", (origin) => {
    expect(() => assertSameOrigin(new Request("https://blog.example.com/api", { headers: { origin } }))).toThrowError(forbidden);
  });

  it("rejects a missing Origin", () => {
    expect(() => assertSameOrigin(new Request("https://blog.example.com/api"))).toThrowError(forbidden);
  });
});
