"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LockKeyhole } from "lucide-react";

import { BrandMark } from "@/components/branding/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Branding } from "@/lib/branding/settings";

type LoginFormProps = {
  branding: Branding;
};

export function LoginForm({ branding }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("نام کاربری یا رمز عبور اشتباه است");
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  async function requestReset() {
    if (!username.trim()) {
      setError("ابتدا نام کاربری را وارد کنید");
      return;
    }
    setResetLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/request-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      setInfo(data.message ?? "درخواست ثبت شد");
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="login-shell animate-enter relative z-10 w-full max-w-4xl">
      <div className="login-brand-panel">
        <div className="login-brand-panel__bg" aria-hidden />
        <div className="relative z-10 flex flex-col gap-4">
          <BrandMark branding={branding} size="xl" className="rounded-2xl shadow-md" />
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">{branding.companyNameFa}</h1>
            {branding.companyNameEn ? (
              <p className="mt-1 text-sm text-white/75">{branding.companyNameEn}</p>
            ) : null}
            <p className="mt-3 text-sm text-white/90">{branding.appNameFa}</p>
          </div>
        </div>
      </div>

      <div className="login-form-panel">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-[var(--foreground)]">ورود</h2>
          <p className="mt-1 text-sm leading-7 text-[var(--muted)]">
            کاربران از سیستم سازمانی همگام می‌شوند؛ رمز عبور در همین سامانه مدیریت
            می‌شود.
          </p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block space-y-1">
            <span className="field-label">نام کاربری</span>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label className="block space-y-1">
            <span className="field-label">رمز عبور</span>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error ? <p className="alert alert-danger">{error}</p> : null}
          {info ? <p className="alert alert-success">{info}</p> : null}

          <Button type="submit" className="h-11 w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                در حال ورود...
              </>
            ) : (
              <>
                <LockKeyhole className="h-4 w-4" />
                ورود به سامانه
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full text-sm"
            disabled={resetLoading}
            onClick={() => void requestReset()}
          >
            {resetLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            فراموشی رمز — درخواست به مدیر
          </Button>
        </form>
      </div>
    </div>
  );
}
