import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/login-form";
import { siteName } from "@/lib/env";

export const metadata: Metadata = {
  title: "登录",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="text-center font-serif-cn text-xl font-bold text-text">{siteName}</p>
        <h1 className="mt-1 text-center text-sm text-text-muted">登录管理后台</h1>
        <LoginForm />
      </div>
    </main>
  );
}
