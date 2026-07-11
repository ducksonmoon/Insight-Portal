"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Download,
  FileCode2,
  Loader2,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ParsedRdl } from "@/lib/reports/rdl-parser";

type RdlViewerProps = {
  rdlId: string;
};

export function RdlViewer({ rdlId }: RdlViewerProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    nameFa: string;
    originalFilename: string;
    slug: string;
    convertedReportSlug: string | null;
    parsed: ParsedRdl;
    xmlPreview: string;
    xmlTruncated: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/rdl/${rdlId}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "بارگذاری ناموفق");
        if (!cancelled) setData(json.report);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "خطا");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rdlId]);

  async function convert() {
    setConverting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/rdl/${rdlId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publish: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "تبدیل ناموفق");
      if (json.editUrl) {
        router.push(json.editUrl);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا");
    } finally {
      setConverting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-[var(--muted)]">
        <Loader2 className="h-5 w-5 animate-spin" />
        در حال بارگذاری RDL...
      </div>
    );
  }

  if (!data) {
    return <p className="alert alert-danger">{error ?? "یافت نشد"}</p>;
  }

  const primary = data.parsed.datasets[0];

  return (
    <div className="animate-stagger space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/rdl"
            className="mb-2 inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--primary)]"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            بازگشت به فهرست RDL
          </Link>
          <h1 className="page-title">{data.nameFa}</h1>
          <p className="page-subtitle">
            <code>{data.originalFilename}</code>
            {data.convertedReportSlug ? (
              <>
                {" · "}
                <Link
                  href={`/admin/reports/${data.convertedReportSlug}/edit`}
                  className="text-[var(--primary)]"
                >
                  گزارش تبدیل‌شده
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/admin/rdl/${rdlId}/file`} download>
              <Download className="h-4 w-4" />
              دانلود RDL
            </a>
          </Button>
          <Button size="sm" disabled={converting} onClick={() => void convert()}>
            {converting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            تبدیل به گزارش Insight
          </Button>
        </div>
      </div>

      {error ? <p className="alert alert-danger">{error}</p> : null}

      <div className="stat-strip">
        <div className="stat-strip-item">
          <div>
            <p className="stat-strip-label">پارامترها</p>
            <p className="stat-strip-value">{data.parsed.parameters.length}</p>
          </div>
        </div>
        <div className="stat-strip-item">
          <div>
            <p className="stat-strip-label">ستون‌ها (فیلد)</p>
            <p className="stat-strip-value">{primary?.fields.length ?? 0}</p>
          </div>
        </div>
        <div className="stat-strip-item">
          <div>
            <p className="stat-strip-label">Tablix / Textbox</p>
            <p className="stat-strip-hint">
              {data.parsed.layout.tablixCount} جدول ·{" "}
              {data.parsed.layout.textboxCount} متن
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface-panel">
          <div className="surface-panel-header">
            <p className="section-title">پارامترها</p>
          </div>
          <div className="surface-panel-body">
            {data.parsed.parameters.length ? (
              <ul className="space-y-2 text-sm">
                {data.parsed.parameters.map((p) => (
                  <li
                    key={p.name}
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                  >
                    <span className="font-semibold">{p.prompt ?? p.name}</span>
                    <span className="mr-2 text-xs text-[var(--muted)]">
                      ({p.name} · {p.dataType})
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--muted)]">بدون پارامتر</p>
            )}
          </div>
        </div>

        <div className="surface-panel">
          <div className="surface-panel-header">
            <p className="section-title">ستون‌ها / فیلدها</p>
          </div>
          <div className="surface-panel-body max-h-64 overflow-y-auto">
            <ul className="space-y-1 text-sm">
              {primary?.fields.map((f, i) => (
                <li key={f.name} className="flex justify-between gap-2">
                  <code>{f.name}</code>
                  <span className="text-[var(--muted)]">
                    {data.parsed.layout.headerLabels[i] ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="filter-panel">
        <div className="filter-panel-header">
          <p className="section-title">SQL استخراج‌شده</p>
          <p className="section-desc">از DataSet اول — قابل ویرایش پس از تبدیل</p>
        </div>
        <div className="filter-panel-body">
          <pre className="sql-editor max-h-[420px] overflow-auto text-xs">
            {primary?.sql ?? "—"}
          </pre>
        </div>
      </div>

      <div className="surface-panel">
        <div className="surface-panel-header flex items-center gap-2">
          <FileCode2 className="h-4 w-4 text-[var(--primary)]" />
          <p className="section-title">پیش‌نمای XML</p>
          {data.xmlTruncated ? (
            <span className="badge badge-warning">برش خورده</span>
          ) : null}
        </div>
        <div className="surface-panel-body">
          <pre className="max-h-72 overflow-auto rounded-[var(--radius)] bg-[var(--foreground)] p-3 text-xs text-[var(--surface)] direction-ltr text-left">
            {data.xmlPreview}
          </pre>
        </div>
      </div>
    </div>
  );
}
