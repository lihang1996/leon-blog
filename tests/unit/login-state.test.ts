import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { authConfig } from "@/auth.config";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findUnique: vi.fn(), redirect: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/env", () => ({ siteUrl: "https://blog.example:443" }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { resolveLoginState } from "@/lib/auth/login-state";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "admin-id", sessionVersion: 3 } });
  mocks.findUnique.mockResolvedValue({ id: "admin-id", isActive: true, sessionVersion: 3 });
  mocks.redirect.mockImplementation((url: string) => { throw new Error(`redirect:${url}`); });
});

describe("resolveLoginState authoritative login gate", () => {
  it.each([undefined, "expired", "anything"])("does not sign out a valid session for reason=%s", async (reason) => {
    await expect(resolveLoginState({ reason, callbackUrl: "https://blog.example/admin/posts?q=1" }))
      .rejects.toThrow("redirect:/admin/posts?q=1");
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "admin-id" } }));
  });

  it("does not clear a missing session even with reason=expired", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(resolveLoginState({ reason: "expired", callbackUrl: "/admin/posts" }))
      .resolves.toEqual({ clearInvalidSession: false, callbackUrl: "/admin/posts" });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { id: "admin-id", isActive: false, sessionVersion: 3 },
    { id: "admin-id", isActive: true, sessionVersion: 4 },
  ])("allows cleanup only after the stored account invalidates the session (%j)", async (user) => {
    mocks.findUnique.mockResolvedValue(user);
    await expect(resolveLoginState({ callbackUrl: "/admin/posts" }))
      .resolves.toEqual({ clearInvalidSession: true, callbackUrl: "/admin/posts" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("sanitizes login loops and external redirects", async () => {
    for (const callbackUrl of ["/admin/login", "https://evil.example/admin/posts", "/administrator"]) {
      await expect(resolveLoginState({ callbackUrl })).rejects.toThrow("redirect:/admin");
    }
  });

  it("does not interpret database outages as invalid sessions", async () => {
    const error = new Error("database unavailable");
    mocks.findUnique.mockRejectedValue(error);
    await expect(resolveLoginState({ reason: "expired" })).rejects.toBe(error);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("does not interpret auth failures as invalid sessions", async () => {
    const error = new Error("auth unavailable");
    mocks.auth.mockRejectedValue(error);
    await expect(resolveLoginState({ reason: "expired" })).rejects.toBe(error);
  });
});

describe("optimistic auth gate", () => {
  it.each([null, { user: { id: "stale-or-valid" }, expires: "2099-01-01" }])("always admits login for server validation", async (auth) => {
    for (const query of ["", "?reason=expired"]) {
      const result = authConfig.callbacks.authorized({
        auth: auth as Parameters<typeof authConfig.callbacks.authorized>[0]["auth"],
        request: new NextRequest(`https://blog.example/admin/login${query}`),
      });
      expect(result).toBe(true);
    }
  });

  it("protects the whole admin boundary without matching administrator", () => {
    expect(authConfig.callbacks.authorized({ auth: null, request: new NextRequest("https://blog.example/admin/posts") })).toBe(false);
    expect(authConfig.callbacks.authorized({ auth: null, request: new NextRequest("https://blog.example/administrator") })).toBe(true);
  });
});
