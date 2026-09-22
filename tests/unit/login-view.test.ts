import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// A hook-level state-machine test; no browser/server or network is started.
const harness = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0, effects: [] as Array<() => void>,
  signOut: vi.fn(), signIn: vi.fn(), fetch: vi.fn(), replace: vi.fn(), reload: vi.fn(),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState<T>(initial: T | (() => T)) {
      const index = harness.cursor++;
      if (!(index in harness.values)) harness.values[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      return [harness.values[index], (value: T) => { harness.values[index] = value; }];
    },
    useRef<T>(initial: T) {
      const index = harness.cursor++;
      if (!(index in harness.values)) harness.values[index] = { current: initial };
      return harness.values[index];
    },
    useCallback<T>(callback: T) { return callback; },
    useEffect(effect: () => void) { harness.effects.push(effect); },
  };
});
vi.mock("next-auth/react", () => ({ signIn: harness.signIn, signOut: harness.signOut }));
import { LoginView } from "@/components/views/login-view";

beforeEach(() => {
  vi.resetAllMocks();
  harness.values = [];
  harness.cursor = 0;
  harness.effects = [];
  harness.signOut.mockResolvedValue({ url: "/admin/login" });
  harness.fetch.mockResolvedValue(new Response("null", { status: 200 }));
  vi.stubGlobal("fetch", harness.fetch);
  vi.stubGlobal("window", {
    location: { search: "?reason=expired", reload: harness.reload },
    history: { replaceState: harness.replace },
  });
});
afterEach(() => vi.unstubAllGlobals());

function render(props: Parameters<typeof LoginView>[0] = {}) {
  harness.cursor = 0;
  return renderToStaticMarkup(LoginView(props));
}
async function flushEffects() {
  harness.effects.splice(0).forEach((effect) => effect());
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("LoginView verified cleanup state", () => {
  it("initializes SSR and client identically from server props", () => {
    const client = render({ clearInvalidSession: true });
    vi.stubGlobal("window", undefined);
    harness.values = [];
    const server = render({ clearInvalidSession: true });
    expect(client).toBe(server);
    expect(server).toContain("正在清除失效会话");
    expect(server).toContain('disabled=""');
  });

  it("does not sign out merely because reason=expired is in the URL", async () => {
    render();
    await flushEffects();
    expect(harness.signOut).not.toHaveBeenCalled();
  });

  it("keeps the form blocked and exposes retry on signOut failure", async () => {
    harness.signOut.mockRejectedValue(new Error("offline"));
    render({ clearInvalidSession: true });
    await flushEffects();
    const html = render({ clearInvalidSession: true });
    expect(html).toContain("重试清除会话");
    expect(html).toContain('disabled=""');
    expect(html).not.toContain("登录状态已失效，请重新登录");
    expect(harness.replace).not.toHaveBeenCalled();
    expect(harness.fetch).not.toHaveBeenCalled();
    expect(harness.signOut).toHaveBeenCalledOnce();
  });

  it.each([new Response("{}", { status: 500 }), new Response('{"user":{"id":"still-present"}}'), new Response("false")])("does not claim success without confirmed cookie removal", async (response) => {
    harness.fetch.mockResolvedValue(response);
    render({ clearInvalidSession: true });
    await flushEffects();
    expect(render({ clearInvalidSession: true })).toContain("重试清除会话");
    expect(harness.replace).not.toHaveBeenCalled();
  });

  it("unlocks only after verified cleanup and retains the safe callback", async () => {
    const props = { clearInvalidSession: true, callbackUrl: "/admin/a/../posts?q=1" };
    render(props);
    await flushEffects();
    const html = render(props);
    expect(html).toContain("登录状态已失效，请重新登录");
    expect(html).not.toContain('disabled=""');
    expect(harness.fetch).toHaveBeenCalledWith("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
    expect(harness.replace).toHaveBeenCalledWith(null, "", "/admin/login?callbackUrl=%2Fadmin%2Fposts%3Fq%3D1");
  });
});
