"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function ProfileSettings() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/profile");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      setUsername(data.user?.displayName ?? data.user?.username ?? "");
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!newPassword) {
      toast("رمز عبور جدید را وارد کنید", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      setCurrentPassword("");
      setNewPassword("");
      toast("رمز عبور به‌روز شد", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        title="پروفایل"
        subtitle={username ? `حساب کاربری ${username}` : "تغییر رمز عبور"}
        breadcrumbs={[{ label: "پروفایل" }]}
      />

      <section className="surface-panel">
        <div className="surface-panel-header">
          <p className="section-title">تغییر رمز عبور</p>
          <p className="section-desc">
            رابط کاربری فعلاً فارسی است؛ ترجمه انگلیسی در نسخه‌های بعدی اضافه می‌شود.
          </p>
        </div>
        <div className="surface-panel-body space-y-4">
          <label className="block space-y-1">
            <span className="field-label">رمز عبور فعلی</span>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="field-label">رمز عبور جدید</span>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            ذخیره
          </Button>
        </div>
      </section>
    </div>
  );
}
