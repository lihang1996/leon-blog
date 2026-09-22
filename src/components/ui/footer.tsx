import React from "react";
import { SparkleStar } from "./cat-doodles";

export function Footer() {
  // 部署方可通过 NEXT_PUBLIC_COPYRIGHT_YEAR 固定年份；未配置时取当前年。
  const currentYear = process.env.NEXT_PUBLIC_COPYRIGHT_YEAR || String(new Date().getFullYear());

  return (
    <footer className="w-full border-t border-[#E2D6C5] py-8 text-xs text-[#6B655C]">
      <div className="page-container flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Left: Copyright & ICP */}
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-center sm:text-left">
          <span className="text-[#E65A00]" aria-hidden="true">
            <svg className="w-4 h-4 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </span>
          <span>© {currentYear} Leon 的博客 · 由热爱驱动</span>
          <span className="text-[#5B7B5A]" title="持续学习">🍃</span>
        </div>

        {/* Right: Slogan & Doodle */}
        <div className="flex items-center gap-2 font-serif italic text-sm text-[#3D3832]">
          <span>保持好奇，持续创造。</span>
          <SparkleStar className="w-4 h-4 text-[#F9D490]" />
          <svg className="w-6 h-3 text-[#E65A00]" viewBox="0 0 30 12" fill="none">
            <path d="M2 10L14 3L28 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </footer>
  );
}
