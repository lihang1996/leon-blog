import type { ButtonHTMLAttributes } from "react";

/**
 * Primary/secondary/danger buttons (UI spec §8.3). Height ≥ 44 px and typed
 * focus/pressed/disabled states. Pending keeps both the original accessible
 * name and its layout footprint while a visual busy label is overlaid.
 */
type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  pending?: boolean;
};

const variantClasses: Record<NonNullable<Props["variant"]>, string> = {
  primary:
    "focus-action-primary bg-accent text-white enabled:hover:bg-accent-text disabled:bg-border disabled:text-text-muted",
  secondary:
    "focus-action-secondary border border-border bg-surface text-text enabled:hover:border-accent-text enabled:hover:text-accent-text",
  danger:
    "focus-action-danger border border-danger/40 bg-surface text-danger enabled:hover:bg-danger enabled:hover:text-white",
};

export function Button({
  variant = "primary",
  pending = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...props
}: Props) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`inline-grid min-h-11 grid-cols-[1fr] items-center justify-items-center rounded-md px-5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]} ${className}`}
    >
      <span className={`col-start-1 row-start-1 ${pending ? "opacity-0" : ""}`}>{children}</span>
      <span
        aria-hidden="true"
        className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-2 whitespace-nowrap ${pending ? "" : "opacity-0"}`}
      >
        <Spinner />
        <span>处理中…</span>
      </span>
    </button>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}
