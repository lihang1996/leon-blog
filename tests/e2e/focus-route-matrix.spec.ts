import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { login } from "./helpers";

type RouteCase = {
  name: string;
  path: string | ((baseURL: string) => string);
  heading: string | RegExp | (() => string);
  authenticate?: boolean;
  currentFooterLabel?: string;
  fixtureBacked?: boolean;
  statusCodes?: number[];
  expectedBoundaryError?: boolean;
  expectedBoundaryErrorEnv?: string;
  expectSelectedState?: boolean;
};

type Rect = { x: number; y: number; width: number; height: number };

type ControlSnapshot = {
  id: string;
  tagName: string;
  className: string;
  carrierClassName: string;
  disabled: boolean;
  readOnly: boolean;
  ariaCurrent: string | null;
  ariaInvalid: string | null;
  checked: boolean | null;
  scopedMarkdownLink: boolean;
  rect: Rect;
  carrierRect: Rect;
  adjacentAnchor: { id: string; rect: Rect } | null;
  pageScrollX: number;
  pageScrollY: number;
  lineCount: number;
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  backgroundColor: string;
  borderColor: string;
  borderWidth: string;
  boxShadow: string;
  color: string;
  fontWeight: string;
  outlineColor: string;
  outlineStyle: string;
  outlineWidth: string;
  textDecorationThickness: string;
  transform: string;
};

type RouteAudit = {
  route: string;
  controls: Array<{
    id: string;
    default: ControlSnapshot;
    hover: ControlSnapshot;
    pressed?: ControlSnapshot;
    pointerReleased?: ControlSnapshot;
    keyboardFocus?: ControlSnapshot;
  }>;
  disabledControlIds: string[];
  selectedStateBefore: string[];
  selectedStateAfter: string[];
  documentScrollWidthBefore: number;
  documentScrollWidthAfter: number;
  documentClientWidth: number;
};

const INTERACTIVE_SELECTOR =
  'a[href], button, input:not([type="hidden"]), select, textarea, summary';
const TYPED_FOCUS_PATTERN =
  /\bfocus-(?:input|action-primary|action-secondary|action-danger|icon|surface|link|link-strong|link-danger|nav|skip|choice|disclosure)\b/;
function requiredFixture(name: string): string {
  const value = process.env[name];
  expect(value, `${name} must identify an isolated QA fixture`).toBeTruthy();
  return value!;
}

function assertFixtureSafety(): void {
  expect(requiredFixture("E2E_FOCUS_FIXTURE_SCOPE")).toMatch(/(?:^|[-_/])(test|ci|e2e|tmp)(?:$|[-_/])/i);
  expect(
    requiredFixture("AGENT_OS_TEST_RESOURCE_SENTINEL"),
    "dynamic/admin focus fixtures require the exact test-resource sentinel",
  ).toBe("true");
}

function assertAuthenticatedFixtureSafety(): void {
  assertFixtureSafety();
  expect(process.env.E2E_ADMIN_EMAIL, "E2E_ADMIN_EMAIL must be explicitly supplied").toBeTruthy();
  expect(process.env.E2E_ADMIN_PASSWORD, "E2E_ADMIN_PASSWORD must be explicitly supplied").toBeTruthy();
}

function requiredSafeSegment(name: string): string {
  const value = requiredFixture(name);
  expect(value, `${name} must not include surrounding whitespace`).toBe(value.trim());
  expect(value, `${name} must be one relative path segment`).toMatch(/^[\p{L}\p{N}_-]+$/u);
  expect(value, `${name} must not contain an encoded path escape`).not.toContain("%");
  expect(value, `${name} must not be a dot segment`).not.toMatch(/^\.{1,2}$/);
  return value;
}

function requiredSameOriginPath(name: string, baseURL: string): string {
  const value = requiredFixture(name);
  expect(value, `${name} must not include surrounding whitespace`).toBe(value.trim());
  expect(value, `${name} must begin with exactly one slash`).toMatch(/^\/(?!\/)/);
  expect(value, `${name} must not contain a backslash`).not.toContain("\\");
  expect(value, `${name} must not contain query or hash data`).not.toMatch(/[?#]/);
  expect(value, `${name} must not contain encoded path escapes`).not.toContain("%");
  expect(value, `${name} must contain only relative path characters`).toMatch(/^\/[\p{L}\p{N}_/-]*$/u);
  expect(value, `${name} must not contain empty or dot segments`).not.toMatch(/\/\/?(?:\.{1,2})(?:\/|$)|\/\//);

  const base = new URL(baseURL);
  const resolved = new URL(value, base);
  expect(resolved.origin, `${name} must remain on the configured loopback origin`).toBe(base.origin);
  expect(resolved.search).toBe("");
  expect(resolved.hash).toBe("");
  return value;
}

function requiredSameOriginPaginationPath(name: string, baseURL: string): string {
  const value = requiredFixture(name);
  expect(value, `${name} must not include surrounding whitespace`).toBe(value.trim());
  expect(value, `${name} must be a same-origin relative pagination path`).toMatch(
    /^\/[\p{L}\p{N}_/-]*\?page=[1-9]\d*$/u,
  );
  expect(value, `${name} must not contain a backslash`).not.toContain("\\");
  expect(value, `${name} must not contain encoded path escapes or a hash`).not.toMatch(/[%#]/);
  expect(value, `${name} must not contain empty or dot segments`).not.toMatch(
    /\/\/?(?:\.{1,2})(?:\/|\?|$)|\/\//,
  );

  const base = new URL(baseURL);
  const resolved = new URL(value, base);
  expect(resolved.origin, `${name} must remain on the configured loopback origin`).toBe(base.origin);
  expect([...resolved.searchParams.keys()]).toEqual(["page"]);
  expect(Number(resolved.searchParams.get("page"))).toBeGreaterThan(1);
  expect(resolved.hash).toBe("");
  return value;
}

function projectBaseURL(testInfo: TestInfo): string {
  const baseURL = testInfo.project.use.baseURL;
  expect(typeof baseURL, "Playwright project must define a baseURL").toBe("string");
  return baseURL as string;
}

const routes: RouteCase[] = [
  { name: "home", path: "/", heading: /你好.*Leon/ },
  { name: "posts", path: "/posts", heading: "全部文章", currentFooterLabel: "文章", expectSelectedState: true },
  { name: "categories", path: "/categories", heading: "分类", currentFooterLabel: "分类", expectSelectedState: true },
  { name: "tags", path: "/tags", heading: "标签", currentFooterLabel: "标签", expectSelectedState: true },
  {
    name: "post-detail",
    path: () => {
      return `/posts/${requiredSafeSegment("E2E_FOCUS_PUBLIC_POST_SLUG")}`;
    },
    heading: () => requiredFixture("E2E_FOCUS_PUBLIC_POST_TITLE"),
    currentFooterLabel: "文章",
    fixtureBacked: true,
    expectSelectedState: true,
  },
  {
    name: "category-detail",
    path: () => {
      return `/categories/${requiredSafeSegment("E2E_FOCUS_PUBLIC_CATEGORY_SLUG")}`;
    },
    heading: () => requiredFixture("E2E_FOCUS_PUBLIC_CATEGORY_NAME"),
    currentFooterLabel: "分类",
    fixtureBacked: true,
    expectSelectedState: true,
  },
  {
    name: "tag-detail",
    path: () => {
      return `/tags/${requiredSafeSegment("E2E_FOCUS_PUBLIC_TAG_SLUG")}`;
    },
    heading: () => `#${requiredFixture("E2E_FOCUS_PUBLIC_TAG_NAME")}`,
    currentFooterLabel: "标签",
    fixtureBacked: true,
    expectSelectedState: true,
  },
  {
    name: "site-not-found",
    path: () => {
      return `/posts/${requiredSafeSegment("E2E_FOCUS_MISSING_SLUG")}`;
    },
    heading: "页面不存在",
    fixtureBacked: true,
    statusCodes: [200, 404],
    expectSelectedState: true,
  },
  {
    name: "search",
    path: "/search",
    heading: "搜索",
    expectSelectedState: true,
  },
  {
    name: "admin-login",
    path: "/admin/login",
    heading: "登录管理后台",
  },
  {
    name: "not-found",
    path: "/focus-contract-missing-page",
    heading: /页面不存在/,
    statusCodes: [200, 404],
  },
  {
    name: "site-error",
    path: (baseURL) => requiredSameOriginPath("E2E_FOCUS_SITE_ERROR_PATH", baseURL),
    heading: "页面出错了",
    fixtureBacked: true,
    statusCodes: [200, 500],
    expectedBoundaryError: true,
    expectedBoundaryErrorEnv: "E2E_FOCUS_SITE_ERROR_MESSAGE",
  },
  {
    name: "global-error",
    path: (baseURL) => requiredSameOriginPath("E2E_FOCUS_GLOBAL_ERROR_PATH", baseURL),
    heading: "出错了",
    fixtureBacked: true,
    statusCodes: [200, 500],
    expectedBoundaryError: true,
    expectedBoundaryErrorEnv: "E2E_FOCUS_GLOBAL_ERROR_MESSAGE",
  },
  { name: "admin-overview", path: "/admin", heading: "概览", authenticate: true, fixtureBacked: true, expectSelectedState: true },
  { name: "admin-posts", path: "/admin/posts", heading: "文章", authenticate: true, fixtureBacked: true, expectSelectedState: true },
  { name: "admin-new-post", path: "/admin/posts/new", heading: "新建文章", authenticate: true, fixtureBacked: true, expectSelectedState: true },
  {
    name: "admin-edit-post",
    path: () => `/admin/posts/${requiredSafeSegment("E2E_FOCUS_ADMIN_POST_ID")}/edit`,
    heading: "编辑文章",
    authenticate: true,
    fixtureBacked: true,
    expectSelectedState: true,
  },
  {
    name: "admin-preview-post",
    path: () => `/admin/posts/${requiredSafeSegment("E2E_FOCUS_ADMIN_POST_ID")}/preview`,
    heading: () => requiredFixture("E2E_FOCUS_ADMIN_POST_TITLE"),
    authenticate: true,
    fixtureBacked: true,
    expectSelectedState: true,
  },
  { name: "admin-categories", path: "/admin/categories", heading: "分类管理", authenticate: true, fixtureBacked: true, expectSelectedState: true },
  { name: "admin-tags", path: "/admin/tags", heading: "标签管理", authenticate: true, fixtureBacked: true, expectSelectedState: true },
  {
    name: "admin-error",
    path: (baseURL) => requiredSameOriginPath("E2E_FOCUS_ADMIN_ERROR_PATH", baseURL),
    heading: "管理端加载失败",
    authenticate: true,
    fixtureBacked: true,
    statusCodes: [200, 500],
    expectedBoundaryError: true,
    expectedBoundaryErrorEnv: "E2E_FOCUS_ADMIN_ERROR_MESSAGE",
    expectSelectedState: true,
  },
];

const runtimeRegressionPattern =
  /eval\(\) is not supported|unsafe-eval|Refused to evaluate|Content Security Policy|hydration|hydrated but some attributes|Minified React error #418/i;

async function resetSequentialFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.body.tabIndex = -1;
    document.body.focus();
    document.body.removeAttribute("tabindex");
  });
}

async function focusWithKeyboard(page: Page, target: Locator, maximumTabs = 96): Promise<void> {
  await resetSequentialFocus(page);
  for (let index = 0; index < maximumTabs; index += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`Target was not reached in ${maximumTabs} Tab presses`);
}

async function instrumentInteractiveControls(page: Page) {
  return page.locator(INTERACTIVE_SELECTOR).evaluateAll((elements) => {
    const isVisible = (element: Element) => {
      if (!(element instanceof HTMLElement)) return false;
      if (element.closest("[hidden], [inert]")) return false;
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
    };

    return elements.flatMap((element, index) => {
      if (!(element instanceof HTMLElement) || !isVisible(element)) return [];
      const id = `focus-audit-${index}`;
      element.dataset.focusAuditId = id;
      const disabled =
        ((element instanceof HTMLButtonElement ||
          element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement) &&
          element.disabled) ||
        element.getAttribute("aria-disabled") === "true";
      return [{ id, disabled, tabbable: !disabled && element.tabIndex >= 0 }];
    });
  });
}

async function selectedState(page: Page): Promise<string[]> {
  return page.locator('[aria-current], [aria-pressed="true"], [aria-selected="true"], input:checked, option:checked, details[open]').evaluateAll((elements) =>
    elements.map((element) => {
      const checked =
        element instanceof HTMLInputElement
          ? element.checked
          : element instanceof HTMLOptionElement
            ? element.selected
            : false;
      return JSON.stringify({
        tag: element.tagName.toLowerCase(),
        text: element.textContent?.trim() ?? "",
        current: element.getAttribute("aria-current"),
        pressed: element.getAttribute("aria-pressed"),
        selected: element.getAttribute("aria-selected"),
        checked,
        open: element instanceof HTMLDetailsElement ? element.open : false,
      });
    }),
  );
}

async function snapshotOf(control: Locator): Promise<ControlSnapshot> {
  return control.evaluate((element) => {
    if (!(element instanceof HTMLElement)) throw new Error("Focus audit target must be an HTMLElement");
    const carrier = element.closest<HTMLElement>(".focus-choice") ?? element;
    const style = getComputedStyle(carrier);
    const rect = element.getBoundingClientRect();
    const carrierRect = carrier.getBoundingClientRect();
    const toRect = (value: DOMRect): Rect => ({
      x: value.x,
      y: value.y,
      width: value.width,
      height: value.height,
    });
    const visibleAnchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).filter(
      (anchor) => !anchor.closest("[hidden], [inert]") && anchor.getClientRects().length > 0,
    );
    const anchorIndex = element instanceof HTMLAnchorElement ? visibleAnchors.indexOf(element) : -1;
    const adjacentAnchor =
      anchorIndex >= 0
        ? (visibleAnchors[anchorIndex + 1] ?? visibleAnchors[anchorIndex - 1] ?? null)
        : null;
    const range = document.createRange();
    range.selectNodeContents(element);
    const lineTops = new Set(
      Array.from(range.getClientRects())
        .filter((line) => line.width > 0 && line.height > 0)
        .map((line) => Math.round(line.top * 10) / 10),
    );
    const disabled =
      ((element instanceof HTMLButtonElement ||
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement) &&
        element.disabled) ||
      element.getAttribute("aria-disabled") === "true";

    return {
      id: element.dataset.focusAuditId ?? "",
      tagName: element.tagName.toLowerCase(),
      className: String(element.className),
      carrierClassName: String(carrier.className),
      disabled,
      readOnly:
        (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.readOnly,
      ariaCurrent: element.getAttribute("aria-current"),
      ariaInvalid: element.getAttribute("aria-invalid"),
      checked: element instanceof HTMLInputElement ? element.checked : null,
      scopedMarkdownLink: element.matches(".markdown-body a"),
      rect: toRect(rect),
      carrierRect: toRect(carrierRect),
      adjacentAnchor:
        adjacentAnchor && adjacentAnchor.dataset.focusAuditId
          ? { id: adjacentAnchor.dataset.focusAuditId, rect: toRect(adjacentAnchor.getBoundingClientRect()) }
          : null,
      pageScrollX: window.scrollX,
      pageScrollY: window.scrollY,
      lineCount: Math.max(1, lineTops.size),
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
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
      transform: style.transform,
    };
  });
}

function expectBoxSizeStable(
  before: Rect,
  after: Rect,
  label: string,
): void {
  for (const field of ["width", "height"] as const) {
    expect(
      Math.abs(after[field] - before[field]),
      `${label} ${field} changed from ${before[field]} to ${after[field]}`,
    ).toBeLessThanOrEqual(1);
  }
}

function expectRelativeAnchorStable(
  beforeControl: Rect,
  afterControl: Rect,
  beforeAnchor: Rect,
  afterAnchor: Rect,
  label: string,
): void {
  for (const field of ["x", "y"] as const) {
    const beforeDelta = beforeAnchor[field] - beforeControl[field];
    const afterDelta = afterAnchor[field] - afterControl[field];
    expect(
      Math.abs(afterDelta - beforeDelta),
      `${label} relative ${field} changed from ${beforeDelta} to ${afterDelta}`,
    ).toBeLessThanOrEqual(1);
  }
}

function expectLayoutStable(before: ControlSnapshot, after: ControlSnapshot, phase: string): void {
  const focusClasses = `${before.className} ${before.carrierClassName}`;
  const isSkipLink = focusClasses.includes("focus-skip");
  if (!isSkipLink) {
    // Focusing may legitimately scroll the window or an overflow container.
    // Size and relative sibling geometry still prove the focus style does not
    // mutate the box model without treating scrolling as layout movement.
    expectBoxSizeStable(before.rect, after.rect, `${before.id} ${phase} control rect`);
    expectBoxSizeStable(before.carrierRect, after.carrierRect, `${before.id} ${phase} carrier rect`);
    expect(after.lineCount, `${before.id} ${phase} line count`).toBe(before.lineCount);
    expect(Math.abs(after.scrollWidth - before.scrollWidth), `${before.id} ${phase} scrollWidth stability`).toBeLessThanOrEqual(1);
    expect(Math.abs(after.scrollHeight - before.scrollHeight), `${before.id} ${phase} scrollHeight stability`).toBeLessThanOrEqual(1);
    if (!["input", "select", "textarea"].includes(after.tagName)) {
      expect(after.scrollWidth, `${before.id} ${phase} scrollWidth`).toBeLessThanOrEqual(after.clientWidth + 1);
      expect(after.scrollHeight, `${before.id} ${phase} scrollHeight`).toBeLessThanOrEqual(after.clientHeight + 1);
    }

    if (before.adjacentAnchor && after.adjacentAnchor?.id === before.adjacentAnchor.id) {
      expectRelativeAnchorStable(
        before.rect,
        after.rect,
        before.adjacentAnchor.rect,
        after.adjacentAnchor.rect,
        `${before.id} ${phase} adjacent anchor`,
      );
    }
  } else if (phase === "keyboard focus") {
    // The skip link intentionally expands from its clipped sr-only box when it
    // receives keyboard focus. Its focused rendering still must not clip.
    expect(after.scrollWidth, `${before.id} ${phase} scrollWidth`).toBeLessThanOrEqual(after.clientWidth + 1);
    expect(after.scrollHeight, `${before.id} ${phase} scrollHeight`).toBeLessThanOrEqual(after.clientHeight + 1);
  }
  expect(after.transform, `${before.id} ${phase} must not use movement/scale`).toBe("none");
}

function visualStateKey(snapshot: ControlSnapshot): string {
  return JSON.stringify({
    backgroundColor: snapshot.backgroundColor,
    borderColor: snapshot.borderColor,
    boxShadow: snapshot.boxShadow,
    color: snapshot.color,
    fontWeight: snapshot.fontWeight,
    textDecorationThickness: snapshot.textDecorationThickness,
  });
}

function expectsPressedFeedback(snapshot: ControlSnapshot): boolean {
  const classes = `${snapshot.className} ${snapshot.carrierClassName}`;
  return (
    /\bfocus-(?:action-primary|action-secondary|action-danger|icon|surface|link|link-strong|link-danger|nav|choice|disclosure)\b/.test(
      classes,
    ) || snapshot.scopedMarkdownLink
  );
}

function expectsHoverFeedback(snapshot: ControlSnapshot): boolean {
  return /(?:^|\s)(?:enabled:)?hover:/.test(`${snapshot.className} ${snapshot.carrierClassName}`);
}

function expectNoBlackOutline(snapshot: ControlSnapshot, phase: string): void {
  const outlineVisible = snapshot.outlineStyle !== "none" && snapshot.outlineWidth !== "0px";
  if (outlineVisible) {
    expect(snapshot.outlineColor, `${snapshot.id} ${phase} has the retired black outline`).not.toBe("rgb(23, 23, 23)");
    expect(snapshot.outlineColor, `${snapshot.id} ${phase} outline must remain visible`).not.toBe("transparent");
  }
}

function assertTypedKeyboardFocus(snapshot: ControlSnapshot): void {
  const focusClasses = `${snapshot.className} ${snapshot.carrierClassName}`;
  expect(
    TYPED_FOCUS_PATTERN.test(focusClasses) || snapshot.scopedMarkdownLink,
    `${snapshot.id} is not mapped to a typed focus contract`,
  ).toBe(true);
  expectNoBlackOutline(snapshot, "keyboard focus");

  if (focusClasses.includes("focus-input")) {
    if (snapshot.readOnly) {
      expect(snapshot.outlineStyle).not.toBe("none");
      expect(snapshot.outlineWidth).toBe("2px");
    } else {
      expect(snapshot.backgroundColor).toBe("rgb(247, 230, 226)");
      expect(snapshot.boxShadow).toBe("none");
      expect(snapshot.outlineStyle === "none" || snapshot.outlineWidth === "0px").toBe(true);
    }
  } else if (/focus-(?:action|icon|surface|skip|choice|disclosure)/.test(focusClasses)) {
    expect(snapshot.boxShadow).toContain("inset");
    expect(snapshot.boxShadow).toContain("2px");
    expect(snapshot.outlineStyle === "none" || snapshot.outlineWidth === "0px").toBe(true);
  } else {
    expect(snapshot.textDecorationThickness).toBe("2px");
    expect(snapshot.outlineStyle === "none" || snapshot.outlineWidth === "0px").toBe(true);
  }

  if (snapshot.ariaInvalid === "true") {
    expect(snapshot.borderColor).toBe("rgb(158, 47, 38)");
    expect(snapshot.borderWidth).toBe("1px");
  }
}

async function cancelNextClick(control: Locator): Promise<void> {
  await control.evaluate((element) => {
    element.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      { capture: true, once: true },
    );
  });
}

async function clearFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.mouse.move(0, 0);
}

async function auditAllRouteControls(page: Page, routeName: string): Promise<RouteAudit> {
  // Expand native disclosures before inventory so controls such as the post
  // editor's SEO fields are part of the route-wide state matrix.
  await page.locator("details").evaluateAll((details) => {
    for (const detail of details) {
      if (detail instanceof HTMLDetailsElement && detail.getClientRects().length > 0) detail.open = true;
    }
  });
  const inventory = await instrumentInteractiveControls(page);
  expect(inventory.length, `${routeName} must expose an interactive control inventory`).toBeGreaterThan(0);
  const tabbable = inventory.filter((item) => item.tabbable);
  const disabled = inventory.filter((item) => item.disabled);
  expect(tabbable.length, `${routeName} must have a keyboard-reachable control`).toBeGreaterThan(0);

  const selectedStateBefore = await selectedState(page);
  const documentMetricsBefore = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  const controlAudits: RouteAudit["controls"] = [];
  const defaults = new Map<string, ControlSnapshot>();

  for (const item of inventory) {
    const control = page.locator(`[data-focus-audit-id="${item.id}"]`);
    await expect(control).toBeVisible();
    const defaultSnapshot = await snapshotOf(control);
    defaults.set(item.id, defaultSnapshot);
    expect(defaultSnapshot.transform).toBe("none");
    expectNoBlackOutline(defaultSnapshot, "default");

    const isSkipLink = `${defaultSnapshot.className} ${defaultSnapshot.carrierClassName}`.includes("focus-skip");
    if (!isSkipLink) await control.hover();
    const hoverSnapshot = isSkipLink ? defaultSnapshot : await snapshotOf(control);
    expectLayoutStable(defaultSnapshot, hoverSnapshot, "hover");
    expectNoBlackOutline(hoverSnapshot, "hover");
    if (!item.disabled && !isSkipLink && expectsHoverFeedback(defaultSnapshot)) {
      expect(visualStateKey(hoverSnapshot), `${item.id} Hover must differ from Default`).not.toBe(
        visualStateKey(defaultSnapshot),
      );
    }

    const audit: RouteAudit["controls"][number] = {
      id: item.id,
      default: defaultSnapshot,
      hover: hoverSnapshot,
    };

    if (item.disabled) {
      expect(hoverSnapshot.backgroundColor, `${item.id} disabled hover background`).toBe(defaultSnapshot.backgroundColor);
      expect(hoverSnapshot.borderColor, `${item.id} disabled hover border`).toBe(defaultSnapshot.borderColor);
      expect(hoverSnapshot.color, `${item.id} disabled hover text`).toBe(defaultSnapshot.color);
      await control.evaluate((element) => (element as HTMLElement).focus());
      await expect(control).not.toBeFocused();
    } else if (!isSkipLink && defaultSnapshot.tagName !== "select") {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      const pressedSnapshot = await snapshotOf(control);
      expectLayoutStable(defaultSnapshot, pressedSnapshot, "pressed");
      expectNoBlackOutline(pressedSnapshot, "pressed");
      if (expectsPressedFeedback(defaultSnapshot)) {
        expect(visualStateKey(pressedSnapshot), `${item.id} Pressed must differ from Hover`).not.toBe(
          visualStateKey(hoverSnapshot),
        );
      }
      audit.pressed = pressedSnapshot;
      await page.mouse.move(0, 0);
      await page.mouse.up();

      await cancelNextClick(control);
      await control.click({ force: true });
      const pointerReleased = await snapshotOf(control);
      expectLayoutStable(defaultSnapshot, pointerReleased, "pointer release");
      expectNoBlackOutline(pointerReleased, "pointer release");
      audit.pointerReleased = pointerReleased;
    }

    controlAudits.push(audit);
    await clearFocus(page);
  }

  await resetSequentialFocus(page);
  for (const item of tabbable) {
    await page.keyboard.press("Tab");
    const activeId = await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.dataset.focusAuditId ?? null,
    );
    expect(activeId, `${routeName} forward Tab order`).toBe(item.id);
    const control = page.locator(`[data-focus-audit-id="${item.id}"]`);
    const keyboardFocus = await snapshotOf(control);
    assertTypedKeyboardFocus(keyboardFocus);
    expectLayoutStable(defaults.get(item.id)!, keyboardFocus, "keyboard focus");
    controlAudits.find((entry) => entry.id === item.id)!.keyboardFocus = keyboardFocus;
    const auditedControl = controlAudits.find((entry) => entry.id === item.id)!;
    const focusClasses = `${keyboardFocus.className} ${keyboardFocus.carrierClassName}`;
    if (
      auditedControl.pointerReleased &&
      !/\bfocus-(?:input|choice)\b/.test(focusClasses)
    ) {
      expect(
        visualStateKey(auditedControl.pointerReleased),
        `${item.id} pointer release must not masquerade as Focus Visible`,
      ).not.toBe(visualStateKey(keyboardFocus));
    }

    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    expect(keyboardFocus.rect.x).toBeGreaterThanOrEqual(0);
    expect(keyboardFocus.rect.y).toBeGreaterThanOrEqual(0);
    expect(keyboardFocus.rect.x + keyboardFocus.rect.width).toBeLessThanOrEqual(viewport!.width);
    expect(keyboardFocus.rect.y + keyboardFocus.rect.height).toBeLessThanOrEqual(viewport!.height);
  }

  for (let index = tabbable.length - 2; index >= 0; index -= 1) {
    await page.keyboard.press("Shift+Tab");
    const activeId = await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.dataset.focusAuditId ?? null,
    );
    expect(activeId, `${routeName} reverse Shift+Tab order`).toBe(tabbable[index]!.id);
  }

  for (const item of disabled) {
    expect(tabbable.some((candidate) => candidate.id === item.id)).toBe(false);
  }

  const selectedStateAfter = await selectedState(page);
  expect(selectedStateAfter, `${routeName} selected/current state must persist after transient focus`).toEqual(
    selectedStateBefore,
  );
  const documentMetricsAfter = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(documentMetricsAfter.scrollWidth).toBeLessThanOrEqual(documentMetricsAfter.clientWidth + 1);
  expect(documentMetricsAfter.scrollWidth).toBe(documentMetricsBefore.scrollWidth);

  return {
    route: routeName,
    controls: controlAudits,
    disabledControlIds: disabled.map((item) => item.id),
    selectedStateBefore,
    selectedStateAfter,
    documentScrollWidthBefore: documentMetricsBefore.scrollWidth,
    documentScrollWidthAfter: documentMetricsAfter.scrollWidth,
    documentClientWidth: documentMetricsAfter.clientWidth,
  };
}

for (const route of routes) {
  test(`${route.name} audits every real interactive control and transient state`, async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    if (route.fixtureBacked) assertFixtureSafety();
    if (route.authenticate) {
      assertAuthenticatedFixtureSafety();
      await login(page);
    }
    const baseURL = projectBaseURL(testInfo);
    const path = typeof route.path === "function" ? route.path(baseURL) : route.path;
    const heading = typeof route.heading === "function" ? route.heading() : route.heading;
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response, `${path} must return a document response`).not.toBeNull();
    if (route.statusCodes) expect(route.statusCodes, `${path} returned ${response!.status()}`).toContain(response!.status());
    else expect(response!.ok(), `${path} returned ${response!.status()}`).toBe(true);

    await expect(page.getByRole("heading", { name: heading, exact: typeof heading === "string" })).toBeVisible();
    if (route.currentFooterLabel) {
      await expect(
        page.getByRole("navigation", { name: "页脚导航" }).getByRole("link", { name: route.currentFooterLabel }),
      ).toHaveAttribute("aria-current", "page");
    }
    const audit = await auditAllRouteControls(page, route.name);
    if (route.expectSelectedState) {
      expect(audit.selectedStateBefore.length, `${route.name} must expose a persistent selected/current state`).toBeGreaterThan(0);
    }

    await testInfo.attach(`${route.name}-${testInfo.project.name}-focus-state-matrix.json`, {
      body: Buffer.from(JSON.stringify(audit, null, 2)),
      contentType: "application/json",
    });

    await testInfo.attach(`${route.name}-${testInfo.project.name}-typed-focus.png`, {
      body: await page.screenshot({ animations: "disabled" }),
      contentType: "image/png",
    });

    expect([...consoleErrors, ...pageErrors].filter((message) => runtimeRegressionPattern.test(message))).toEqual([]);
    if (route.expectedBoundaryError) {
      const expectedMarker = requiredFixture(route.expectedBoundaryErrorEnv!);
      const observedBoundaryErrors = [...consoleErrors, ...pageErrors];
      expect(observedBoundaryErrors.length, `${route.name} must expose its expected boundary error`).toBeGreaterThan(0);
      for (const message of observedBoundaryErrors) {
        expect(message, `${route.name} emitted an unallowlisted console/page error`).toContain(expectedMarker);
      }
    } else {
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    }
  });
}

test("isolated pagination fixture keeps its current page separate from keyboard focus", async ({ page }, testInfo) => {
  assertFixtureSafety();
  const path = requiredSameOriginPaginationPath(
    "E2E_FOCUS_PAGINATED_PATH",
    projectBaseURL(testInfo),
  );
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBe(true);

  const pagination = page.getByRole("navigation", { name: "分页" });
  const current = pagination.locator('[aria-current="page"]');
  const link = pagination.getByRole("link").first();
  await expect(current).toHaveAttribute("aria-current", "page");
  await focusWithKeyboard(page, link);
  await expect(link).toBeFocused();
  await expect(link).not.toHaveAttribute("aria-current");
  await expect(current).toHaveAttribute("aria-current", "page");
});

test("isolated admin form shows focused Error without a database write", async ({ page }) => {
  assertAuthenticatedFixtureSafety();
  await login(page);
  await page.goto("/admin/categories", { waitUntil: "domcontentloaded" });
  await page.route("**/api/v1/admin/categories", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "VALIDATION_FAILED",
          message: "输入校验失败",
          details: [{ path: "name", code: "too_small", message: "名称不能为空" }],
        },
      }),
    });
  });

  const name = page.getByRole("textbox", { name: "名称" });
  const slug = page.getByRole("textbox", { name: "Slug" });
  await slug.fill("focus-error-probe");
  await page.getByRole("button", { name: "创建分类" }).click();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAttribute("aria-describedby", "cat-name-error");
  await expect(page.getByRole("alert")).toHaveText("名称不能为空");
  await focusWithKeyboard(page, name);
  const errorFocus = await snapshotOf(name);
  assertTypedKeyboardFocus(errorFocus);
  expect(errorFocus.borderColor).toBe("rgb(158, 47, 38)");
  expect(errorFocus.borderWidth).toBe("1px");
});

test("isolated admin fixture exposes a focus-contained confirmation dialog without mutating data", async ({ page }) => {
  assertAuthenticatedFixtureSafety();
  await login(page);
  await page.goto("/admin/categories", { waitUntil: "domcontentloaded" });

  const trigger = page.getByRole("button", { name: "删除" }).first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "取消" })).toBeFocused();
  await auditAllRouteControls(page, "admin-confirm-dialog");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
