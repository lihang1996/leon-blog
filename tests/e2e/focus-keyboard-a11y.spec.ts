import { expect, test, type Locator, type Page } from "@playwright/test";

function requiredFixture(name: string): string {
  const value = process.env[name];
  expect(value, `${name} must identify an isolated QA fixture`).toBeTruthy();
  return value!;
}

function requiredSafeSegment(name: string): string {
  const value = requiredFixture(name);
  expect(value, `${name} must not include surrounding whitespace`).toBe(value.trim());
  expect(value, `${name} must be one relative path segment`).toMatch(/^[\p{L}\p{N}_-]+$/u);
  expect(value, `${name} must not contain an encoded path escape`).not.toContain("%");
  expect(value, `${name} must not be a dot segment`).not.toMatch(/^\.{1,2}$/);
  return value;
}

function assertDynamicFixtureSafety(): void {
  expect(requiredFixture("E2E_FOCUS_FIXTURE_SCOPE")).toMatch(/(?:^|[-_/])(test|ci|e2e|tmp)(?:$|[-_/])/i);
  expect(requiredFixture("AGENT_OS_TEST_RESOURCE_SENTINEL")).toBe("true");
}

async function resetSequentialFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.body.tabIndex = -1;
    document.body.focus();
    document.body.removeAttribute("tabindex");
  });
}

async function focusWithKeyboard(page: Page, target: Locator, maximumTabs = 48): Promise<void> {
  await resetSequentialFocus(page);
  for (let index = 0; index < maximumTabs; index += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`Target was not reached in ${maximumTabs} Tab presses`);
}

test("skip navigation is the first keyboard stop and transfers focus to main content", async ({ page }) => {
  await page.goto("/search", { waitUntil: "domcontentloaded" });
  await resetSequentialFocus(page);

  const skipLink = page.getByRole("link", { name: "跳到主要内容" });
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await expect(skipLink).toHaveCSS("background-color", "rgb(169, 59, 39)");
  await expect(skipLink).toHaveCSS("color", "rgb(255, 255, 255)");

  const skipStyle = await skipLink.evaluate((element) => {
    const style = getComputedStyle(element);
    return { boxShadow: style.boxShadow, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(skipStyle.boxShadow).toContain("inset");
  expect(skipStyle.boxShadow).toContain("2px");
  expect(skipStyle.outlineStyle === "none" || skipStyle.outlineWidth === "0px").toBe(true);

  await page.keyboard.press("Enter");
  const main = page.locator("#main-content");
  await expect(main).toBeFocused();
  expect(new URL(page.url()).hash).toBe("#main-content");
});

test("responsive navigation preserves native disclosure semantics, keyboard entry and focus return", async ({ page }) => {
  await page.goto("/search", { waitUntil: "domcontentloaded" });

  const trigger = page.locator('button[aria-controls="mobile-nav-panel"]');
  if (!(await trigger.isVisible())) {
    const desktopNav = page.getByRole("navigation", { name: "主导航" });
    const current = desktopNav.getByRole("link", { name: "搜索" });
    await expect(desktopNav).toBeVisible();
    await expect(current).toHaveAttribute("aria-current", "page");
    await focusWithKeyboard(page, current);
    await expect(current).toBeFocused();
    await expect(current).toHaveCSS("text-decoration-thickness", "2px");
    return;
  }

  const panel = page.locator("#mobile-nav-panel");
  const searchShortcut = page.getByRole("link", { name: "搜索文章" });
  await expect(trigger).toHaveAccessibleName("打开菜单");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).not.toHaveAttribute("aria-haspopup");
  await expect(panel).toBeHidden();

  await focusWithKeyboard(page, trigger);
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAccessibleName("关闭菜单");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible();

  let mobileNav = page.getByRole("navigation", { name: "移动端导航" });
  let firstLink = mobileNav.getByRole("link", { name: "文章" });
  await expect(firstLink).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(trigger).toHaveAccessibleName("打开菜单");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(searchShortcut).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Space");
  await expect(panel).toBeVisible();
  mobileNav = page.getByRole("navigation", { name: "移动端导航" });
  firstLink = mobileNav.getByRole("link", { name: "文章" });
  await expect(firstLink).toBeFocused();

  const currentLink = mobileNav.getByRole("link", { name: "搜索" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(currentLink).toBeFocused();
  await expect(currentLink).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Enter");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("dynamic route keeps mobile-menu focus when the pathname Suspense content resolves", async ({ page }) => {
  assertDynamicFixtureSafety();
  const postSlug = requiredSafeSegment("E2E_FOCUS_PUBLIC_POST_SLUG");
  // `commit` deliberately exposes the shared navigation shell before the
  // streamed dynamic route has necessarily resolved its pathname boundary.
  const response = await page.goto(`/posts/${postSlug}`, { waitUntil: "commit" });
  expect(response?.ok()).toBe(true);

  const trigger = page.locator('button[aria-controls="mobile-nav-panel"]');
  const panel = page.locator("#mobile-nav-panel");
  if (!(await trigger.isVisible())) {
    const desktopCurrent = page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "文章" });
    await expect(page.getByRole("heading", { name: requiredFixture("E2E_FOCUS_PUBLIC_POST_TITLE") })).toBeVisible();
    await expect(desktopCurrent).toHaveAttribute("aria-current", "page");
    await focusWithKeyboard(page, desktopCurrent);
    await expect(desktopCurrent).toBeFocused();
    return;
  }

  await expect(trigger).toBeVisible();
  await focusWithKeyboard(page, trigger);
  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();

  const firstLink = page.getByRole("navigation", { name: "移动端导航" }).getByRole("link", { name: "文章" });
  await expect(firstLink).toBeFocused();
  await expect(page.getByRole("heading", { name: requiredFixture("E2E_FOCUS_PUBLIC_POST_TITLE") })).toBeVisible();
  await expect(firstLink).toBeFocused();
  await expect(page.locator("body")).not.toBeFocused();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("links keep native Enter activation and do not masquerade as Space-activated buttons", async ({ page }) => {
  await page.goto("/search", { waitUntil: "domcontentloaded" });

  const link = page.getByRole("navigation", { name: "页脚导航" }).getByRole("link", { name: "文章" });
  await expect(link).toBeVisible();
  await link.evaluate((element) => {
    (element as HTMLElement).dataset.activationCount = "0";
    element.addEventListener("click", (event) => {
      event.preventDefault();
      const current = Number((element as HTMLElement).dataset.activationCount ?? "0");
      (element as HTMLElement).dataset.activationCount = String(current + 1);
    });
  });

  await link.focus();
  await page.keyboard.press("Space");
  await expect(link).toHaveAttribute("data-activation-count", "0");
  expect(new URL(page.url()).pathname).toBe("/search");

  await page.keyboard.press("Enter");
  await expect(link).toHaveAttribute("data-activation-count", "1");
  expect(new URL(page.url()).pathname).toBe("/search");
});

test("login controls support forward and reverse Tab order without submitting credentials", async ({ page }) => {
  await page.goto("/admin/login", { waitUntil: "domcontentloaded" });

  const email = page.getByRole("textbox", { name: "邮箱" });
  const password = page.getByLabel("密码");
  const submit = page.getByRole("button", { name: "登录" });
  await expect(submit).toBeDisabled();

  await resetSequentialFocus(page);
  await page.keyboard.press("Tab");
  await expect(email).toBeFocused();
  await page.keyboard.type("focus-check@example.com");

  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  await page.keyboard.type("not-submitted-password");
  await expect(submit).toBeEnabled();

  await page.keyboard.press("Tab");
  await expect(submit).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(password).toBeFocused();
  expect(new URL(page.url()).pathname).toBe("/admin/login");
});
