import type { ButtonHTMLAttributes } from "react";
import Link from "next/link";

/**
 * Primary/secondary/danger buttons (UI spec §8.3). Height ≥ 44 px and typed
 * focus/pressed/disabled states. Pending keeps both the original accessible
 * name and its layout footprint while a visual busy label is overlaid.
 */
type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "danger" | "outline" | "ghost";
  pending?: boolean;
  target?: string;
  rel?: string;
};

const variantClasses: Record<NonNullable<Props["variant"]>, string> = {
  primary:
    "focus-action-primary bg-accent text-white enabled:hover:bg-accent-text disabled:bg-border disabled:text-text-muted",
  secondary:
    "focus-action-secondary border border-border bg-surface text-text enabled:hover:border-accent-text enabled:hover:text-accent-text",
  outline:
    "focus-action-secondary border border-border bg-surface text-text enabled:hover:border-accent-text enabled:hover:text-accent-text",
  danger:
    "focus-action-danger border border-danger/40 bg-surface text-danger enabled:hover:bg-danger enabled:hover:text-white",
  ghost:
    "text-text-muted enabled:hover:bg-focus-surface enabled:hover:text-accent-text",
};

export function Button({
  variant = "primary",
  size = "md",
  pending = false,
  href,
  target,
  rel,
  className = "",
  children,
  disabled,
  type = "button",
  ...props
}: Props) {
  const classes = `inline-grid min-h-11 grid-cols-[1fr] items-center justify-items-center rounded-full text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${size === "sm" ? "px-4 text-xs" : size === "lg" ? "px-8 text-base" : "px-6"} ${variantClasses[variant]} ${className}`;
  const content = (
    <>
      <span className={`col-start-1 row-start-1 ${pending ? "opacity-0" : ""}`}>{children}</span>
      <span
        aria-hidden="true"
        className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-2 whitespace-nowrap pointer-events-none ${pending ? "" : "opacity-0"}`}
      >
        <Spinner />
        <span>处理中…</span>
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes} target={target} rel={rel}>
        {content}
      </Link>
    );
  }

  return (
    <button
      {...props}
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={classes}
    >
      {content}
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
