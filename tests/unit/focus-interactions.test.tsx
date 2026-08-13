// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminHeader } from "@/components/admin/admin-header";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { MobileNavDisclosure } from "@/components/site/mobile-nav-disclosure";
import { SiteFooterNav } from "@/components/site/site-footer-nav";
import { SiteNav } from "@/components/site/site-nav";
import { Button } from "@/components/ui/button";

const navigationMocks = vi.hoisted(() => ({
  usePathname: vi.fn(() => "/posts/current-article"),
}));

vi.mock("next/navigation", () => ({
  usePathname: navigationMocks.usePathname,
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  navigationMocks.usePathname.mockReturnValue("/posts/current-article");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("keyboard focus interactions", () => {
  it("marks public desktop and footer navigation current without marking sibling links", () => {
    navigationMocks.usePathname.mockReturnValue("/posts/current-article");
    render(
      <>
        <SiteNav />
        <nav aria-label="页脚导航">
          <SiteFooterNav />
        </nav>
      </>,
    );

    const main = screen.getByRole("navigation", { name: "主导航" });
    const footer = screen.getByRole("navigation", { name: "页脚导航" });
    expect(within(main).getByRole("link", { name: "文章" })).toHaveAttribute("aria-current", "page");
    expect(within(main).getByRole("link", { name: "分类" })).not.toHaveAttribute("aria-current");
    expect(within(footer).getByRole("link", { name: "文章" })).toHaveAttribute("aria-current", "page");
  });

  it("uses the same current-route semantics in desktop and mobile admin navigation", () => {
    navigationMocks.usePathname.mockReturnValue("/admin/posts/post-1/edit");
    render(<AdminHeader displayName="Leon" />);

    for (const label of ["管理导航", "管理导航（移动端）"]) {
      const navigation = screen.getByRole("navigation", { name: label });
      expect(within(navigation).getByRole("link", { name: "文章" })).toHaveAttribute("aria-current", "page");
      expect(within(navigation).getByRole("link", { name: "概览" })).not.toHaveAttribute("aria-current");
    }
  });

  it("moves focus into the mobile menu and restores it after Escape", async () => {
    const user = userEvent.setup();
    render(<MobileNavDisclosure />);

    const trigger = screen.getByRole("button", { name: "打开菜单" });
    const panel = document.getElementById("mobile-nav-panel");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).not.toHaveAttribute("aria-haspopup");
    expect(panel).toHaveAttribute("hidden");

    await user.click(trigger);

    const firstMenuLink = screen.getByRole("link", { name: "文章" });
    await waitFor(() => expect(firstMenuLink).toHaveFocus());
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveAttribute("hidden");
    expect(firstMenuLink).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "分类" })).not.toHaveAttribute("aria-current");

    await user.keyboard("{Escape}");

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("hidden");
    expect(screen.queryByRole("link", { name: "文章" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("re-establishes mobile-menu focus after the pathname Suspense fallback is replaced", async () => {
    const user = userEvent.setup();
    let resolvePathname!: () => void;
    let pathnameResolved = false;
    const pathnameReady = new Promise<void>((resolve) => {
      resolvePathname = resolve;
    });
    navigationMocks.usePathname.mockImplementation(() => {
      if (!pathnameResolved) throw pathnameReady;
      return "/posts/current-article";
    });

    render(<MobileNavDisclosure />);
    await user.click(screen.getByRole("button", { name: "打开菜单" }));

    const fallbackLink = screen.getByRole("link", { name: "文章" });
    await waitFor(() => expect(fallbackLink).toHaveFocus());
    expect(fallbackLink).not.toHaveAttribute("aria-current");

    pathnameResolved = true;
    await act(async () => {
      resolvePathname();
      await pathnameReady;
    });

    const resolvedLink = await screen.findByRole("link", { name: "文章" });
    await waitFor(() => expect(resolvedLink).toHaveAttribute("aria-current", "page"));
    expect(resolvedLink).not.toBe(fallbackLink);
    expect(fallbackLink.isConnected).toBe(false);
    await waitFor(() => expect(resolvedLink).toHaveFocus());
  });

  it("traps focus in the confirm dialog and restores the invoking control", async () => {
    const user = userEvent.setup();

    function DialogHarness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            删除文章
          </button>
          <ConfirmDialog
            open={open}
            title="删除文章"
            description="此操作不可恢复"
            confirmLabel="永久删除"
            danger
            onConfirm={vi.fn()}
            onCancel={() => setOpen(false)}
          />
        </>
      );
    }

    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "删除文章" });
    await user.click(trigger);

    const cancel = screen.getByRole("button", { name: "取消" });
    const confirm = screen.getByRole("button", { name: "永久删除" });
    const dialog = screen.getByRole("dialog", { name: "删除文章" });
    await waitFor(() => expect(cancel).toHaveFocus());
    expect(dialog).toHaveAttribute("aria-describedby", "confirm-dialog-description");

    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("uses a durable fallback after a successful action removes the invoking control", async () => {
    const user = userEvent.setup();

    function RemovedTriggerHarness() {
      const [open, setOpen] = useState(false);
      const [showTrigger, setShowTrigger] = useState(true);
      const restoreAfterSuccessRef = useRef(false);
      const fallbackRef = useRef<HTMLButtonElement>(null);

      return (
        <>
          <button ref={fallbackRef} type="button">
            下一项操作
          </button>
          {showTrigger ? (
            <button type="button" onClick={() => setOpen(true)}>
              删除当前项
            </button>
          ) : null}
          <ConfirmDialog
            open={open}
            title="删除当前项"
            confirmLabel="确认删除"
            danger
            onConfirm={() => {
              restoreAfterSuccessRef.current = true;
              setShowTrigger(false);
              setOpen(false);
            }}
            onCancel={() => setOpen(false)}
            restoreFocusTo={() => (restoreAfterSuccessRef.current ? fallbackRef.current : null)}
          />
        </>
      );
    }

    render(<RemovedTriggerHarness />);
    const trigger = screen.getByRole("button", { name: "删除当前项" });
    const fallback = screen.getByRole("button", { name: "下一项操作" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "确认删除" }));

    expect(trigger).not.toBeInTheDocument();
    await waitFor(() => expect(fallback).toHaveFocus());
    expect(document.activeElement).toBe(fallback);
  });

  it("keeps pending dialog focus visible and ignores cancel or Escape until the action settles", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    function PendingDialogHarness() {
      const [open, setOpen] = useState(false);
      const [pending, setPending] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            归档文章
          </button>
          <ConfirmDialog
            open={open}
            title="归档文章"
            description="归档后将从公开列表移除"
            confirmLabel="确认归档"
            pending={pending}
            onConfirm={() => setPending(true)}
            onCancel={() => {
              onCancel();
              setOpen(false);
            }}
          />
        </>
      );
    }

    render(<PendingDialogHarness />);
    const trigger = screen.getByRole("button", { name: "归档文章" });
    await user.click(trigger);

    const cancel = screen.getByRole("button", { name: "取消" });
    const confirm = screen.getByRole("button", { name: "确认归档" });
    await waitFor(() => expect(cancel).toHaveFocus());
    await user.click(confirm);

    const dialog = screen.getByRole("dialog", { name: "归档文章" });
    const status = screen.getByRole("status");
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(cancel).toBeDisabled();
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAccessibleName("确认归档");
    expect(status).toHaveTextContent("正在处理，请稍候…");
    await waitFor(() => expect(status).toHaveFocus());

    await user.tab();
    expect(status).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveFocus();
    expect(trigger).not.toHaveFocus();
    expect(onCancel).not.toHaveBeenCalled();

    cancel.click();
    expect(dialog).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("keeps semantic button borders and disabled controls out of the Tab order", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Button>主要操作</Button>
        <Button variant="secondary">次要操作</Button>
        <Button variant="danger">危险操作</Button>
        <Button disabled>禁用操作</Button>
      </>,
    );

    const primary = screen.getByRole("button", { name: "主要操作" });
    const secondary = screen.getByRole("button", { name: "次要操作" });
    const danger = screen.getByRole("button", { name: "危险操作" });
    const disabled = screen.getByRole("button", { name: "禁用操作" });
    expect(primary.className).toContain("focus-action-primary");
    expect(secondary.className).toContain("focus-action-secondary");
    expect(danger.className).toContain("focus-action-danger");
    expect(secondary.className).toContain("border-border");
    expect(danger.className).toContain("border-danger/40");
    expect(disabled).toBeDisabled();

    await user.tab();
    expect(primary).toHaveFocus();
    await user.tab();
    expect(secondary).toHaveFocus();
    await user.tab();
    expect(danger).toHaveFocus();
    await user.tab();
    expect(disabled).not.toHaveFocus();
  });
});
