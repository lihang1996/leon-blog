import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

type RouteCase = {
  name: string;
  path: string;
  control: (page: Page) => Locator;
  prepare?: (page: Page) => Promise<void>;
};

const routeCases: RouteCase[] = [
  { name: "home", path: "/", control: (page) => page.getByRole("link", { name: "查看全部文章" }) },
  { name: "posts", path: "/posts", control: (page) => page.getByRole("banner").getByRole("link").first() },
  { name: "categories", path: "/categories", control: (page) => page.getByRole("banner").getByRole("link").first() },
  { name: "tags", path: "/tags", control: (page) => page.getByRole("banner").getByRole("link").first() },
  { name: "search", path: "/search", control: (page) => page.getByRole("button", { name: "搜索" }) },
  {
    name: "admin-login",
    path: "/admin/login",
    control: (page) => page.getByRole("button", { name: "登录" }),
    prepare: async (page) => {
      await page.getByLabel("邮箱").fill("focus-check@example.com");
      await page.getByLabel("密码").fill("not-submitted-password");
    },
  },
];

const expectUnsafeEval = process.env.EXPECT_CSP_UNSAFE_EVAL === "1";
const runtimeRegressionPattern =
  /eval\(\) is not supported|unsafe-eval|Refused to evaluate|Content Security Policy|hydration|hydrated but some attributes|Minified React error #418/i;

function parseCsp(value: string) {
  const entries = value
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split(/\s+/));
  const names = entries.map(([name]) => name!);
  expect(new Set(names).size, "CSP directives must be unique").toBe(names.length);
  return new Map(entries.map(([name, ...sources]) => [name!, sources]));
}

async function outlineOf(control: Locator) {
  return control.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.outlineColor,
      offset: style.outlineOffset,
      style: style.outlineStyle,
      width: style.outlineWidth,
    };
  });
}

async function expectNoOutline(control: Locator) {
  const outline = await outlineOf(control);
  expect(outline.style === "none" || outline.width === "0px", JSON.stringify(outline)).toBe(true);
}

async function expectTypedFocusIndicator(control: Locator) {
  const indicator = await control.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      className: element.className,
      boxShadow: style.boxShadow,
      decorationThickness: style.textDecorationThickness,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });

  expect(
    indicator.outlineStyle === "none" || indicator.outlineWidth === "0px",
    JSON.stringify(indicator),
  ).toBe(true);

  if (/focus-(?:action|icon|surface|skip)/.test(String(indicator.className))) {
    expect(indicator.boxShadow, JSON.stringify(indicator)).toContain("inset");
    expect(indicator.boxShadow, JSON.stringify(indicator)).toContain("2px");
    return;
  }

  expect(String(indicator.className)).toMatch(/focus-(?:link|nav)/);
  expect(indicator.decorationThickness).toBe("2px");
}

async function expectControlFitsViewport(control: Locator, testInfo: TestInfo) {
  const box = await control.boundingBox();
  expect(box).not.toBeNull();

  const viewport = testInfo.project.use.viewport!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);

  const contentFits = await control.evaluate(
    (element) =>
      element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1,
  );
  expect(contentFits, "representative control content must not be clipped or truncated").toBe(true);
}

async function focusWithKeyboard(page: Page, control: Locator) {
  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.press("Tab");
    if (await control.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error("The representative control was not reached within 24 Tab presses");
}

async function assertSemanticStyles(page: Page, route: RouteCase) {
  if (route.path === "/") {
    const primary = page.getByRole("link", { name: /^(阅读最新文章|浏览文章)$/ });
    const secondary = page.getByRole("link", { name: "查看全部文章" });
    await expect(primary).toHaveCSS("background-color", "rgb(195, 74, 50)");
    await expect(primary).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(secondary).toHaveCSS("border-top-width", "1px");
    await expect(secondary).toHaveCSS("border-top-color", "rgb(215, 209, 199)");
  }

  if (route.path === "/search" || route.path === "/admin/login") {
    const input = route.path === "/search" ? page.getByLabel("搜索文章") : page.getByLabel("邮箱");
    await expect(input).toHaveCSS("border-top-width", "1px");
    await expect(input).toHaveCSS("border-top-color", "rgb(215, 209, 199)");
  }

  if (route.path === "/admin/login") {
    const submit = page.getByRole("button", { name: "登录" });
    await expect(submit).toBeEnabled();
    await expect(submit).toHaveCSS("background-color", "rgb(195, 74, 50)");
    await expect(submit).toHaveCSS("color", "rgb(255, 255, 255)");
  }
}

async function attachFocusedScreenshot(page: Page, testInfo: TestInfo, routeName: string) {
  await testInfo.attach(`${routeName}-${testInfo.project.name}-focus-visible.png`, {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
}

for (const route of routeCases) {
  test(`${route.name}: default, pointer and keyboard focus states`, async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
    expect(response, `${route.path} must return a document response`).not.toBeNull();
    expect(response!.ok(), `${route.path} returned ${response!.status()}`).toBe(true);

    const cspHeaders = (await response!.headersArray()).filter(
      (header) => header.name.toLowerCase() === "content-security-policy",
    );
    expect(cspHeaders, `${route.path} must return exactly one CSP header`).toHaveLength(1);
    const directives = parseCsp(cspHeaders[0]!.value);
    const scriptSources = directives.get("script-src") ?? [];
    expect(scriptSources).toContain("'self'");
    expect(scriptSources).toContain("'unsafe-inline'");
    if (expectUnsafeEval) expect(scriptSources).toContain("'unsafe-eval'");
    else expect(scriptSources).not.toContain("'unsafe-eval'");
    expect(directives.get("default-src")).toEqual(["'self'"]);
    expect(directives.get("object-src")).toEqual(["'none'"]);
    expect(directives.get("base-uri")).toEqual(["'self'"]);
    expect(directives.get("form-action")).toEqual(["'self'"]);
    expect(directives.get("frame-ancestors")).toEqual(["'none'"]);

    await route.prepare?.(page);
    const control = route.control(page);
    await expect(control).toBeVisible();
    await expectNoOutline(control);

    await control.evaluate((element) => {
      element.addEventListener("click", (event) => event.preventDefault(), { once: true });
    });
    await control.click();
    await expectNoOutline(control);

    await page.reload({ waitUntil: "domcontentloaded" });
    await route.prepare?.(page);
    await expect(control).toBeVisible();
    await focusWithKeyboard(page, control);
    await expect(control).toBeFocused();
    await expectTypedFocusIndicator(control);

    await expectControlFitsViewport(control, testInfo);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
    ).toBe(true);
    await assertSemanticStyles(page, route);
    await attachFocusedScreenshot(page, testInfo, route.name);

    const relevantConsoleErrors = consoleErrors.filter((message) => runtimeRegressionPattern.test(message));
    expect(relevantConsoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}

test("client navigation keeps React diagnostics and hydration CSP-clean", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "查看全部文章" }).click();
  await page.waitForURL(/\/posts$/);
  await expect(page.getByRole("heading", { name: "全部文章" })).toBeVisible();

  expect(errors.filter((message) => runtimeRegressionPattern.test(message))).toEqual([]);
});
