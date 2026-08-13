"use client";

import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Admin login form (architecture §11). Uniform failure message — the API never
 * reveals whether the email exists, the account is locked, or the password was
 * wrong. No registration.
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError("邮箱或密码错误，请重试");
      } else {
        router.push("/admin");
        router.refresh();
      }
    } catch {
      setError("登录失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
      <div>
        <label htmlFor="login-email" className="block text-sm font-medium text-text">
          邮箱
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          className="focus-input mt-1.5 h-11 w-full rounded-md border border-border bg-surface px-3 text-text transition-colors placeholder:text-text-muted"
        />
      </div>
      <div>
        <label htmlFor="login-password" className="block text-sm font-medium text-text">
          密码
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          className="focus-input mt-1.5 h-11 w-full rounded-md border border-border bg-surface px-3 text-text transition-colors placeholder:text-text-muted"
        />
      </div>

      {error ? (
        <p id="login-error" role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" pending={pending} className="w-full" disabled={!email || !password}>
        登录
      </Button>
    </form>
  );
}
