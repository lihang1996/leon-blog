import { describe, expect, it } from "vitest";
import { resolveAdminCallbackUrl } from "@/lib/auth/callback-url";

describe("resolveAdminCallbackUrl", () => {
  it("keeps safe relative admin paths", () => {
    expect(resolveAdminCallbackUrl("/admin/posts")).toBe("/admin/posts");
    expect(resolveAdminCallbackUrl("/admin/posts/new?x=1")).toBe("/admin/posts/new?x=1");
  });

  it("accepts same-origin absolute Auth.js callback URLs", () => {
    expect(
      resolveAdminCallbackUrl("http://localhost:3000/admin/posts", "http://localhost:3000"),
    ).toBe("/admin/posts");
  });

  it("rejects open redirects and protocol-relative URLs", () => {
    expect(resolveAdminCallbackUrl("//evil.example/admin")).toBe("/admin");
    expect(
      resolveAdminCallbackUrl("https://evil.example/admin/posts", "http://localhost:3000"),
    ).toBe("/admin");
    expect(resolveAdminCallbackUrl("/posts")).toBe("/admin");
    expect(resolveAdminCallbackUrl(null)).toBe("/admin");
    expect(resolveAdminCallbackUrl("https://evil.example/admin/posts")).toBe("/admin");
  });

  it("normalizes both origins and path traversal before returning a target", () => {
    expect(resolveAdminCallbackUrl("https://BLOG.example:443/admin/a/../posts?q=1#edit", "https://blog.example"))
      .toBe("/admin/posts?q=1#edit");
    expect(resolveAdminCallbackUrl("/admin/a/../posts")).toBe("/admin/posts");
  });

  it.each([
    "/", "/administrator", "/admin-other/posts", "/admin/../posts", "/admin/%2e%2e/posts",
    "/admin/login", "/admin/login/?callbackUrl=/admin/posts", "/admin/posts/../login",
    "/admin/%6cogin", "/admin/%256cogin", "/admin/login/subpath", "/admin%2fposts",
    "/admin//login", "/admin/..//evil.example", "/\\evil.example/admin", "/admin\\posts",
    "/admin/\tposts", "/admin/%0aposts", "/admin/%5cposts", "/admin/%zz",
    "https://user:pass@blog.example/admin/posts", "javascript:alert(1)",
  ])("rejects ambiguous or out-of-bound callback %s", (url) => {
    expect(resolveAdminCallbackUrl(url, "https://blog.example")).toBe("/admin");
  });
});
