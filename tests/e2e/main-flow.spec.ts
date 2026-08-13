import { test, expect } from "@playwright/test";
import { login, createDraft, ADMIN_PASSWORD } from "./helpers";

/**
 * PRD §7.5 / §21.5 流程一：登录 → 新建 → 保存草稿 → 预览 → 发布 → C 端阅读。
 * 运行前提：应用已在跑（playwright webServer），数据库已用
 * ADMIN_BOOTSTRAP_PASSWORD=E2E-Password-123 播种。
 */
test.describe("发布主链路", () => {
  test("登录 → 新建草稿 → 发布 → C 端可见", async ({ page }) => {
    await login(page);

    const title = `E2E 发布文章 ${Date.now()}`;
    const { slug } = await createDraft(page, {
      title,
      excerpt: "E2E 摘要内容",
      content: "# 你好\n\n这是 E2E 发布流程的正文，包含 **加粗** 与 `行内代码`。",
    });

    // 发布
    await page.getByRole("button", { name: "发布" }).click();
    await expect(page.getByText("当前状态：已发布")).toBeVisible();
    expect(slug).toMatch(/^post-[a-z0-9]{8}$/);

    // C 端阅读
    await page.goto(`/posts/${slug}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("这是 E2E 发布流程的正文")).toBeVisible();
  });

  test("预览页可打开且标题可见", async ({ page }) => {
    await login(page);
    const { id } = await createDraft(page, { title: "预览文章", excerpt: "预览摘要", content: "# 预览" });

    await page.goto(`/admin/posts/${id}/preview`);
    await expect(page.getByRole("heading", { name: "预览文章" })).toBeVisible();
    await expect(page.getByText("草稿预览 · 仅管理员可见")).toBeVisible();
  });

  test("登录失败显示统一错误", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("邮箱").fill("admin@example.com");
    await page.getByLabel("密码").fill("wrong-password-" + ADMIN_PASSWORD);
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page.getByText("邮箱或密码错误，请重试")).toBeVisible();
  });
});
