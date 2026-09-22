import React from "react";
import Link from "next/link";

export interface StatusBadgeProps {
  status: "PUBLISHED" | "DRAFT" | "ARCHIVED" | string;
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const norm = status.toUpperCase();

  if (norm === "PUBLISHED" || norm === "已发布") {
    return (
      <span
        className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full bg-[#EBF4EC] text-[#2E7D32] border border-[#C8E6C9] ${className}`}
      >
        已发布
      </span>
    );
  }

  if (norm === "DRAFT" || norm === "草稿") {
    return (
      <span
        className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full bg-[#FFF5EE] text-[#E65A00] border border-[#FFCCAA] ${className}`}
      >
        草稿
      </span>
    );
  }

  if (norm === "ARCHIVED" || norm === "已归档") {
    // 设计稿 redesign-admin-posts-desktop.png：已归档为浅灰底灰字（非芥黄）。
    return (
      <span
        className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full bg-[#F0EDE6] text-[#6B655C] border border-[#DBD5CA] ${className}`}
      >
        已归档
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full bg-stone-100 text-stone-600 border border-stone-200 ${className}`}
    >
      {status}
    </span>
  );
}

export interface TagBadgeProps {
  name: string;
  count?: number;
  href?: string;
  active?: boolean;
  /** Active fill: orange (tags index / related current) or mustard (rare mustard chips). */
  activeTone?: "orange" | "mustard";
  /** When false, omit the leading # (sidebars: 热门标签 / 相关标签). Default true. */
  showHash?: boolean;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  className?: string;
}

export function TagBadge({
  name,
  count,
  href,
  active = false,
  activeTone = "orange",
  showHash = true,
  size = "md",
  onClick,
  className = "",
}: TagBadgeProps) {
  const sizeStyles = {
    sm: "px-2.5 py-0.5 text-xs",
    md: "px-3.5 py-1 text-xs sm:text-sm",
    lg: "px-5 py-2 text-sm sm:text-base",
  }[size];

  const activeStyles = !active
    ? "bg-transparent text-[#E65A00] border-[#E65A00] hover:bg-[#FFF5EE]"
    : activeTone === "mustard"
      ? "bg-[#F9D490] text-[#4A2B11] border-[#D9A821] shadow-xs"
      : "bg-[#E65A00] text-white border-[#E65A00] shadow-xs";

  const content = (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border transition-colors select-none ${sizeStyles} ${activeStyles} ${className}`}
    >
      <span>{showHash ? `#${name}` : name}</span>
      {count !== undefined && (
        <span
          className={`text-xs ${
            active
              ? activeTone === "mustard"
                ? "text-[#4A2B11]/70"
                : "text-white/80"
              : "text-[#E65A00]"
          }`}
        >
          {count}
        </span>
      )}
    </span>
  );

  if (href) {
    return (
      <Link href={href} scroll={false} className="inline-block" onClick={onClick}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="inline-block cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E65A00]">
        {content}
      </button>
    );
  }

  return content;
}

export function CategoryBadge({
  name,
  href,
  className = "",
}: {
  name: string;
  href?: string;
  className?: string;
}) {
  const badge = (
    <span
      className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full border border-[#A8C4A0] bg-transparent text-[#5B7B5A] hover:border-[#E65A00] hover:text-[#E65A00] transition-colors ${className}`}
    >
      {name}
    </span>
  );

  if (href) {
    return (
      <Link href={href} scroll={false}>
        {badge}
      </Link>
    );
  }

  return badge;
}
