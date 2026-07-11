"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckSquare,
  Eye,
  Loader2,
  Sparkles,
  Square,
  Trash2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type RdlRow = {
  id: string;
  slug: string;
  nameFa: string;
  originalFilename: string;
  moduleId: string | null;
  convertedReportSlug: string | null;
  convertStatus: string;
  convertError: string | null;
  createdAt: string;
};

type ModuleOption = { id: string; nameFa: string };

type FilterTab = "all" | "pending" | "converted" | "failed" | "needs_review";

type BatchUploadResult = {
  filename: string;
  ok: boolean;
  id?: string;
  slug?: string;
  error?: string;
};

export function RdlManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast, confirm } = useToast();
  const [reports, setReports] = useState<RdlRow[]>([]);
  const [modules, setModules] = useState<ModuleOption[]>([]);
  const [moduleId, setModuleId] = useState(
    searchParams.get("module") ?? "imported",
  );
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadResults, setUploadResults] = useState<BatchUploadResult[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rdlRes, modRes] = await Promise.all([
        fetch("/api/admin/rdl"),
        fetch("/api/admin/modules"),
      ]);
      const rdlData = await rdlRes.json();
      const modData = await modRes.json();
      if (!rdlRes.ok) throw new Error(rdlData.error ?? "بارگذاری ناموفق");
      setReports(rdlData.reports ?? []);
      setModules(modData.modules ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (filter === "pending") {
        return r.convertStatus === "uploaded" && !r.convertedReportSlug;
      }
      if (filter === "converted")
        return r.convertStatus === "converted" || r.convertStatus === "needs_review";
      if (filter === "needs_review") return r.convertStatus === "needs_review";
      if (filter === "failed") return r.convertStatus === "failed";
      return true;
    });
  }, [reports, filter]);

  const pendingIds = useMemo(
    () =>
      reports
        .filter((r) => r.convertStatus === "uploaded" && !r.convertedReportSlug)
        .map((r) => r.id),
    [reports],
  );

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) =>
      f.name.toLowerCase().endsWith(".rdl"),
    );
    if (!list.length) {
      setError("فایل .rdl انتخاب نشده");
      return;
    }

    setUploading(true);
    setError(null);
    setUploadResults([]);

    try {
      const form = new FormData();
      for (const file of list) form.append("files[]", file);
      form.set("moduleId", moduleId);

      const endpoint =
        list.length === 1 ? "/api/admin/rdl" : "/api/admin/rdl/batch";
      if (list.length === 1) form.set("file", list[0]!);

      const res = await fetch(endpoint, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "بارگذاری ناموفق");

      if (list.length === 1 && data.id) {
        router.push(`/admin/rdl/${data.id}`);
        router.refresh();
        return;
      }

      setUploadResults((data.results ?? []) as BatchUploadResult[]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا");
    } finally {
      setUploading(false);
    }
  }

  async function batchConvert(ids: string[]) {
    if (!ids.length) return;
    setConverting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/rdl/batch/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, moduleId, publish: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "تبدیل ناموفق");
      setSelected(new Set());
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا");
    } finally {
      setConverting(false);
    }
  }

  async function remove(id: string) {
    const ok = await confirm("حذف RDL", "این فایل RDL حذف شود؟");
    if (!ok) return;
    const res = await fetch(`/api/admin/rdl/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error ?? "خطا", "error");
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    await load();
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => r.id)));
    }
  }

  const filterTabs: Array<{ id: FilterTab; label: string }> = [
    { id: "all", label: "همه" },
    { id: "pending", label: "نیاز به تبدیل" },
    { id: "converted", label: "تبدیل‌شده" },
    { id: "needs_review", label: "بازبینی" },
    { id: "failed", label: "خطا" },
  ];

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[var(--muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        در حال بارگذاری...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="surface-panel">
        <div className="surface-panel-header">
          <p className="section-title">بارگذاری RDL</p>
          <p className="section-desc">
            یک یا چند فایل SSRS/Rahkaran (.rdl) — SQL، پارامترها و ستون‌ها
            استخراج می‌شوند
          </p>
        </div>
        <div className="surface-panel-body space-y-3">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">ماژول</span>
            <select
              className="h-10 w-full max-w-xs rounded-lg border border-[var(--border)] bg-white px-2"
              value={moduleId}
              onChange={(e) => setModuleId(e.target.value)}
            >
              <option value="imported">وارد شده از RDL</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nameFa}
                </option>
              ))}
            </select>
          </label>

          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-4 py-8 text-sm text-[var(--muted)] hover:border-[var(--primary)]">
            {uploading ? (
              <Loader2 className="h-7 w-7 animate-spin text-[var(--primary)]" />
            ) : (
              <Upload className="h-7 w-7 text-[var(--primary)]" />
            )}
            <span>یک یا چند فایل .rdl را انتخاب کنید</span>
            <input
              type="file"
              accept=".rdl,application/xml,text/xml"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const files = e.target.files;
                if (files?.length) void uploadFiles(files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {uploadResults.length ? (
        <div className="surface-panel">
          <div className="surface-panel-header">
            <p className="section-title">نتیجه بارگذاری</p>
          </div>
          <div className="list-panel">
            {uploadResults.map((r) => (
              <div key={r.filename} className="action-row text-sm">
                <span className="min-w-0 truncate">{r.filename}</span>
                <span className={r.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}>
                  {r.ok ? r.slug ?? "موفق" : r.error ?? "خطا"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <p className="alert alert-danger">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {filterTabs.map((tab) => (
            <Button
              key={tab.id}
              size="sm"
              variant={filter === tab.id ? "default" : "outline"}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!selected.size || converting}
            onClick={() => void batchConvert(Array.from(selected))}
          >
            {converting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            تبدیل انتخاب‌شده‌ها ({selected.size})
          </Button>
          <Button
            size="sm"
            disabled={!pendingIds.length || converting}
            onClick={() => void batchConvert(pendingIds)}
          >
            تبدیل همهٔ تبدیل‌نشده ({pendingIds.length})
          </Button>
        </div>
      </div>

      <div className="list-panel">
        {filtered.length ? (
          <>
            <div className="action-row border-b border-[var(--border)] bg-[var(--surface-muted)]">
              <button
                type="button"
                className="flex items-center gap-2 text-sm text-[var(--muted)]"
                onClick={toggleSelectAll}
              >
                {selected.size === filtered.length ? (
                  <CheckSquare className="h-4 w-4" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                انتخاب همه
              </button>
            </div>
            {filtered.map((r) => (
              <div key={r.id} className="action-row">
                <button
                  type="button"
                  className="shrink-0 text-[var(--muted)]"
                  onClick={() => toggleSelect(r.id)}
                >
                  {selected.has(r.id) ? (
                    <CheckSquare className="h-4 w-4 text-[var(--primary)]" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[var(--foreground)]">{r.nameFa}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {r.originalFilename}
                    {r.convertStatus === "converted" && r.convertedReportSlug ? (
                      <>
                        {" · "}
                        <Link
                          href={`/admin/reports/${r.convertedReportSlug}/edit`}
                          className="text-[var(--primary)]"
                        >
                          تبدیل شده
                        </Link>
                      </>
                    ) : null}
                    {r.convertStatus === "failed" && r.convertError ? (
                      <> · <span className="text-[var(--danger)]">{r.convertError}</span></>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/admin/rdl/${r.id}`}>
                      <Eye className="h-3.5 w-3.5" />
                      نمایش
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[var(--danger)]"
                    onClick={() => void remove(r.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-[var(--muted)]">
            {filter === "all"
              ? "هنوز فایل RDL بارگذاری نشده"
              : "موردی در این فیلتر نیست"}
          </p>
        )}
      </div>
    </div>
  );
}
