import type { Metadata } from "next";
import "./globals.css";
import "@/styles/markdown.css";
import { siteName, siteUrl } from "@/lib/env";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: `%s · ${siteName}`,
  },
  description:
    "Leon 的个人技术博客：Next.js、TypeScript 与 PostgreSQL 工程实践、学习笔记与长期思考。",
  openGraph: {
    siteName,
    locale: "zh_CN",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen flex-col antialiased">{children}</body>
    </html>
  );
}
