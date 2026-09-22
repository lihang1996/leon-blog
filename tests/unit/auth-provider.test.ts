import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ configure: vi.fn<(config: unknown) => object>(() => ({})), authenticate: vi.fn() }));
vi.mock("next-auth", () => ({ default: mocks.configure }));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: unknown) => options }));
vi.mock("@/modules/auth/auth.service", () => ({ authenticateCredentials: mocks.authenticate }));
import "@/auth";

describe("credentials request boundary", () => {
  it("does not use spoofable forwarded IPs as a trusted throttle identity", async () => {
    const config = mocks.configure.mock.calls[0]![0] as unknown as {
      providers: Array<{ authorize: (credentials: { email: string; password: string }, request: Request) => Promise<unknown> }>;
    };
    mocks.authenticate.mockResolvedValue(null);
    await config.providers[0]!.authorize({ email: "admin@example.com", password: "wrong" }, new Request("https://blog.example/api/auth/callback/credentials", {
      headers: { "x-forwarded-for": "198.51.100.1, 203.0.113.1", "x-real-ip": "198.51.100.2" },
    }));
    expect(mocks.authenticate).toHaveBeenCalledWith("admin@example.com", "wrong");
  });
});
