"use client";

import { FormEvent, useEffect, useState } from "react";
import { Loader2, Save, Upload } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import type { Branding } from "@/lib/branding/settings";

export function BrandingSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);

  const [companyNameFa, setCompanyNameFa] = useState("");
  const [companyNameEn, setCompanyNameEn] = useState("");
  const [appNameFa, setAppNameFa] = useState("");
  const [appNameEn, setAppNameEn] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#1e4d7b");
  const [accentColor, setAccentColor] = useState("#0d7a6f");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [clearLogo, setClearLogo] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "بارگذاری ناموفق");
        const b = data.branding as Branding;
        setBranding(b);
        setCompanyNameFa(b.companyNameFa);
        setCompanyNameEn(b.companyNameEn);
        setAppNameFa(b.appNameFa);
        setAppNameEn(b.appNameEn);
        setPrimaryColor(b.primaryColor);
        setAccentColor(b.accentColor);
        setSupportEmail(b.supportEmail ?? "");
        setSupportPhone(b.supportPhone ?? "");
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "خطا"),
      )
      .finally(() => setLoading(false));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
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
      if (clearLogo) form.set("clearLogo", "1");
      if (logoFile) form.set("logo", logoFile);
      if (faviconFile) form.set("favicon", faviconFile);

      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ذخیره ناموفق");
      setBranding(data.branding);
      setLogoFile(null);
      setFaviconFile(null);
      setClearLogo(false);
      setMessage("تنظیمات برند ذخیره شد — صفحه را Refresh کنید");
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-[var(--muted)]">
        <Loader2 className="h-5 w-5 animate-spin" />
        در حال بارگذاری...
      </div>
    );
  }

  return (
    <form className="animate-stagger space-y-5" onSubmit={onSubmit}>
      <PageHeader
        title="تنظیمات برند"
        subtitle="نام شرکت، لوگو و رنگ‌ها — قابل فروش به هر سازمان"
        actions={
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            ذخیره
          </Button>
        }
      />

      {message ? <p className="alert alert-success">{message}</p> : null}
      {error ? <p className="alert alert-danger">{error}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <div className="surface-panel">
          <div className="surface-panel-header">
            <p className="section-title">هویت سازمانی</p>
            <p className="section-desc">این اطلاعات در تمام صفحات نمایش داده می‌شود</p>
          </div>
          <div className="surface-panel-body space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-semibold">نام شرکت (فارسی)</span>
                <input
                  className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                  value={companyNameFa}
                  onChange={(e) => setCompanyNameFa(e.target.value)}
                  required
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-semibold">نام شرکت (EN)</span>
                <input
                  className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                  value={companyNameEn}
                  onChange={(e) => setCompanyNameEn(e.target.value)}
                  dir="ltr"
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-semibold">نام محصول (فارسی)</span>
                <input
                  className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                  value={appNameFa}
                  onChange={(e) => setAppNameFa(e.target.value)}
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-semibold">نام محصول (EN)</span>
                <input
                  className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                  value={appNameEn}
                  onChange={(e) => setAppNameEn(e.target.value)}
                  dir="ltr"
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-semibold">ایمیل پشتیبانی</span>
                <input
                  className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  dir="ltr"
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-semibold">تلفن</span>
                <input
                  className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  dir="ltr"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-semibold">رنگ اصلی</span>
                <div className="flex gap-2">
                  <input
                    type="color"
                    className="h-10 w-12 rounded-lg border p-1"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                  />
                  <input
                    className="h-10 flex-1 rounded-lg border border-[var(--border)] px-3"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    dir="ltr"
                  />
                </div>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-semibold">رنگ ثانویه</span>
                <div className="flex gap-2">
                  <input
                    type="color"
                    className="h-10 w-12 rounded-lg border p-1"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                  />
                  <input
                    className="h-10 flex-1 rounded-lg border border-[var(--border)] px-3"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    dir="ltr"
                  />
                </div>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-semibold">لوگو جدید</span>
                <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 text-xs text-[var(--muted)]">
                  <Upload className="h-4 w-4" />
                  {logoFile?.name ?? "انتخاب فایل"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      setLogoFile(e.target.files?.[0] ?? null);
                      setClearLogo(false);
                    }}
                  />
                </label>
                {branding?.logoUrl ? (
                  <label className="mt-2 flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={clearLogo}
                      onChange={(e) => setClearLogo(e.target.checked)}
                    />
                    حذف لوگوی فعلی
                  </label>
                ) : null}
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-semibold">فاویکون جدید</span>
                <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 text-xs text-[var(--muted)]">
                  <Upload className="h-4 w-4" />
                  {faviconFile?.name ?? "انتخاب فایل"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      setFaviconFile(e.target.files?.[0] ?? null)
                    }
                  />
                </label>
              </label>
            </div>
          </div>
        </div>

        <div className="surface-panel">
          <div className="surface-panel-header">
            <p className="section-title">پیش‌نمایش</p>
          </div>
          <div className="surface-panel-body space-y-4">
            <div
              className="flex items-center gap-3 rounded-2xl p-4 text-white"
              style={{ background: primaryColor }}
            >
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-white/15 text-sm font-bold">
                {branding?.logoUrl && !clearLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={branding.logoUrl}
                    alt=""
                    className="h-full w-full object-contain bg-white"
                  />
                ) : (
                  branding?.mark ?? "IP"
                )}
              </div>
              <div>
                <p className="font-bold">{companyNameFa || "نام شرکت"}</p>
                <p className="text-xs text-white/80">{appNameEn}</p>
              </div>
            </div>
            <div
              className="rounded-xl px-3 py-2 text-sm text-white"
              style={{ background: accentColor }}
            >
              رنگ ثانویه
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
