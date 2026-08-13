"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Lightweight confirm dialog for irreversible admin actions (delete / archive
 * warning). Modal role, labelled heading, Esc to close, and full focus
 * management: focus moves into the dialog on open, is trapped while open, and
 * is restored to the trigger element on close (architecture §6.4 / runtime-a11y).
 */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
  restoreFocusTo,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Durable target used only when the invoking control was removed on success. */
  restoreFocusTo?: () => HTMLElement | null;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef<HTMLParagraphElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const restoreFocusToRef = useRef(restoreFocusTo);
  const wasPendingRef = useRef(false);

  useEffect(() => {
    restoreFocusToRef.current = restoreFocusTo;
  }, [restoreFocusTo]);

  // Save the trigger, move focus into the dialog, and restore on close.
  // Initial focus lands on the CANCELLING control so keyboard/screen-reader
  // users cannot accidentally trigger a destructive action by pressing Enter.
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const inerted = new Map<HTMLElement, boolean>();
    let dialogBranch: HTMLElement | null = dialogRef.current;
    while (dialogBranch?.parentElement) {
      const parent: HTMLElement = dialogBranch.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling !== dialogBranch && sibling instanceof HTMLElement) {
          inerted.set(sibling, sibling.inert);
          sibling.inert = true;
        }
      }
      dialogBranch = parent;
      if (parent === document.body) break;
    }
    // Wait a tick so the dialog is in the DOM before focusing.
    const timer = window.setTimeout(() => cancelRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      for (const [element, wasInert] of inerted) element.inert = wasInert;
      const previous = previouslyFocusedRef.current;
      const getDurableTarget = restoreFocusToRef.current;
      // Defer until the closing commit has removed a successfully deleted row.
      // Cancellation/error keeps the original trigger connected; successful
      // deletion instead resolves the caller's persistent next-row fallback.
      window.setTimeout(() => {
        const durableTarget = getDurableTarget?.();
        const target = durableTarget?.isConnected ? durableTarget : previous?.isConnected ? previous : null;
        if (target?.isConnected) target.focus();
      }, 0);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      wasPendingRef.current = false;
      return;
    }
    if (pending) busyRef.current?.focus();
    else if (wasPendingRef.current) cancelRef.current?.focus();
    wasPendingRef.current = pending;
  }, [open, pending]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        // Once the destructive request has started, closing this visual shell
        // would only pretend to cancel work that is still running. Keep the
        // busy state and its focused status visible until the caller settles.
        if (pending) return;
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      // Contain Tab within the dialog.
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) {
        event.preventDefault();
        busyRef.current?.focus();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onCancel, pending],
  );

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby={description ? "confirm-dialog-description" : undefined}
      aria-busy={pending || undefined}
      onKeyDown={handleKeyDown}
    >
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
        <h2 id="confirm-dialog-title" className="text-lg font-bold text-text">
          {title}
        </h2>
        {description ? (
          <p id="confirm-dialog-description" className="mt-2 text-sm text-text-muted">
            {description}
          </p>
        ) : null}
        {pending ? (
          <p ref={busyRef} role="status" tabIndex={-1} className="mt-3 rounded-md bg-focus-surface px-3 py-2 text-sm text-text">
            正在处理，请稍候…
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="focus-action-secondary inline-flex min-h-11 items-center rounded-md border border-border bg-surface px-4 text-sm text-text transition-colors enabled:hover:border-accent-text disabled:cursor-not-allowed disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              danger
                ? "focus-action-danger bg-danger enabled:hover:bg-danger/80"
                : "focus-action-primary bg-accent enabled:hover:bg-accent-text"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
