"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button } from "../ui/button";
import { CatPeek, SparkleStar, PawIcon } from "../ui/cat-doodles";

export function LoginView() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const err = searchParams.get("error");
      if (err) {
        queueMicrotask(() => setErrorMsg("登录状态已失效或凭证有误，请重新登录"));
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMsg("请填写邮箱和密码");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const callbackUrl = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("callbackUrl") || "/admin"
        : "/admin";

      const res = await signIn("credentials", {
        email: email.trim(),
        password: password.trim(),
        redirect: false,
        callbackUrl,
      });

      if (!res || res.error) {
        setErrorMsg("邮箱或密码错误，请重新输入");
        setLoading(false);
      } else {
        // Login succeeded — navigate to target
        window.location.href = res.url || callbackUrl || "/admin";
      }
    } catch {
      setErrorMsg("登录请求失败，请稍后重试");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#FDFBF7] relative overflow-hidden select-none">
      {/* Background Doodles */}
      <div className="absolute top-12 left-16 text-[#F9D490] hidden md:block">
        <SparkleStar className="w-6 h-6 text-[#E65A00]" />
      </div>
      <div className="absolute bottom-20 left-24 text-[#F9D490] hidden md:block">
        <SparkleStar className="w-8 h-8 text-[#F9D490]" />
      </div>
      <div className="absolute top-20 right-28 text-[#F9D490] hidden md:block">
        <SparkleStar className="w-7 h-7 text-[#F9D490]" />
      </div>
      <div className="absolute bottom-16 right-36 flex flex-col items-center gap-2 opacity-60 hidden md:flex">
        <PawIcon className="w-5 h-5 text-[#E65A00] transform rotate-15" />
        <svg className="w-12 h-6 text-[#E65A00]" viewBox="0 0 40 20" fill="none">
          <path d="M4 18C12 12 24 16 36 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="3 3" />
        </svg>
      </div>

      {/* Centered Login Card */}
      <div className="relative w-full max-w-[420px] bg-white rounded-[40px] border border-[#E2D6C5] shadow-xl px-8 pt-16 pb-10 text-center animate-scale-up">
        {/* Cat Peeking on Card Top */}
        <div className="absolute -top-16 left-1/2 -translate-x-1/2">
          <CatPeek className="w-36 h-28" />
        </div>

        {/* Card Header */}
        <div className="space-y-2 mb-8">
          <h1 className="text-3xl font-extrabold font-serif text-[#1A1A1A] tracking-tight">
            Leon 的博客
          </h1>
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-[#8C8375]">
            <span>—</span>
            <span>登录管理后台</span>
            <span>—</span>
          </div>
          <div className="flex justify-center text-[#E65A00] pt-0.5">
            <PawIcon className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-5 p-3 rounded-2xl bg-[#FFF5EE] border border-[#FFCCAA] text-xs font-semibold text-[#E65A00] animate-fade-in">
            {errorMsg}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email Input */}
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#E65A00]">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="邮箱"
              required
              className="w-full pl-11 pr-5 py-3.5 text-sm rounded-full bg-[#FAF6F0]/70 border border-[#E2D6C5] text-[#1A1A1A] placeholder-[#9E9589] focus:bg-white focus:border-[#E65A00] focus:outline-none transition-colors"
            />
          </div>

          {/* Password Input */}
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#E65A00]">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码"
              required
              className="w-full pl-11 pr-5 py-3.5 text-sm rounded-full bg-[#FAF6F0]/70 border border-[#E2D6C5] text-[#1A1A1A] placeholder-[#9E9589] focus:bg-white focus:border-[#E65A00] focus:outline-none transition-colors"
            />
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <Button
              type="submit"
              size="lg"
              disabled={loading}
              className="w-full text-base font-bold shadow-md"
            >
              {loading ? "登录中..." : "登录"}
            </Button>
          </div>
        </form>

        {/* Back Link */}
        <div className="mt-8 pt-4 border-t border-[#F0E6D8]">
          <Link
            href="/"
            className="text-xs font-semibold text-[#8C8375] hover:text-[#E65A00] transition-colors"
          >
            ← 返回博客首页
          </Link>
        </div>
      </div>
    </div>
  );
}
