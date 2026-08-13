import type { ReactNode } from "react";

/** Persistent-label form field with optional hint + inline error (UI spec §8.3). */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const hintId = `${htmlFor}-hint`;
  const errorId = `${htmlFor}-error`;

  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-text">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint ? (
        <p id={hintId} className="mt-1 text-xs text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Shared input styling for the admin forms. */
export const adminInputClass =
  "focus-input h-11 w-full rounded-md border border-border bg-surface px-3 text-text transition-colors placeholder:text-text-muted";
