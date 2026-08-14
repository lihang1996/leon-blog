// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoryManager } from "@/components/admin/category-manager";
import type { AdminCategoryDTO } from "@/modules/category";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CategoryManager sortOrder", () => {
  it("submits the user-entered sortOrder on create", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "前端",
            slug: "frontend",
            description: null,
            sortOrder: 7,
            postCount: 0,
          } satisfies AdminCategoryDTO,
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<CategoryManager initialCategories={[]} />);
    await user.type(screen.getByLabelText("名称"), "前端");
    await user.type(screen.getByLabelText("Slug"), "frontend");
    const sort = screen.getByLabelText("排序");
    await user.clear(sort);
    await user.type(sort, "7");
    await user.click(screen.getByRole("button", { name: "创建分类" }));

    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ name: "前端", slug: "frontend", sortOrder: 7 });
  });

  it("prefills sortOrder when editing", async () => {
    const user = userEvent.setup();
    render(
      <CategoryManager
        initialCategories={[
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "前端",
            slug: "frontend",
            description: null,
            sortOrder: 9,
            postCount: 1,
          },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "编辑" }));
    expect(screen.getByLabelText("排序")).toHaveValue(9);
  });
});
