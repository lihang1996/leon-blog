// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { MarkdownPreview } from "@/components/site/markdown-preview";

afterEach(() => {
  cleanup();
});

function EditorHarness({ initial = "初稿" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <MarkdownEditor id="post-content" value={value} onChange={setValue} allowedImageHosts={[]} />;
}

describe("MarkdownEditor", () => {
  it("previews unsaved markdown and restores it when switching back to edit", async () => {
    const user = userEvent.setup();
    render(<EditorHarness />);

    const textarea = screen.getByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, "未保存的**加粗**");

    await user.click(screen.getByRole("tab", { name: "预览" }));
    expect(screen.getByText("未保存的")).toBeTruthy();
    expect(screen.getByText("加粗")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "编辑" }));
    expect(screen.getByRole("textbox")).toHaveValue("未保存的**加粗**");
  });
});

describe("MarkdownPreview", () => {
  it("does not execute raw HTML", () => {
    render(
      <MarkdownPreview
        content={'<img src="javascript:alert(1)" alt="x" /><script>window.__xss=1</script>'}
        allowedImageHosts={["images.example.com"]}
      />,
    );
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it("drops javascript links", () => {
    render(<MarkdownPreview content="[x](javascript:alert(1))" allowedImageHosts={[]} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("x")).toBeTruthy();
  });
});
