import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { login } from "./helpers";

type ModeRoute = {
  name: string;
  path: string | ((baseURL: string) => string);
  authenticate?: boolean;
  boundaryError?: boolean;
};

const RUNTIME_REGRESSION_PATTERN =
  /eval\(\) is not supported|unsafe-eval|Refused to evaluate|Content Security Policy|hydration|hydrated but some attributes|Minified React error #418/i;

function requiredFixture(name: string): string {
  const value = process.env[name];
  expect(value, `${name} must identify an isolated QA fixture`).toBeTruthy();
  return value!;
}

function assertFixtureSafety(authenticated = false): void {
  expect(requiredFixture("E2E_FOCUS_FIXTURE_SCOPE")).toMatch(/(?:^|[-_/])(test|ci|e2e|tmp)(?:$|[-_/])/i);
  expect(requiredFixture("AGENT_OS_TEST_RESOURCE_SENTINEL")).toBe("true");
  if (authenticated) {
    expect(process.env.E2E_ADMIN_EMAIL).toBeTruthy();
    expect(process.env.E2E_ADMIN_PASSWORD).toBeTruthy();
  }
}

function requiredSafeSegment(name: string): string {
  const value = requiredFixture(name);
  expect(value).toBe(value.trim());
  expect(value).toMatch(/^[\p{L}\p{N}_-]+$/u);
  expect(value).not.toContain("%");
  expect(value).not.toMatch(/^\.{1,2}$/);
  return value;
}

function requiredSameOriginPath(name: string, baseURL: string): string {
  const value = requiredFixture(name);
  expect(value).toBe(value.trim());
  expect(value).toMatch(/^\/(?!\/)/);
  expect(value).not.toContain("\\");
  expect(value).not.toMatch(/[?#%]/);
  expect(value).toMatch(/^\/[\p{L}\p{N}_/-]*$/u);
  expect(value).not.toMatch(/\/\/?(?:\.{1,2})(?:\/|$)|\/\//);
  expect(new URL(value, baseURL).origin).toBe(new URL(baseURL).origin);
  return value;
}

function projectBaseURL(testInfo: TestInfo): string {
  const baseURL = testInfo.project.use.baseURL;
  expect(typeof baseURL).toBe("string");
  return baseURL as string;
}

async function focusWithKeyboard(page: Page, target: Locator, maximumTabs = 48): Promise<void> {
  await page.evaluate(() => {
    document.body.tabIndex = -1;
    document.body.focus();
    document.body.removeAttribute("tabindex");
  });

  for (let index = 0; index < maximumTabs; index += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`Target was not reached in ${maximumTabs} Tab presses`);
}

async function forcedFocusStyle(control: Locator) {
  return control.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      boxShadow: style.boxShadow,
      forcedColorAdjust: style.forcedColorAdjust,
      outlineColor: style.outlineColor,
      outlineOffset: style.outlineOffset,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
}

function parseRgb(value: string): [number, number, number] {
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  expect(channels, `Expected an RGB color, received ${value}`).toHaveLength(3);
  return channels as [number, number, number];
}

function grayscaleLuminance(value: string): number {
  const [red, green, blue] = parseRgb(value);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

test("forced-colors restores a system outline for every typed focus category", async ({ page }, testInfo) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/search", { waitUntil: "domcontentloaded" });
  expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);

  const controls = [
    page.getByRole("link", { name: "跳到主要内容" }),
    page.getByRole("searchbox", { name: "搜索文章" }),
    page.getByRole("button", { name: "搜索" }),
    page.getByRole("banner").getByRole("link").first(),
  ];
  const mobileIcon = page.getByRole("link", { name: "搜索文章" });
  if (await mobileIcon.isVisible()) controls.push(mobileIcon);
  else controls.push(page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "搜索" }));

  for (const control of controls) {
    await focusWithKeyboard(page, control);
    await expect(control).toBeFocused();
    const style = await forcedFocusStyle(control);
    expect(style.outlineStyle).toBe("solid");
    expect(style.outlineWidth).toBe("2px");
    expect(style.outlineOffset).toBe("2px");
    expect(style.boxShadow).toBe("none");
    expect(style.forcedColorAdjust).not.toBe("none");
    expect(style.outlineColor).not.toBe("transparent");
  }

  assertFixtureSafety(true);
  await login(page);
  await page.goto(`/admin/posts/${requiredSafeSegment("E2E_FOCUS_ADMIN_POST_ID")}/edit`, {
    waitUntil: "domcontentloaded",
  });
  const adminControls = [
    page.getByRole("textbox", { name: "标题" }),
    page.getByRole("combobox", { name: "分类" }),
    page.getByText("SEO 设置", { exact: true }),
    page.getByRole("button", { name: "保存草稿" }),
    page.getByRole("button", { name: "预览" }),
  ];
  const choice = page.getByRole("checkbox").first();
  if (await choice.count()) adminControls.push(choice);

  for (const control of adminControls) {
    await expect(control).toBeVisible();
    if (await control.isDisabled()) continue;
    await focusWithKeyboard(page, control, 96);
    const style = await forcedFocusStyle(control);
    expect(style.outlineStyle).toBe("solid");
    expect(style.outlineWidth).toBe("2px");
    expect(style.outlineOffset).toBe("2px");
    expect(style.boxShadow).toBe("none");
    expect(style.forcedColorAdjust).not.toBe("none");
    expect(style.outlineColor).not.toBe("transparent");
  }

  await page.goto("/admin/tags", { waitUntil: "domcontentloaded" });
  const dangerLink = page.getByRole("button", { name: "删除" }).first();
  await expect(dangerLink).toBeVisible();
  await focusWithKeyboard(page, dangerLink, 96);
  expect((await forcedFocusStyle(dangerLink)).outlineWidth).toBe("2px");

  await dangerLink.click();
  const dangerAction = page.getByRole("dialog").getByRole("button", { name: "删除" });
  await expect(dangerAction).toBeVisible();
  await focusWithKeyboard(page, dangerAction, 96);
  expect((await forcedFocusStyle(dangerAction)).outlineWidth).toBe("2px");
  await page.keyboard.press("Escape");

  await testInfo.attach(`${testInfo.project.name}-forced-colors-focus.png`, {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
});

test("grayscale keeps input lightness, inset geometry and link decoration distinguishable", async ({ page }, testInfo) => {
  await page.goto("/search", { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: "html { filter: grayscale(1) !important; }" });
  await expect(page.locator("html")).toHaveCSS("filter", "grayscale(1)");

  const input = page.getByRole("searchbox", { name: "搜索文章" });
  const defaultBackground = await input.evaluate((element) => getComputedStyle(element).backgroundColor);
  await focusWithKeyboard(page, input);
  await expect(input).toHaveCSS("background-color", "rgb(247, 230, 226)");
  const focusedBackground = await input.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(
    Math.abs(grayscaleLuminance(defaultBackground) - grayscaleLuminance(focusedBackground)),
    "input focus surface must retain a visible grayscale lightness difference",
  ).toBeGreaterThan(10);

  const submit = page.getByRole("button", { name: "搜索" });
  await focusWithKeyboard(page, submit);
  const submitStyle = await submit.evaluate((element) => getComputedStyle(element).boxShadow);
  expect(submitStyle).toContain("inset");
  expect(submitStyle).toContain("2px");

  const brand = page.getByRole("banner").getByRole("link").first();
  await focusWithKeyboard(page, brand);
  await expect(brand).toHaveCSS("text-decoration-thickness", "2px");
  await expect(brand).toHaveCSS("font-weight", "800");

  await testInfo.attach(`${testInfo.project.name}-grayscale-focus.png`, {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
});

test("text-only 200 percent scaling covers public, dynamic, admin and error routes", async ({ page }, testInfo) => {
  assertFixtureSafety(true);
  const baseURL = projectBaseURL(testInfo);
  const routes: ModeRoute[] = [
    { name: "search", path: "/search" },
    { name: "dynamic-post", path: `/posts/${requiredSafeSegment("E2E_FOCUS_PUBLIC_POST_SLUG")}` },
    { name: "site-error", path: requiredSameOriginPath("E2E_FOCUS_SITE_ERROR_PATH", baseURL), boundaryError: true },
    {
      name: "admin-edit",
      path: `/admin/posts/${requiredSafeSegment("E2E_FOCUS_ADMIN_POST_ID")}/edit`,
      authenticate: true,
    },
    {
      name: "admin-error",
      path: requiredSameOriginPath("E2E_FOCUS_ADMIN_ERROR_PATH", baseURL),
      authenticate: true,
      boundaryError: true,
    },
    { name: "global-error", path: requiredSameOriginPath("E2E_FOCUS_GLOBAL_ERROR_PATH", baseURL), boundaryError: true },
  ];

  for (const route of routes) {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const onConsole = (message: { type(): string; text(): string }) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    };
    const onPageError = (error: Error) => pageErrors.push(error.message);
    page.on("console", onConsole);
    page.on("pageerror", onPageError);

    if (route.authenticate) await login(page);
    const path = typeof route.path === "function" ? route.path(baseURL) : route.path;
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await expect(page.locator("html")).toHaveCSS("font-size", "32px");

    const inventory = await page.locator('a[href], button, input:not([type="hidden"]), select, textarea, summary').evaluateAll(
      (elements) =>
        elements.flatMap((element, index) => {
          if (!(element instanceof HTMLElement) || element.closest("[hidden], [inert]") || element.getClientRects().length === 0) {
            return [];
          }
          const disabled =
            ((element instanceof HTMLButtonElement ||
              element instanceof HTMLInputElement ||
              element instanceof HTMLSelectElement ||
              element instanceof HTMLTextAreaElement) &&
              element.disabled) ||
            element.getAttribute("aria-disabled") === "true";
          if (disabled || element.tabIndex < 0) return [];
          const id = `focus-200-${index}`;
          element.dataset.focus200Id = id;
          return [id];
        }),
    );
    expect(inventory.length, `${route.name} must expose focusable controls at 200%`).toBeGreaterThan(0);

    const audit: Array<Record<string, unknown>> = [];
    for (const id of inventory) {
      const control = page.locator(`[data-focus200-id="${id}"]`);
      await focusWithKeyboard(page, control, 128);
      const metrics = await control.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(element);
        const lineCount = new Set(
          Array.from(range.getClientRects())
            .filter((line) => line.width > 0 && line.height > 0)
            .map((line) => Math.round(line.top * 10) / 10),
        ).size;
        return {
          tagName: element.tagName.toLowerCase(),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          lineCount: Math.max(1, lineCount),
          clientWidth: element.clientWidth,
          clientHeight: element.clientHeight,
          scrollWidth: element.scrollWidth,
          scrollHeight: element.scrollHeight,
        };
      });
      const viewport = page.viewportSize();
      expect(viewport).not.toBeNull();
      expect(metrics.rect.x).toBeGreaterThanOrEqual(0);
      expect(metrics.rect.y).toBeGreaterThanOrEqual(0);
      expect(metrics.rect.x + metrics.rect.width).toBeLessThanOrEqual(viewport!.width);
      expect(metrics.rect.y + metrics.rect.height).toBeLessThanOrEqual(viewport!.height);
      if (!["input", "select", "textarea"].includes(metrics.tagName)) {
        expect(metrics.scrollWidth, `${route.name}/${id} text clipping`).toBeLessThanOrEqual(metrics.clientWidth + 1);
        expect(metrics.scrollHeight, `${route.name}/${id} text clipping`).toBeLessThanOrEqual(metrics.clientHeight + 1);
      }
      audit.push({ id, ...metrics });
    }

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
      `${route.name} must not create horizontal page scrolling at 200%`,
    ).toBe(true);
    expect(consoleErrors.filter((message) => RUNTIME_REGRESSION_PATTERN.test(message))).toEqual([]);
    if (!route.boundaryError) expect(pageErrors).toEqual([]);
    else expect(pageErrors.filter((message) => RUNTIME_REGRESSION_PATTERN.test(message))).toEqual([]);

    await testInfo.attach(`${route.name}-${testInfo.project.name}-text-200-focus.json`, {
      body: Buffer.from(JSON.stringify(audit, null, 2)),
      contentType: "application/json",
    });
    await testInfo.attach(`${route.name}-${testInfo.project.name}-text-200-focus.png`, {
      body: await page.screenshot({ animations: "disabled" }),
      contentType: "image/png",
    });
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }
});
