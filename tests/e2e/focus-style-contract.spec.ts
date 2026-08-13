import { expect, test, type Locator, type Page } from "@playwright/test";

const SURFACE = "rgb(255, 255, 255)";
const FOCUS_SURFACE = "rgb(247, 230, 226)";
const FOCUS_ACCENT = "rgb(169, 59, 39)";
const FOCUS_ON_ACCENT = "rgb(255, 255, 255)";

type Rect = { x: number; y: number; width: number; height: number };

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

async function styleOf(control: Locator) {
  return control.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderTopColor,
      borderWidth: style.borderTopWidth,
      boxShadow: style.boxShadow,
      color: style.color,
      fontWeight: style.fontWeight,
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      textDecorationThickness: style.textDecorationThickness,
      textUnderlineOffset: style.textUnderlineOffset,
    };
  });
}

async function placeholderStyleOf(control: Locator) {
  return control.evaluate((element) => {
    const style = getComputedStyle(element, "::placeholder");
    return { color: style.color, opacity: style.opacity };
  });
}

function rgbChannels(value: string): [number, number, number] {
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) throw new Error(`Expected an RGB color, received ${value}`);
  return channels as [number, number, number];
}

function relativeLuminance(value: string): number {
  const channels = rgbChannels(value).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

async function rectOf(control: Locator): Promise<Rect> {
  const rect = await control.boundingBox();
  expect(rect).not.toBeNull();
  return rect!;
}

function expectRectStable(before: Rect, after: Rect): void {
  expect(after.x).toBeCloseTo(before.x, 1);
  expect(after.y).toBeCloseTo(before.y, 1);
  expect(after.width).toBeCloseTo(before.width, 1);
  expect(after.height).toBeCloseTo(before.height, 1);
}

function expectNoOuterOutline(style: Awaited<ReturnType<typeof styleOf>>): void {
  expect(style.outlineStyle === "none" || style.outlineWidth === "0px", JSON.stringify(style)).toBe(true);
}

async function preventNavigation(control: Locator): Promise<void> {
  await control.evaluate((element) => {
    element.addEventListener("click", (event) => event.preventDefault());
  });
}

test("input focus uses a warm internal surface without changing geometry or its semantic border", async ({ page }) => {
  await page.goto("/search", { waitUntil: "domcontentloaded" });

  const input = page.getByRole("searchbox", { name: "搜索文章" });
  const submit = page.getByRole("button", { name: "搜索" });
  await expect(input).toBeVisible();
  await expect(submit).toBeVisible();

  const inputBefore = await rectOf(input);
  const submitBefore = await rectOf(submit);
  const defaultStyle = await styleOf(input);
  expect(defaultStyle.backgroundColor).toBe(SURFACE);
  expect(defaultStyle.borderWidth).toBe("1px");
  expect(defaultStyle.boxShadow).toBe("none");
  const defaultPlaceholder = await placeholderStyleOf(input);
  expect(defaultPlaceholder.opacity).toBe("1");
  expect(contrastRatio(defaultPlaceholder.color, defaultStyle.backgroundColor)).toBeGreaterThanOrEqual(4.5);

  await input.click();
  await expect(input).toHaveCSS("background-color", FOCUS_SURFACE);
  const pointerStyle = await styleOf(input);
  expect(pointerStyle.borderColor).toBe(defaultStyle.borderColor);
  expect(pointerStyle.borderWidth).toBe(defaultStyle.borderWidth);
  expect(pointerStyle.boxShadow).toBe("none");
  expectNoOuterOutline(pointerStyle);
  const focusedPlaceholder = await placeholderStyleOf(input);
  expect(focusedPlaceholder.opacity).toBe("1");
  expect(contrastRatio(focusedPlaceholder.color, pointerStyle.backgroundColor)).toBeGreaterThanOrEqual(4.5);

  await input.blur();
  await expect(input).toHaveCSS("background-color", SURFACE);

  await focusWithKeyboard(page, input);
  await expect(input).toBeFocused();
  await expect(input).toHaveCSS("background-color", FOCUS_SURFACE);
  const keyboardStyle = await styleOf(input);
  expect(keyboardStyle.borderColor).toBe(defaultStyle.borderColor);
  expect(keyboardStyle.borderWidth).toBe(defaultStyle.borderWidth);
  expect(keyboardStyle.boxShadow).toBe("none");
  expectNoOuterOutline(keyboardStyle);

  expectRectStable(inputBefore, await rectOf(input));
  expectRectStable(submitBefore, await rectOf(submit));

  await input.blur();
  await input.evaluate((element) => {
    (element as HTMLInputElement).readOnly = true;
  });
  await input.focus();
  await expect(input).toHaveCSS("background-color", SURFACE);
});

test("primary and secondary actions distinguish pointer press from keyboard focus with inset strokes", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const primary = page.getByRole("link", { name: /^(阅读最新文章|浏览文章)$/ });
  const secondary = page.getByRole("link", { name: "查看全部文章" });
  await expect(primary).toBeVisible();
  await expect(secondary).toBeVisible();
  await preventNavigation(primary);
  await preventNavigation(secondary);

  const primaryBefore = await rectOf(primary);
  const secondaryBefore = await rectOf(secondary);
  await primary.hover();
  const hoverStyle = await styleOf(primary);
  const box = await primary.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  const pressedStyle = await styleOf(primary);
  expect(pressedStyle.boxShadow).toBe("none");
  expectNoOuterOutline(pressedStyle);
  expect(pressedStyle.backgroundColor).not.toBe(hoverStyle.backgroundColor);
  await page.mouse.up();

  await focusWithKeyboard(page, primary);
  await expect(primary).toHaveCSS("background-color", FOCUS_ACCENT);
  const primaryFocus = await styleOf(primary);
  expect(primaryFocus.boxShadow).toContain("inset");
  expect(primaryFocus.boxShadow).toContain("2px");
  expect(primaryFocus.boxShadow).toContain(FOCUS_ON_ACCENT);
  expectNoOuterOutline(primaryFocus);
  expect(primaryFocus.boxShadow).not.toBe(pressedStyle.boxShadow);
  expectRectStable(primaryBefore, await rectOf(primary));
  expectRectStable(secondaryBefore, await rectOf(secondary));

  await secondary.hover();
  const secondaryHover = await styleOf(secondary);
  const secondaryBox = await secondary.boundingBox();
  expect(secondaryBox).not.toBeNull();
  await page.mouse.move(
    secondaryBox!.x + secondaryBox!.width / 2,
    secondaryBox!.y + secondaryBox!.height / 2,
  );
  await page.mouse.down();
  const secondaryPressed = await styleOf(secondary);
  expect(secondaryPressed.backgroundColor).not.toBe(secondaryHover.backgroundColor);
  expect(secondaryPressed.boxShadow).toBe("none");
  expectNoOuterOutline(secondaryPressed);
  await page.mouse.up();

  await focusWithKeyboard(page, secondary);
  await expect(secondary).toHaveCSS("background-color", FOCUS_SURFACE);
  const secondaryFocus = await styleOf(secondary);
  expect(secondaryFocus.boxShadow).toContain("inset");
  expect(secondaryFocus.boxShadow).toContain("2px");
  expect(secondaryFocus.boxShadow).toContain(FOCUS_ACCENT);
  expectNoOuterOutline(secondaryFocus);
  expectRectStable(primaryBefore, await rectOf(primary));
  expectRectStable(secondaryBefore, await rectOf(secondary));
});

test("keyboard Enter and Space compose pressed feedback with the persistent focus indicator", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const secondaryLink = page.getByRole("link", { name: "查看全部文章" });
  await preventNavigation(secondaryLink);
  await focusWithKeyboard(page, secondaryLink);
  const secondaryFocused = await styleOf(secondaryLink);
  expect(secondaryFocused.boxShadow).toContain("inset");
  expect(secondaryFocused.boxShadow).toContain("2px");

  await page.keyboard.down("Enter");
  const secondaryPressed = await styleOf(secondaryLink);
  expect(secondaryPressed.backgroundColor).not.toBe(secondaryFocused.backgroundColor);
  expect(secondaryPressed.boxShadow).toContain("inset");
  expect(secondaryPressed.boxShadow).toContain("2px");
  expectNoOuterOutline(secondaryPressed);
  await page.keyboard.up("Enter");
  await expect(secondaryLink).toHaveCSS("background-color", FOCUS_SURFACE);

  await page.goto("/search", { waitUntil: "domcontentloaded" });
  const primaryButton = page.getByRole("button", { name: "搜索" });
  await preventNavigation(primaryButton);
  await focusWithKeyboard(page, primaryButton);
  const primaryFocused = await styleOf(primaryButton);
  expect(primaryFocused.boxShadow).toContain("inset");
  expect(primaryFocused.boxShadow).toContain("2px");

  await page.keyboard.down("Space");
  const primaryPressed = await styleOf(primaryButton);
  expect(primaryPressed.backgroundColor).not.toBe(primaryFocused.backgroundColor);
  expect(primaryPressed.boxShadow).toContain("inset");
  expect(primaryPressed.boxShadow).toContain("2px");
  expectNoOuterOutline(primaryPressed);
  await page.keyboard.up("Space");
  await expect(primaryButton).toHaveCSS("background-color", FOCUS_ACCENT);
});

test("disabled button variants ignore hover styling", async ({ page }) => {
  await page.goto("/search", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "disabled-button-probes";
    host.className = "fixed bottom-0 left-0 z-50 flex gap-2 bg-surface p-2";
    const variants = [
      {
        name: "primary",
        classes:
          "focus-action-primary bg-accent text-white enabled:hover:bg-accent-text disabled:bg-border disabled:text-text-muted",
      },
      {
        name: "secondary",
        classes:
          "focus-action-secondary border border-border bg-surface text-text enabled:hover:border-accent-text enabled:hover:text-accent-text",
      },
      {
        name: "danger",
        classes:
          "focus-action-danger border border-danger/40 bg-surface text-danger enabled:hover:bg-danger enabled:hover:text-white",
      },
    ];

    for (const variant of variants) {
      const button = document.createElement("button");
      button.disabled = true;
      button.dataset.testid = `disabled-${variant.name}`;
      button.className = `min-h-11 rounded-md px-5 disabled:opacity-60 ${variant.classes}`;
      button.textContent = variant.name;
      host.append(button);
    }
    document.body.append(host);
  });

  for (const variant of ["primary", "secondary", "danger"]) {
    const button = page.getByTestId(`disabled-${variant}`);
    await expect(button).toBeDisabled();
    const before = await styleOf(button);
    await button.hover({ force: true });
    const hovered = await styleOf(button);
    expect({
      backgroundColor: hovered.backgroundColor,
      borderColor: hovered.borderColor,
      color: hovered.color,
    }).toEqual({
      backgroundColor: before.backgroundColor,
      borderColor: before.borderColor,
      color: before.color,
    });
  }
});

test("pointer and real-touch activation leave no keyboard-only outline behind", async ({ page }, testInfo) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const primary = page.getByRole("link", { name: /^(阅读最新文章|浏览文章)$/ });
  await expect(primary).toBeVisible();
  await preventNavigation(primary);
  const box = await primary.boundingBox();
  expect(box).not.toBeNull();
  const point = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };

  if (testInfo.project.use.hasTouch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);

  const afterActivation = await styleOf(primary);
  expectNoOuterOutline(afterActivation);
  expect(afterActivation.boxShadow).toBe("none");
});

test("current navigation remains persistent and combines with a stronger temporary focus state", async ({ page }) => {
  await page.goto("/search", { waitUntil: "domcontentloaded" });

  const desktopNav = page.getByRole("navigation", { name: "主导航" });
  let navigation = desktopNav;
  if (!(await desktopNav.isVisible())) {
    const trigger = page.locator('button[aria-controls="mobile-nav-panel"]');
    await trigger.click();
    navigation = page.getByRole("navigation", { name: "移动端导航" });
    await expect(navigation).toBeVisible();
  }

  const current = navigation.getByRole("link", { name: "搜索" });
  const other = navigation.getByRole("link", { name: "文章" });
  await expect(current).toHaveAttribute("aria-current", "page");
  await expect(other).not.toHaveAttribute("aria-current");
  await expect(current).toHaveCSS("font-weight", "600");
  await expect(current).toHaveCSS("text-decoration-thickness", "1px");
  const currentBefore = await rectOf(current);

  await focusWithKeyboard(page, other);
  await expect(other).toBeFocused();
  await expect(other).toHaveCSS("font-weight", "600");
  await expect(other).toHaveCSS("text-decoration-thickness", "2px");
  expectNoOuterOutline(await styleOf(other));

  await focusWithKeyboard(page, current);
  await expect(current).toBeFocused();
  await expect(current).toHaveAttribute("aria-current", "page");
  await expect(current).toHaveCSS("font-weight", "700");
  await expect(current).toHaveCSS("text-decoration-thickness", "2px");
  expectNoOuterOutline(await styleOf(current));
  expectRectStable(currentBefore, await rectOf(current));

  await page.keyboard.press("Tab");
  await expect(current).not.toBeFocused();
  await expect(current).toHaveAttribute("aria-current", "page");
  await expect(current).toHaveCSS("font-weight", "600");
  await expect(current).toHaveCSS("text-decoration-thickness", "1px");
});

test("responsive header exposes either a 44px icon focus target or a strong text-link indicator", async ({ page }) => {
  await page.goto("/search", { waitUntil: "domcontentloaded" });

  const trigger = page.locator('button[aria-controls="mobile-nav-panel"]');
  if (await trigger.isVisible()) {
    const defaultStyle = await styleOf(trigger);
    const box = await trigger.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    const pressedStyle = await styleOf(trigger);
    expect(pressedStyle.backgroundColor).not.toBe(defaultStyle.backgroundColor);
    expect(pressedStyle.boxShadow).toBe("none");
    expectNoOuterOutline(pressedStyle);
    await page.mouse.up();

    await focusWithKeyboard(page, trigger);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveCSS("background-color", FOCUS_SURFACE);
    const style = await styleOf(trigger);
    expect(style.boxShadow).toContain("inset");
    expect(style.boxShadow).toContain(FOCUS_ACCENT);
    expectNoOuterOutline(style);
    const rect = await rectOf(trigger);
    expect(rect.width).toBeGreaterThanOrEqual(44);
    expect(rect.height).toBeGreaterThanOrEqual(44);
    return;
  }

  const brand = page.getByRole("banner").getByRole("link").first();
  await focusWithKeyboard(page, brand);
  await expect(brand).toBeFocused();
  await expect(brand).toHaveCSS("font-weight", "800");
  await expect(brand).toHaveCSS("text-decoration-thickness", "2px");
  expectNoOuterOutline(await styleOf(brand));
});
