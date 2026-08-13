import type { Page } from "@playwright/test";

/**
 * E2E credentials. The app must be seeded with these (so `pnpm db:seed` runs
 * with ADMIN_BOOTSTRAP_PASSWORD=E2E-Password-123, or the env is provided).
 */
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@example.com";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "E2E-Password-123";

export async function login(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("邮箱").fill(ADMIN_EMAIL);
  await page.getByLabel("密码").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL(/\/admin(\/|$)/);
  await page.getByRole("heading", { name: "概览" }).waitFor();
}

export async function createDraft(
  page: Page,
  input: { title: string; excerpt: string; content: string },
): Promise<{ id: string; slug: string }> {
  await page.goto("/admin/posts/new");
  await page.getByLabel("标题").fill(input.title);
  await page.getByLabel("摘要").fill(input.excerpt);
  await page.getByLabel("正文（Markdown）").fill(input.content);
  await page.getByRole("button", { name: "保存草稿" }).click();
  await page.waitForURL(/\/admin\/posts\/[0-9a-f-]+\/edit/);

  const id = new URL(page.url()).pathname.match(/\/admin\/posts\/([0-9a-f-]+)\/edit/)?.[1] ?? "";
  const slug = await page.locator("#post-slug").evaluate((el) => (el as HTMLInputElement).value);
  return { id, slug };
}

export async function readSlug(page: Page): Promise<string> {
  return page.locator("#post-slug").evaluate((el) => (el as HTMLInputElement).value);
}
