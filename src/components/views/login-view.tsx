"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import { Button } from "../ui/button";
import { CatPeek, SparkleStar, PawIcon } from "../ui/cat-doodles";
import { resolveAdminCallbackUrl } from "@/lib/auth/callback-url";

/** Local/test convenience: prefill bootstrap admin so you can click 登录. Never ships in production builds. */
const DEV_LOGIN_EMAIL =
  process.env.NODE_ENV === "development" ? "admin@example.com" : "";
const DEV_LOGIN_PASSWORD =
  process.env.NODE_ENV === "development" ? "QaTest-2026!" : "";

export function LoginView({
  clearInvalidSession = false,
  callbackUrl: requestedCallback,
}: { clearInvalidSession?: boolean; callbackUrl?: string }) {
  const callbackUrl = resolveAdminCallbackUrl(requestedCallback);
  const [email, setEmail] = useState(DEV_LOGIN_EMAIL);
  const [password, setPassword] = useState(DEV_LOGIN_PASSWORD);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  // Identical SSR/client initialization, based only on the server's DB check.
  const [sessionClearing, setSessionClearing] = useState(clearInvalidSession);
  const [clearFailed, setClearFailed] = useState(false);
  const cleanupStarted = useRef(false);

  const clearSession = useCallback(async () => {
    setSessionClearing(true);
    setClearFailed(false);
    setErrorMsg("");
    try {
      await signOut({ redirect: false });
      // Auth.js does not reject every HTTP error from signOut. Confirm cookie
      // removal with a non-cached read before claiming cleanup succeeded.
      const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("Session cleanup could not be confirmed");
      const session: unknown = await response.json();
      if (session !== null && (typeof session !== "object" || Array.isArray(session) || Object.keys(session).length > 0)) {
        throw new Error("Session still present or response invalid");
      }
      window.history.replaceState(null, "", `/admin/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      setSessionClearing(false);
      setErrorMsg("登录状态已失效，请重新登录");
    } catch {
      // Do not unlock the form or claim cleanup succeeded after a network error.
      setClearFailed(true);
      setErrorMsg("清除失效会话失败，请重试");
    }
  }, [callbackUrl]);

  useEffect(() => {
    if (clearInvalidSession && !cleanupStarted.current) {
      cleanupStarted.current = true;
      queueMicrotask(() => { void clearSession(); });
    } else if (!clearInvalidSession && new URLSearchParams(window.location.search).has("error")) {
      queueMicrotask(() => setErrorMsg("登录状态已失效或凭证有误，请重新登录"));
    }
  }, [clearInvalidSession, clearSession]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sessionClearing || loading) return;
    if (!email.trim() || !password.trim()) {
      setErrorMsg("请填写邮箱和密码");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const res = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
        callbackUrl,
      });

      if (!res || res.error) {
        setErrorMsg("登录失败，请检查凭证或稍后再试");
        setLoading(false);
      } else {
        // Prefer the resolved relative target over Auth.js's absolute res.url.
        window.location.href = callbackUrl;
      }
    } catch {
      setErrorMsg("登录请求失败，请稍后重试");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden select-none">
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

      {/* Cat peeking from the bottom-right corner, per redesign-login-desktop.png */}
      <div className="absolute bottom-0 right-6 hidden md:block pointer-events-none">
        <CatPeek className="w-28 h-20" />
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
          <div role="alert" className="mb-5 p-3 rounded-2xl bg-[#FFF5EE] border border-[#FFCCAA] text-xs font-semibold text-[#E65A00] animate-fade-in">
            {errorMsg}
            {clearFailed && (
              // Revalidate on the server before retrying: another tab may have
              // established a valid session since the first cleanup attempt.
              <button type="button" onClick={() => window.location.reload()} className="block mx-auto mt-2 underline">
                重试清除会话
              </button>
            )}
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
              disabled={loading || sessionClearing}
              className="w-full text-base font-bold shadow-md"
            >
              {sessionClearing ? (clearFailed ? "请先重试清除会话" : "正在清除失效会话...") : loading ? "登录中..." : "登录"}
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
