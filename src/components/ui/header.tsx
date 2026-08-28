"use client";

import React, { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { CatAvatar, CatLogo, PawIcon, NavUnderline, PottedPlant } from "./cat-doodles";

export interface HeaderProps {
  admin?: boolean;
  activePath?: string;
  userName?: string;
  onLogout?: () => void;
}

export function Header({
  admin = false,
  activePath = "",
  userName = "Leon",
  onLogout,
}: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  interface NavLink {
    label: string;
    href: string;
    id: string;
  }

  const visitorLinks: NavLink[] = [
    { label: "文章", href: "/posts", id: "posts" },
    { label: "分类", href: "/categories", id: "categories" },
    { label: "标签", href: "/tags", id: "tags" },
    { label: "搜索", href: "/search", id: "search" },
  ];

  const adminLinks: NavLink[] = [
    { label: "概览", href: "/admin", id: "admin" },
    { label: "文章", href: "/admin/posts", id: "admin-posts" },
    { label: "分类", href: "/admin/categories", id: "admin-categories" },
    { label: "标签", href: "/admin/tags", id: "admin-tags" },
  ];

  const links: NavLink[] = admin ? adminLinks : visitorLinks;

  const isActive = (href: string, id: string) => {
    if (activePath === href || activePath === id) return true;
    if (href !== "/" && href !== "/admin" && activePath.startsWith(href)) return true;
    return false;
  };

  return (
    <header className="site-header sticky top-0 z-40 w-full">
      <div className="site-header-inner flex items-center justify-between">
        {/* Brand / Logo */}
        <Link
          href={admin ? "/admin" : "/"}
          className="flex items-center gap-2.5 font-extrabold text-xl sm:text-2xl text-[#1A1A1A] hover:opacity-90 transition-opacity"
        >
          {admin ? (
            <>
              <PawIcon className="w-7 h-7 text-[#E65A00]" />
              <span className="font-serif tracking-tight">管理后台</span>
            </>
          ) : (
            <>
              <CatLogo className="w-9 h-9" />
              <span className="font-serif tracking-tight text-xl">Leon 的博客</span>
            </>
          )}
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8 lg:gap-12">
          {links.map((link) => {
            const active = isActive(link.href, link.id);
            return (
              <Link
              key={link.id}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`relative min-h-11 py-2 text-base font-semibold transition-colors flex items-center gap-1.5 ${
                  active && link.id === "search" ? "rounded-full bg-[#E65A00] px-5 text-white" : active ? "text-[#E65A00]" : "text-[#3D3832] hover:text-[#E65A00]"
                }`}
              >
                {link.id === "search" && (
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-4-4" />
                  </svg>
                )}
                <span>{link.label}</span>
                {active && link.id !== "search" && (
                  <span className="absolute -bottom-1 left-0 right-0 w-full h-1.5 flex justify-center animate-fade-in pointer-events-none">
                    <NavUnderline className="w-full h-1.5 text-[#E65A00]" />
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Header Right Actions (Admin Mode Only) */}
        {admin && (
          <div className="hidden md:flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm font-bold text-[#1A1A1A]">
              <CatLogo className="w-7 h-7" />
              <span>{userName}</span>
            </div>
            <Link
              href="/"
              target="_blank"
              rel="noreferrer"
              className="text-sm font-bold text-[#E65A00] hover:underline flex items-center gap-0.5"
            >
              <span>查看博客</span>
              <span>↗</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                if (onLogout) onLogout();
                else signOut({ callbackUrl: "/admin/login" });
              }}
              className="px-4 py-1.5 text-xs font-bold rounded-full border border-[#D5C7B2] bg-white text-[#554E45] hover:border-[#E65A00] hover:text-[#E65A00] transition-colors cursor-pointer"
            >
              退出
            </button>
          </div>
        )}

        {!admin && activePath === "/" && (
          <div className="hidden md:flex items-center gap-5">
            <svg className="h-7 w-7 text-[#3A332C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /></svg>
            <CatAvatar className="h-10 w-10" />
          </div>
        )}

        {!admin && activePath !== "/" && (
          <PottedPlant className="hidden h-16 w-20 object-contain md:block" />
        )}

        {/* Mobile menu toggle */}
        <div className="flex md:hidden items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-lg text-[#1A1A1A] hover:bg-[#F2ECE1]"
            aria-label="菜单"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[#E2D6C5] bg-[#FDFBF7] px-4 py-4 space-y-3">
          <nav className="flex flex-col space-y-2">
            {links.map((link) => {
              const active = isActive(link.href, link.id);
              return (
                <Link
                  key={link.id}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMobileOpen(false)}
                  className={`px-3 py-2 rounded-xl text-sm font-semibold flex items-center justify-between ${
                    active ? "bg-[#FFF5EE] text-[#E65A00]" : "text-[#3D3832]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>{link.label}</span>
                  </span>
                  {active && <PawIcon className="w-4 h-4 text-[#E65A00]" />}
                </Link>
              );
            })}
          </nav>
          {admin && (
            <div className="pt-3 border-t border-[#E2D6C5] flex items-center justify-between">
              <Link
                href="/"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-[#E65A00]"
                onClick={() => setMobileOpen(false)}
              >
                查看博客 ↗
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  if (onLogout) onLogout();
                  else signOut({ callbackUrl: "/admin/login" });
                }}
                className="px-3 py-1 text-xs font-bold rounded-full border border-[#D5C7B2] bg-white text-[#554E45] cursor-pointer"
              >
                退出
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
