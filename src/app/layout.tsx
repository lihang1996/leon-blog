import type { Metadata } from "next";
import "./globals.css";
import { siteName, siteUrl } from "@/lib/env";
import { PawCursor } from "@/components/ui/paw-cursor";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: `%s · ${siteName}`,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body>
        {children}
        <PawCursor />
      </body>
    </html>
  );
}
