"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { siteNav } from "@/config/site-content";

/**
 * Mobile navigation disclosure — the only P0 public interaction island
 * (architecture §6.7). Search is a plain link to /search; only the menu
 * expand/collapse is stateful.
 *
 * Accessibility: the panel stays mounted (hidden), `aria-controls` always names
 * a real disclosure region, focus enters on open, and Escape/selection restores
 * focus to the trigger. The ordinary navigation disclosure is not an ARIA menu.
 */
export function MobileNavDisclosure() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = "mobile-nav-panel";

  const closeAndReturnFocus = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  const focusFirstPanelLink = useCallback(() => {
    panelRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
  }, []);

  const restorePanelFocusAfterResolution = useCallback(() => {
    if (!open) return;

    const activeElement = document.activeElement;
    const focusWasLost =
      activeElement === null ||
      activeElement === document.body ||
      activeElement === document.documentElement ||
      (activeElement instanceof HTMLElement && !activeElement.isConnected);

    // A suspended `usePathname()` replaces the fallback links when it resolves.
    // Only restore focus when that replacement dropped it onto the document;
    // never steal focus after the user has deliberately moved elsewhere.
    if (focusWasLost) focusFirstPanelLink();
  }, [focusFirstPanelLink, open]);

  // Move focus to the first link when the panel opens so keyboard /
  // screen-reader users land inside the menu rather than re-hitting the trigger.
  useEffect(() => {
    if (!open) return;
    focusFirstPanelLink();
  }, [focusFirstPanelLink, open]);

  return (
    <div className="flex items-center gap-1 lg:hidden">
      <Link
        href="/search"
        className="focus-icon inline-flex h-11 w-11 items-center justify-center rounded-md text-text-muted hover:text-accent-text"
        aria-label="搜索文章"
      >
        <SearchIcon />
      </Link>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "关闭菜单" : "打开菜单"}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") closeAndReturnFocus();
        }}
        className="focus-icon inline-flex h-11 w-11 items-center justify-center rounded-md text-text transition-colors hover:bg-surface"
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>

      <div
        ref={panelRef}
        id={panelId}
        hidden={!open}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeAndReturnFocus();
          }
        }}
        className="absolute inset-x-0 top-16 z-20 border-b border-border bg-surface"
      >
        <nav className="flex flex-col px-page py-2" aria-label="移动端导航">
          <Suspense fallback={<MobileNavLinks onNavigate={closeAndReturnFocus} />}>
            <CurrentMobileNavLinks
              onNavigate={closeAndReturnFocus}
              onResolved={restorePanelFocusAfterResolution}
            />
          </Suspense>
        </nav>
      </div>
    </div>
  );
}

function CurrentMobileNavLinks({
  onNavigate,
  onResolved,
}: {
  onNavigate: () => void;
  onResolved: () => void;
}) {
  useEffect(() => {
    onResolved();
  }, [onResolved]);

  return <MobileNavLinks pathname={usePathname()} onNavigate={onNavigate} />;
}

function MobileNavLinks({ pathname, onNavigate }: { pathname?: string; onNavigate: () => void }) {
  return siteNav.map((item) => {
    const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
        className={`focus-nav border-b border-border py-3 text-base font-medium last:border-b-0 ${
          active ? "bg-bg text-accent-text" : "text-text hover:text-accent-text"
        }`}
      >
        {item.label}
      </Link>
    );
  });
}

function SearchIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
