"use client";

import React from "react";
import Link from "next/link";
import { Header } from "../ui/header";
import { Footer } from "../ui/footer";
import { Button } from "../ui/button";
import { Cat404, SparkleStar } from "../ui/cat-doodles";

export function NotFoundView() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-8 py-12 flex flex-col items-center justify-center text-center space-y-6 relative select-none">
        {/* Floating Doodles */}
        <div className="absolute top-12 left-16 text-[#F9D490] hidden md:block">
          <SparkleStar className="w-6 h-6 text-[#E65A00]" />
        </div>
        <div className="absolute top-24 right-20 text-[#F9D490] hidden md:block">
          <SparkleStar className="w-7 h-7 text-[#F9D490]" />
        </div>

        {/* 404 Cat Illustration with Question Mark and Speech Bubble */}
        <Cat404 className="w-80 sm:w-96 h-auto" />

        {/* Text */}
        <div className="space-y-2 max-w-md">
          <h1 className="text-3xl sm:text-4xl font-extrabold font-serif text-[#1A1A1A]">
            页面不存在
          </h1>
          <p className="text-xs sm:text-sm text-[#6B655C]">
            你访问的页面可能已下线或地址有误。
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-4 pt-2 flex flex-col items-center">
          <Button href="/" size="lg" className="px-10">
            返回首页
          </Button>
          <Link
            href="/posts"
            className="text-xs sm:text-sm font-bold text-[#E65A00] hover:underline"
          >
            浏览全部文章 →
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
