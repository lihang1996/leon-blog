"use client";

import React from "react";
import { Header } from "../ui/header";
import { Footer } from "../ui/footer";
import { Button } from "../ui/button";
import { CatShocked, CatSleep } from "../ui/cat-doodles";

export interface ErrorViewProps {
  error?: Error;
  reset?: () => void;
  title?: string;
  description?: string;
}

export function ErrorView({
  reset,
  title = "页面出错了",
  description = "加载失败，请重试或返回首页。",
}: ErrorViewProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-8 py-12 flex flex-col items-center justify-center text-center space-y-6 select-none">
        {/* Shocked Cat with overturned plant */}
        <CatShocked className="w-64 sm:w-72 h-auto" />

        {/* Text */}
        <div className="space-y-2 max-w-md">
          <h1 className="text-3xl sm:text-4xl font-extrabold font-serif text-[#1A1A1A]">
            {title}
          </h1>
          <p className="text-xs sm:text-sm text-[#6B655C]">
            {description}
          </p>
        </div>

        {/* Action Buttons: primary = 返回首页 per mockup, 重试 demoted to secondary */}
        <div className="space-y-4 pt-2 flex flex-col items-center">
          <Button href="/" size="lg" className="px-10">
            返回首页
          </Button>
          {reset ? (
            <button
              type="button"
              onClick={reset}
              className="text-xs sm:text-sm font-bold text-[#E65A00] hover:underline cursor-pointer"
            >
              重试
            </button>
          ) : (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-xs sm:text-sm font-bold text-[#E65A00] hover:underline cursor-pointer"
            >
              重试
            </button>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

export function EmptyView({
  title = "没有找到相关文章",
  linkText = "浏览全部文章 →",
  linkHref = "/posts",
}: {
  title?: string;
  linkText?: string;
  linkHref?: string;
}) {
  return (
    <div className="paper-card-dashed p-12 flex flex-col items-center justify-center text-center space-y-4 max-w-lg mx-auto">
      <CatSleep className="w-48 h-36" />
      <h3 className="text-xl font-bold font-serif text-[#1A1A1A]">{title}</h3>
      <Button href={linkHref} variant="outline" size="sm" className="mt-2">
        {linkText}
      </Button>
    </div>
  );
}
