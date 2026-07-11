"use client";

import { FormEvent, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  Loader2,
  Palette,
  Shield,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3;

export function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyNameFa, setCompanyNameFa] = useState("");
  const [companyNameEn, setCompanyNameEn] = useState("");
  const [appNameFa, setAppNameFa] = useState("پورتال مدیریتی");
  const [appNameEn, setAppNameEn] = useState("Insight Portal");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#1e4d7b");
  const [accentColor, setAccentColor] = useState("#0d7a6f");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [adminUsername, setAdminUsername] = useState("admin");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPassword2, setAdminPassword2] = useState("");
  const [adminDisplayName, setAdminDisplayName] = useState("مدیر سیستم");

  const mark = useMemo(() => {
    const src = companyNameFa.trim() || companyNameEn.trim() || "IP";
    const latin = src.match(/[A-Za-z0-9]+/g);
    if (latin?.length) {
      return latin
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join("")
        .slice(0, 3);
    }
    return src.slice(0, 2);
  }, [companyNameFa, companyNameEn]);

  function onLogoChange(file: File | null) {
    setLogoFile(file);
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(file ? URL.createObjectURL(file) : null);
  }

  function validateStep(current: Step): boolean {
    setError(null);
    if (current === 1) {
      if (companyNameFa.trim().length < 2) {
        setError("نام فارسی شرکت الزامی است");
        return false;
      }
      return true;
    }
    if (current === 2) {
      if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(primaryColor)) {
        setError("رنگ اصلی نامعتبر است");
        return false;
      }
      return true;
    }
    if (current === 3) {
      if (adminUsername.trim().length < 3) {
        setError("نام کاربری ادمین حداقل ۳ کاراکتر");
        return false;
      }
      if (adminPassword.length < 8) {
        setError("رمز عبور حداقل ۸ کاراکتر باشد");
        return false;
      }
      if (adminPassword !== adminPassword2) {
        setError("تکرار رمز عبور مطابقت ندارد");
        return false;
      }
      return true;
    }
    return true;
  }

  async function finish(e: FormEvent) {
    e.preventDefault();
    if (!validateStep(3)) return;

    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("companyNameFa", companyNameFa.trim());
      form.set("companyNameEn", companyNameEn.trim());
      form.set("appNameFa", appNameFa.trim());
      form.set("appNameEn", appNameEn.trim());
      form.set("primaryColor", primaryColor);
      form.set("accentColor", accentColor);
      form.set("supportEmail", supportEmail.trim());
      form.set("supportPhone", supportPhone.trim());
      form.set("adminUsername", adminUsername.trim());
      form.set("adminPassword", adminPassword);
      form.set("adminDisplayName", adminDisplayName.trim());
      if (logoFile) form.set("logo", logoFile);
      if (faviconFile) form.set("favicon", faviconFile);

      const res = await fetch("/api/setup/complete", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "نصب ناموفق");

      router.push("/login");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden p-4"
      style={
        {
          "--primary": primaryColor,
          "--accent": accentColor,
        } as CSSProperties
      }
    >
      <div className="portal-atmosphere absolute inset-0" />

      <div className="setup-shell animate-enter relative z-10 w-full">
        <div className="surface-panel-header">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">
            نصب اولیه محصول
          </p>
          <h1 className="page-title mt-1">راه‌اندازی برای شرکت شما</h1>
          <p className="page-subtitle">
            نام شرکت، لوگو و حساب مدیر را یک‌بار تنظیم کنید. بعداً از «تنظیمات»
            قابل تغییر است.
          </p>

          <div className="setup-steps mt-4">
            {(
              [
                { n: 1 as Step, label: "شرکت", icon: Building2 },
                { n: 2 as Step, label: "برند", icon: Palette },
                { n: 3 as Step, label: "مدیر", icon: Shield },
              ] as const
            ).map((s) => {
              const Icon = s.icon;
              const active = step === s.n;
              const done = step > s.n;
              return (
                <div
                  key={s.n}
                  className={cn(
                    "setup-step",
                    active && "setup-step-active",
                    done && "setup-step-done",
                  )}
                >
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <Icon className="h-4 w-4 shrink-0" />
                  )}
                  <span>{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="surface-panel-body">
          <form
            className="space-y-5"
            onSubmit={
              step === 3
                ? finish
                : (e) => {
                    e.preventDefault();
                    if (validateStep(step)) setStep((step + 1) as Step);
                  }
            }
          >
            {step === 1 ? (
              <div className="space-y-4">
                <label className="block space-y-1">
                  <span className="field-label">نام شرکت (فارسی) *</span>
                  <Input
                    value={companyNameFa}
                    onChange={(e) => setCompanyNameFa(e.target.value)}
                    placeholder="مثلاً شرکت فولاد بوتیا"
                    required
                  />
                </label>
                <label className="block space-y-1">
                  <span className="field-label">نام شرکت (انگلیسی)</span>
                  <Input
                    value={companyNameEn}
                    onChange={(e) => setCompanyNameEn(e.target.value)}
                    placeholder="Company Name"
                    dir="ltr"
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="field-label">نام محصول (فارسی)</span>
                    <Input
                      value={appNameFa}
                      onChange={(e) => setAppNameFa(e.target.value)}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="field-label">نام محصول (English)</span>
                    <Input
                      value={appNameEn}
                      onChange={(e) => setAppNameEn(e.target.value)}
                      dir="ltr"
                    />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="field-label">ایمیل پشتیبانی</span>
                    <Input
                      type="email"
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                      dir="ltr"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="field-label">تلفن پشتیبانی</span>
                    <Input
                      value={supportPhone}
                      onChange={(e) => setSupportPhone(e.target.value)}
                      dir="ltr"
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                  <div
                    className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl text-lg font-bold text-white shadow-sm"
                    style={{ background: primaryColor }}
                  >
                    {logoPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logoPreview}
                        alt="logo"
                        className="h-full w-full object-contain bg-white"
                      />
                    ) : (
                      mark
                    )}
                  </div>
                  <div>
                    <p className="font-bold">{companyNameFa || "نام شرکت"}</p>
                    <p className="text-sm text-[var(--muted)]">
                      {appNameFa} · {appNameEn}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-semibold">لوگو (PNG/SVG/JPG)</span>
                    <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[var(--border-strong)] px-3 text-[var(--muted)] hover:bg-[var(--surface-muted)]">
                      <Upload className="h-4 w-4" />
                      <span className="truncate text-xs">
                        {logoFile?.name ?? "انتخاب فایل"}
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={(e) =>
                          onLogoChange(e.target.files?.[0] ?? null)
                        }
                      />
                    </label>
                  </label>
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-semibold">فاویکون (اختیاری)</span>
                    <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[var(--border-strong)] px-3 text-[var(--muted)] hover:bg-[var(--surface-muted)]">
                      <Upload className="h-4 w-4" />
                      <span className="truncate text-xs">
                        {faviconFile?.name ?? "انتخاب فایل"}
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/x-icon,image/svg+xml,image/webp"
                        className="hidden"
                        onChange={(e) =>
                          setFaviconFile(e.target.files?.[0] ?? null)
                        }
                      />
                    </label>
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-semibold">رنگ اصلی</span>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        className="h-11 w-14 cursor-pointer rounded-lg border border-[var(--border)] bg-white p-1"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                      />
                      <input
                        className="h-11 flex-1 rounded-xl border border-[var(--border)] px-3"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        dir="ltr"
                      />
                    </div>
                  </label>
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-semibold">رنگ ثانویه</span>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        className="h-11 w-14 cursor-pointer rounded-lg border border-[var(--border)] bg-white p-1"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                      />
                      <input
                        className="h-11 flex-1 rounded-xl border border-[var(--border)] px-3"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        dir="ltr"
                      />
                    </div>
                  </label>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-4">
                <label className="block space-y-1">
                  <span className="field-label">نام نمایشی مدیر</span>
                  <Input
                    value={adminDisplayName}
                    onChange={(e) => setAdminDisplayName(e.target.value)}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="field-label">نام کاربری ادمین *</span>
                  <Input
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    dir="ltr"
                    autoComplete="username"
                    required
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="field-label">رمز عبور *</span>
                    <Input
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="field-label">تکرار رمز *</span>
                    <Input
                      type="password"
                      value={adminPassword2}
                      onChange={(e) => setAdminPassword2(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </label>
                </div>
                <p className="rounded-xl bg-[var(--primary-soft)] px-4 py-3 text-sm text-[var(--primary)]">
                  پس از اتمام به صفحه ورود هدایت می‌شوید. می‌توانید کاربران
                  راهکاران را از منوی دسترسی‌ها همگام کنید.
                </p>
              </div>
            ) : null}

            {error ? <p className="alert alert-danger">{error}</p> : null}

            <div className="flex flex-wrap justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                disabled={step === 1 || loading}
                onClick={() => setStep((step - 1) as Step)}
              >
                قبلی
              </Button>
              <Button type="submit" disabled={loading} className="min-w-36">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    در حال ذخیره...
                  </>
                ) : step === 3 ? (
                  "اتمام نصب"
                ) : (
                  "ادامه"
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
