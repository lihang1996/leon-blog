/**
 * Deterministic date formatting for the public site (architecture §8.2 展示时区).
 * The site's audience is Chinese, so dates render in Asia/Shanghai regardless of
 * the deployment region. Using Intl.DateTimeFormat with a fixed timeZone keeps
 * server-rendered output stable across environments AND hydration-safe — a plain
 * `new Date().getFullYear()/getMonth()/getDate()` would instead depend on the
 * process's local timezone (off-by-one for Beijing posts rendered on UTC hosts).
 */
const zhCNDate = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  timeZone: "Asia/Shanghai",
});

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = zhCNDate.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")} 年 ${get("month")} 月 ${get("day")} 日`;
}

const zhCNDateTime = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Shanghai",
});

/** Formats ISO date to `YYYY-MM-DD HH:mm` in Asia/Shanghai timezone */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = zhCNDateTime.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/** Formats ISO date to `YYYY-MM-DD` in Asia/Shanghai timezone */
export function formatDateDash(iso?: string | null): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = zhCNDate.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const pad = (v: string) => v.padStart(2, "0");
  return `${get("year")}-${pad(get("month"))}-${pad(get("day"))}`;
}
