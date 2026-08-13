import { test, expect } from "@playwright/test";
import { login, createDraft } from "./helpers";

/**
 * PRD §21.5 流程二 / 流程三：草稿 URL 对未登录访客不可见；归档后公共页面
 * 不可见。注意：Next 16.3 Partial Prerender 下动态段 notFound() 渲染 404
 * 内容但 HTTP 状态为 200（软 404），因此这里断言「页面不存在」内容 + 正文
 * 绝不出现，而不是 HTTP 状态码。
 */
test.describe("草稿与归档隔离", () => {
  test("草稿不能被未登录访客看到", async ({ page }) => {
    await login(page);
    const { slug } = await createDraft(page, {
      title: "机密草稿 E2E",
      excerpt: "机密摘要",
      content: "绝密正文内容-E2E",
    });

    // 模拟未登录访客
    await page.context().clearCookies();
    await page.goto(`/posts/${slug}`);
    await expect(page.getByText("页面不存在")).toBeVisible();
    await expect(page.getByText("绝密正文内容-E2E")).toHaveCount(0);
  });

  test("归档后公共页面不可见", async ({ page }) => {
    await login(page);
    const { slug } = await createDraft(page, {
      title: "将被归档的文章",
      excerpt: "归档摘要",
      content: "# 归档正文",
    });
    await page.getByRole("button", { name: "发布" }).click();
    await expect(page.getByText("当前状态：已发布")).toBeVisible();

    // 归档
    await page.getByRole("button", { name: "下线归档" }).click();
    await expect(page.getByText("当前状态：已归档")).toBeVisible();

    // 公共访问（清 cookie 模拟访客，公共路由本身不需要登录）
    await page.context().clearCookies();
    await page.goto(`/posts/${slug}`);
    await expect(page.getByText("页面不存在")).toBeVisible();
  });

  test("未登录访问管理接口返回 401", async ({ page }) => {
    await page.context().clearCookies();
    const response = await page.request.get("/api/v1/admin/posts");
    expect(response.status()).toBe(401);
  });
});
