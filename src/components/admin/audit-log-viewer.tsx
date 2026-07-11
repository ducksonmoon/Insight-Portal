"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

type AuditRow = {
  id: string;
  action: string;
  success: boolean;
  durationMs: number | null;
  message: string | null;
  createdAt: string;
  user: { username: string; displayName: string | null } | null;
  report: { slug: string; nameFa: string } | null;
};

const actionLabels: Record<string, string> = {
  execute: "اجرا",
  export: "خروجی Excel",
  export_pdf: "چاپ/PDF",
};

export function AuditLogViewer() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: "50" });
      if (action) qs.set("action", action);
      const res = await fetch(`/api/admin/audit?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, action]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="گزارش ممیزی"
        subtitle="اجرای گزارش، خروجی و رویدادهای مدیریتی"
        breadcrumbs={[
          { label: "مدیریت", href: "/admin/reports" },
          { label: "گزارش ممیزی" },
        ]}
        actions={
          <>
            <Select
              className="w-auto min-w-[160px]"
              value={action}
              onChange={(e) => {
                setPage(1);
                setAction(e.target.value);
              }}
            >
              <option value="">همه عملیات</option>
              <option value="execute">اجرا</option>
              <option value="export">خروجی Excel</option>
              <option value="export_pdf">چاپ/PDF</option>
            </Select>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              بروزرسانی
            </Button>
          </>
        }
      />

      {rows.length ? (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-muted)]">
              <tr>
                <th className="p-3 text-right">زمان</th>
                <th className="p-3 text-right">کاربر</th>
                <th className="p-3 text-right">عملیات</th>
                <th className="p-3 text-right">گزارش</th>
                <th className="p-3 text-right">مدت</th>
                <th className="p-3 text-right">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[var(--border)]">
                  <td className="p-3 whitespace-nowrap">
                    {new Date(row.createdAt).toLocaleString("fa-IR")}
                  </td>
                  <td className="p-3">
                    {row.user?.displayName ?? row.user?.username ?? "—"}
                  </td>
                  <td className="p-3">
                    {actionLabels[row.action] ?? row.action}
                  </td>
                  <td className="p-3">{row.report?.nameFa ?? "—"}</td>
                  <td className="p-3">{row.durationMs ?? "—"} ms</td>
                  <td className="p-3">
                    <span
                      className={`badge ${row.success ? "badge-success" : "badge-danger"}`}
                    >
                      {row.success ? "موفق" : "ناموفق"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="رکوردی نیست"
          description="پس از اجرای گزارش‌ها، رویدادها اینجا نمایش داده می‌شوند."
        />
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--muted)]">{total} رکورد</span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            قبلی
          </Button>
          <span>صفحه {page}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page * 50 >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            بعدی
          </Button>
        </div>
      </div>
    </div>
  );
}
