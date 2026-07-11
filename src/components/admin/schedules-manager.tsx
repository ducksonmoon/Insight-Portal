"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

type ScheduleRow = {
  id: string;
  nameFa: string;
  reportSlug: string;
  frequency: string;
  runAt: string;
  format: string;
  isActive: boolean;
  recipients: string[];
  user: { username: string; displayName: string | null };
};

type ReportOption = { id: string; nameFa: string };

export function SchedulesManager() {
  const { toast, confirm } = useToast();
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [reports, setReports] = useState<ReportOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nameFa: "",
    reportSlug: "",
    frequency: "daily",
    runAt: "08:00",
    format: "excel",
    recipients: "",
    isActive: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [schedRes, reportsRes] = await Promise.all([
        fetch("/api/admin/schedules"),
        fetch("/api/admin/reports"),
      ]);
      const schedData = await schedRes.json();
      const reportsData = await reportsRes.json();
      setSchedules(schedData.schedules ?? []);
      const defs = reportsData.reports ?? [];
      setReports(
        defs.map((r: { id: string; nameFa: string }) => ({
          id: r.id,
          nameFa: r.nameFa,
        })),
      );
      setForm((f) =>
        f.reportSlug || !defs[0]
          ? f
          : { ...f, reportSlug: defs[0].id },
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createSchedule() {
    const recipients = form.recipients
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!form.nameFa.trim() || !form.reportSlug || !recipients.length) {
      toast("نام، گزارش و حداقل یک ایمیل الزامی است", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameFa: form.nameFa.trim(),
          reportSlug: form.reportSlug,
          frequency: form.frequency,
          runAt: form.runAt,
          format: form.format,
          recipients,
          isActive: form.isActive,
          parameters: {},
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      toast("زمان‌بندی ایجاد شد", "success");
      setShowForm(false);
      setForm((f) => ({
        ...f,
        nameFa: "",
        recipients: "",
      }));
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: ScheduleRow) {
    try {
      const res = await fetch(`/api/admin/schedules/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    }
  }

  async function remove(id: string) {
    const ok = await confirm("حذف زمان‌بندی", "این زمان‌بندی حذف شود؟");
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/schedules/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      toast("حذف شد", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="زمان‌بندی گزارش‌ها"
        subtitle="اجرای خودکار و ارسال خروجی به ایمیل"
        breadcrumbs={[
          { label: "مدیریت", href: "/admin/reports" },
          { label: "زمان‌بندی گزارش‌ها" },
        ]}
        actions={
          <>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              بروزرسانی
            </Button>
            <Button onClick={() => setShowForm((v) => !v)}>
              <Plus className="h-4 w-4" />
              {showForm ? "بستن فرم" : "زمان‌بندی جدید"}
            </Button>
          </>
        }
      />

      {showForm ? (
        <section className="surface-panel">
          <div className="surface-panel-header">
            <p className="section-title">زمان‌بندی جدید</p>
          </div>
          <div className="surface-panel-body grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="field-label">نام</span>
              <Input
                value={form.nameFa}
                onChange={(e) => setForm((f) => ({ ...f, nameFa: e.target.value }))}
              />
            </label>
            <label className="space-y-1">
              <span className="field-label">گزارش</span>
              <Select
                value={form.reportSlug}
                onChange={(e) =>
                  setForm((f) => ({ ...f, reportSlug: e.target.value }))
                }
              >
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nameFa}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-1">
              <span className="field-label">تناوب</span>
              <Select
                value={form.frequency}
                onChange={(e) =>
                  setForm((f) => ({ ...f, frequency: e.target.value }))
                }
              >
                <option value="daily">روزانه</option>
                <option value="weekly">هفتگی</option>
                <option value="monthly">ماهانه</option>
              </Select>
            </label>
            <label className="space-y-1">
              <span className="field-label">ساعت (HH:mm)</span>
              <Input
                value={form.runAt}
                onChange={(e) => setForm((f) => ({ ...f, runAt: e.target.value }))}
                placeholder="08:00"
              />
            </label>
            <label className="space-y-1">
              <span className="field-label">فرمت</span>
              <Select
                value={form.format}
                onChange={(e) =>
                  setForm((f) => ({ ...f, format: e.target.value }))
                }
              >
                <option value="excel">Excel</option>
                <option value="csv">CSV</option>
              </Select>
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="field-label">گیرندگان (ایمیل، با ویرگول)</span>
              <Input
                value={form.recipients}
                onChange={(e) =>
                  setForm((f) => ({ ...f, recipients: e.target.value }))
                }
                placeholder="user@company.com"
              />
            </label>
            <div className="sm:col-span-2">
              <Button onClick={() => void createSchedule()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                ذخیره
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
        </div>
      ) : schedules.length ? (
        <div className="list-panel">
          {schedules.map((s) => (
            <div key={s.id} className="action-row text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{s.nameFa}</p>
                <p className="text-xs text-[var(--muted)]">
                  {s.reportSlug} · {s.frequency} @ {s.runAt} · {s.format} ·{" "}
                  {s.recipients.join(", ")}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void toggleActive(s)}>
                {s.isActive ? "فعال" : "غیرفعال"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-[var(--danger)]"
                onClick={() => void remove(s.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="زمان‌بندی ثبت نشده"
          description="یک زمان‌بندی بسازید تا گزارش در ساعت مشخص اجرا و ارسال شود."
          action={
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" />
              زمان‌بندی جدید
            </Button>
          }
        />
      )}
    </div>
  );
}
