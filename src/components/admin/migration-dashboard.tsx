"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileCode2,
  Loader2,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

type MigrationStats = {
  total: number;
  uploaded: number;
  converted: number;
  needsReview: number;
  failed: number;
  linked: number;
  progressPct: number;
};

type RdlBrief = {
  id: string;
  slug: string;
  nameFa: string;
  originalFilename: string;
  convertedReportSlug?: string | null;
  convertError?: string | null;
  updatedAt: string;
};

export function MigrationDashboard() {
  const [stats, setStats] = useState<MigrationStats | null>(null);
  const [failures, setFailures] = useState<RdlBrief[]>([]);
  const [review, setReview] = useState<RdlBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/migration/stats");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      setStats(data.stats);
      setFailures(data.recentFailures ?? []);
      setReview(data.needsReviewList ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="داشبورد مهاجرت RDL"
        subtitle="پیشرفت تبدیل گزارش‌های SSRS به گزارش Insight"
        breadcrumbs={[
          { label: "مدیریت", href: "/admin/reports" },
          { label: "مهاجرت RDL", href: "/admin/rdl" },
          { label: "داشبورد پیشرفت" },
        ]}
        actions={
          <>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              بروزرسانی
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/rdl">
                <FileCode2 className="h-4 w-4" />
                مدیریت RDL
              </Link>
            </Button>
          </>
        }
      />

      {error ? <p className="alert alert-danger">{error}</p> : null}

      {stats ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="کل فایل‌ها" value={stats.total} />
          <StatCard label="در صف تبدیل" value={stats.uploaded} tone="warning" />
          <StatCard label="تبدیل‌شده" value={stats.converted} tone="success" />
          <StatCard label="نیاز به بازبینی" value={stats.needsReview} tone="warning" />
          <StatCard label="ناموفق" value={stats.failed} tone="danger" />
          <StatCard label="پیوند به گزارش" value={stats.linked} />
          <StatCard label="پیشرفت" value={`${stats.progressPct}%`} tone="primary" />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <IssueList
          title="نیاز به بازبینی"
          icon={<AlertTriangle className="h-4 w-4 text-[var(--warning)]" />}
          items={review}
          empty="موردی نیست"
        />
        <IssueList
          title="خطاهای اخیر"
          icon={<AlertTriangle className="h-4 w-4 text-[var(--danger)]" />}
          items={failures}
          empty="خطایی ثبت نشده"
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number | string;
  tone?: "muted" | "success" | "warning" | "danger" | "primary";
}) {
  const cls =
    tone === "success"
      ? "badge-success"
      : tone === "warning"
        ? "badge-warning"
        : tone === "danger"
          ? "badge-danger"
          : tone === "primary"
            ? "badge-primary"
            : "";

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${cls ? `badge inline-block ${cls}` : ""}`}>
        {value}
      </p>
    </div>
  );
}

function IssueList({
  title,
  icon,
  items,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  items: RdlBrief[];
  empty: string;
}) {
  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="section-title">{title}</h2>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{empty}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{item.nameFa}</span>
                {item.convertedReportSlug ? (
                  <Link
                    href={`/reports/${item.convertedReportSlug}`}
                    className="text-xs text-[var(--primary)]"
                  >
                    مشاهده گزارش
                    <ArrowLeft className="mr-1 inline h-3 w-3" />
                  </Link>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">{item.originalFilename}</p>
              {item.convertError ? (
                <p className="mt-1 text-xs text-[var(--danger)]">{item.convertError}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
