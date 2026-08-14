// @vitest-environment jsdom

import type { ImgHTMLAttributes, ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeHero } from "@/components/site/home-hero";
import AdminNotFound from "@/app/(admin)/admin/not-found";
import AdminLoading from "@/app/(admin)/admin/loading";
import { LoadingState } from "@/components/ui/loading-state";

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
    const { priority, ...rest } = props;
    void priority;
    return (
      // eslint-disable-next-line @next/next/no-img-element -- test double for next/image
      <img alt="" {...rest} />
    );
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
});

describe("HomeHero decorative image", () => {
  it("renders an empty-alt decorative image and keeps both CTAs", () => {
    render(<HomeHero latestPostSlug="hello" hasPosts />);
    const decoration = document.querySelector('img[src="/images/site/hero-ornament.svg"]');
    expect(decoration).toHaveAttribute("alt", "");
    expect(decoration).toHaveAttribute("width", "420");
    expect(decoration).toHaveAttribute("height", "320");
    expect(decoration).toHaveClass("hidden", "md:block");
    expect(screen.getByRole("link", { name: "阅读最新文章" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "查看全部文章" })).toBeTruthy();
  });
});

describe("admin not-found and loading", () => {
  it("offers 返回后台 rather than 返回首页 as the primary exit", () => {
    render(<AdminNotFound />);
    expect(screen.getByRole("link", { name: "返回后台" })).toHaveAttribute("href", "/admin");
    expect(screen.queryByRole("link", { name: "返回首页" })).toBeNull();
  });

  it("reuses LoadingState with role=status and reduced-motion class", () => {
    render(<AdminLoading />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-label", "加载中");
    expect(status).toHaveClass("motion-reduce:animate-none");
    render(<LoadingState rows={2} />);
  });
});
