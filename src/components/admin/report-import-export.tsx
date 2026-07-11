"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  FileUp,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { REPORT_PACKAGE_EXTENSION } from "@/types/report-package";

type ModuleOption = { id: string; nameFa: string };

type ReportImportExportProps = {
  reportSlug?: string;
  compact?: boolean;
};

export function ReportImportExport({
  reportSlug,
  compact = false,
}: ReportImportExportProps) {
  const router = useRouter();
  const [modules, setModules] = useState<ModuleOption[]>([]);
  const [moduleId, setModuleId] = useState("imported");
  const [conflict, setConflict] = useState<"rename" | "replace" | "skip">(
    "rename",
  );
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [batchResults, setBatchResults] = useState<
    Array<{ filename: string; ok?: boolean; slug?: string; error?: string; skipped?: boolean }>
  >([]);

  useEffect(() => {
    fetch("/api/admin/modules")
      .then((r) => r.json())
      .then((data) => {
        const list = (data.modules ?? []) as ModuleOption[];
        setModules(list);
        if (list.length && !list.find((m) => m.id === moduleId)) {
          setModuleId(list[0]!.id);
        }
      })
      .catch(() => undefined);
  }, [moduleId]);

  const exportReport = useCallback(() => {
    if (!reportSlug) return;
    window.location.href = `/api/admin/reports/${reportSlug}/package`;
  }, [reportSlug]);

  async function importFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;

    setImporting(true);
    setError(null);
    setMessage(null);
    setBatchResults([]);

    try {
      const form = new FormData();
      for (const file of list) form.append("files[]", file);
      form.set("conflict", conflict);
      form.set("moduleId", moduleId);
      form.set("publish", "true");

      const res = await fetch("/api/admin/reports/import", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "وارد کردن ناموفق");

      if (list.length === 1) {
        if (data.skipped) {
          setMessage(`رد شد — گزارش «${data.slug}» از قبل وجود دارد`);
        } else {
          setMessage(`وارد شد: ${data.slug} (نسخه ${data.version ?? 1})`);
          router.push(`/admin/reports/${data.slug}/edit`);
          router.refresh();
        }
        return;
      }

      setBatchResults(data.results ?? []);
      const ok = data.succeeded ?? 0;
      const failed = data.failed ?? 0;
      setMessage(`وارد شد: ${ok} موفق، ${failed} خطا`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className={compact ? "space-y-3" : "surface-panel"}>
      {!compact ? (
        <div className="surface-panel-header">
          <p className="section-title">وارد / صادر کردن گزارش</p>
          <p className="section-desc">
            فرمت بسته: <code>{REPORT_PACKAGE_EXTENSION}</code> — شامل تعریف کامل،
            SQL و محل ماژول
          </p>
        </div>
      ) : null}

      <div className={compact ? "space-y-3" : "surface-panel-body space-y-4"}>
        {reportSlug ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={exportReport}>
              <Download className="h-4 w-4" />
              صادر کردن این گزارش
            </Button>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">ماژول مقصد (وارد کردن)</span>
            <select
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-white px-2"
              value={moduleId}
              onChange={(e) => setModuleId(e.target.value)}
            >
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nameFa}
                </option>
              ))}
              {!modules.length ? <option value="imported">وارد شده</option> : null}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">اگر شناسه تکراری بود</span>
            <select
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-white px-2"
              value={conflict}
              onChange={(e) =>
                setConflict(e.target.value as "rename" | "replace" | "skip")
              }
            >
              <option value="rename">نام جدید بساز</option>
              <option value="replace">جایگزین کن</option>
              <option value="skip">رد کن</option>
            </select>
          </label>
        </div>

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--muted)] hover:border-[var(--primary)]">
          {importing ? (
            <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
          ) : (
            <FileUp className="h-6 w-6 text-[var(--primary)]" />
          )}
          <span>یک یا چند فایل {REPORT_PACKAGE_EXTENSION} را انتخاب کنید</span>
          <input
            type="file"
            accept=".json,application/json"
            multiple
            className="hidden"
            disabled={importing}
            onChange={(e) => {
              const files = e.target.files;
              if (files?.length) void importFiles(files);
              e.target.value = "";
            }}
          />
        </label>

        {batchResults.length ? (
          <div className="list-panel text-sm">
            {batchResults.map((r) => (
              <div key={r.filename} className="action-row">
                <span className="min-w-0 truncate">{r.filename}</span>
                <span
                  className={
                    r.error
                      ? "text-[var(--danger)]"
                      : r.skipped
                        ? "text-[var(--muted)]"
                        : "text-[var(--success)]"
                  }
                >
                  {r.error ?? (r.skipped ? `رد: ${r.slug}` : r.slug ?? "موفق")}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {message ? <p className="alert alert-success">{message}</p> : null}
        {error ? <p className="alert alert-danger">{error}</p> : null}

        {!compact ? (
          <p className="text-xs text-[var(--muted)]">
            برای انتقال بین سرورها یا پشتیبان‌گیری، گزارش را صادر و در محیط دیگر
            وارد کنید. تبدیل RDL در{" "}
            <Link href="/admin/rdl" className="text-[var(--primary)]">
              گزارش‌های RDL
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function ReportExportButton({ reportSlug }: { reportSlug: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        window.location.href = `/api/admin/reports/${reportSlug}/package`;
      }}
    >
      <Download className="h-4 w-4" />
      صادر کردن بسته
    </Button>
  );
}
