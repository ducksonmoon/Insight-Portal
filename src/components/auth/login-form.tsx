"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LockKeyhole } from "lucide-react";

import { BrandMark } from "@/components/branding/brand-mark";
import { Button } from "@/components/ui/button";
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
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

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
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-semibold text-[var(--foreground)]">نام کاربری</span>
            <input
              className="h-11 rounded-xl border border-[var(--border)] bg-white px-3"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-semibold text-[var(--foreground)]">رمز عبور</span>
            <input
              type="password"
              className="h-11 rounded-xl border border-[var(--border)] bg-white px-3"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error ? <p className="alert alert-danger">{error}</p> : null}

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
        </form>
      </div>
    </div>
  );
}
