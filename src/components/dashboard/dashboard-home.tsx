"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Children, useCallback, useState } from "react";
import {
  ArrowLeft,
  Bookmark,
  Clock,
  Download,
  FolderKanban,
  LayoutDashboard,
  Loader2,
  Play,
  Settings2,
  Star,
  Trash2,
  AlertTriangle,
  FileSpreadsheet,
} from "lucide-react";

import { ReportSearch } from "@/components/dashboard/report-search";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { DashboardData } from "@/lib/dashboard/data";
import { cn } from "@/lib/utils";

const ChartPreview = dynamic(
  () =>
    import("@/components/dashboard/dashboard-chart-widget").then(
      (m) => m.DashboardChartWidget,
    ),
  { ssr: false, loading: () => <div className="h-48 animate-pulse rounded-lg bg-[var(--surface-muted)]" /> },
);

type DashboardHomeProps = {
  data: DashboardData;
  isAdmin: boolean;
  brandingName: string;
};

const toneClass: Record<string, string> = {
  primary: "bg-[var(--primary-soft)] text-[var(--primary)]",
  success: "bg-[var(--success-soft)] text-[var(--success)]",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
  muted: "bg-[var(--surface-muted)] text-[var(--muted)]",
};

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "همین الان";
  if (mins < 60) return `${mins} دقیقه پیش`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ساعت پیش`;
  const days = Math.floor(hours / 24);
  return `${days} روز پیش`;
}

function KpiStrip({ kpis }: { kpis: DashboardData["userKpis"] }) {
  const icons: Record<string, typeof LayoutDashboard> = {
    allowed: FileSpreadsheet,
    "runs-today": Play,
    "exports-today": Download,
    favorites: Star,
    "failed-today": AlertTriangle,
    "reports-total": FileSpreadsheet,
    db: LayoutDashboard,
    vouchers: FileSpreadsheet,
  };

  return (
    <div className="stat-strip">
      {kpis.map((stat) => {
        const Icon = icons[stat.id] ?? LayoutDashboard;
        return (
          <div key={stat.id} className="stat-strip-item">
            <span
              className={cn(
                "stat-strip-icon",
                toneClass[stat.tone] ?? toneClass.muted,
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="stat-strip-label">{stat.title}</p>
              <p className="stat-strip-value">{stat.value}</p>
              <p className="stat-strip-hint">{stat.hint}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DashboardHome({ data, isAdmin, brandingName }: DashboardHomeProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState<"user" | "admin">("user");
  const [widgets, setWidgets] = useState(data.widgets);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [newWidget, setNewWidget] = useState({
    title: "",
    type: "report-link",
    reportSlug: "",
    href: "/reports",
    label: "مشاهده",
    text: "",
    chartIndex: 0,
  });
  const [saving, setSaving] = useState(false);

  const quickRunHref = useCallback(
    (reportSlug: string, viewId?: string, hasRequired?: boolean) => {
      const params = new URLSearchParams();
      if (viewId) params.set("view", viewId);
      else if (!hasRequired) params.set("run", "1");
      const qs = params.toString();
      return `/reports/${reportSlug}${qs ? `?${qs}` : ""}`;
    },
    [],
  );

  async function addWidget() {
    setSaving(true);
    try {
      let config: Record<string, unknown> = {};
      if (newWidget.type === "report-link") {
        config = { href: newWidget.href, label: newWidget.label };
      } else if (newWidget.type === "text") {
        config = { text: newWidget.text };
      } else if (newWidget.type === "kpi") {
        config = { value: newWidget.text };
      } else if (newWidget.type === "chart") {
        config = {
          reportSlug: newWidget.reportSlug,
          chartIndex: newWidget.chartIndex,
        };
      } else if (newWidget.type === "report-pin") {
        config = { reportSlug: newWidget.reportSlug };
      }

      const res = await fetch("/api/admin/dashboard-widgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newWidget.title,
          type: newWidget.type,
          config,
          sortOrder: widgets.length,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "خطا");
      setWidgets((prev) => [
        ...prev,
        {
          id: body.widget.id,
          title: newWidget.title,
          type: newWidget.type,
          config,
          sortOrder: widgets.length,
        },
      ]);
      setBuilderOpen(false);
      setNewWidget({
        title: "",
        type: "report-link",
        reportSlug: "",
        href: "/reports",
        label: "مشاهده",
        text: "",
        chartIndex: 0,
      });
      toast("ویجت اضافه شد", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setSaving(false);
    }
  }

  async function removeWidget(id: string) {
    const res = await fetch(`/api/admin/dashboard-widgets/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast("حذف ناموفق", "error");
      return;
    }
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    toast("ویجت حذف شد", "success");
  }

  return (
    <div className="animate-stagger space-y-8">
      <section className="dashboard-hero px-6 py-6 md:px-8 md:py-8">
        <div className="relative z-10 flex flex-col gap-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-white/80">
                {data.displayName ? `سلام ${data.displayName}` : brandingName}
              </p>
              <h1 className="text-xl font-bold text-white md:text-2xl">
                داشبورد شخصی
              </h1>
              <p className="mt-1 text-sm text-white/75">
                {data.allowedReportCount} گزارش در دسترس · جستجو، اجرای سریع و ادامه کار
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                asChild
                variant="secondary"
                className="bg-white text-[var(--primary)] hover:bg-white/90"
              >
                <Link href="/reports">
                  همه گزارش‌ها
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              {isAdmin ? (
                <Button
                  asChild
                  variant="outline"
                  className="border-white/40 bg-transparent text-white hover:bg-white/10"
                >
                  <Link href="/admin/reports">
                    <Settings2 className="h-4 w-4" />
                    استودیو
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
          <ReportSearch className="max-w-xl" placeholder="نام گزارش یا ماژول را جستجو کنید…" />
        </div>
      </section>

      {isAdmin ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={tab === "user" ? "default" : "outline"}
            onClick={() => setTab("user")}
          >
            کاربری
          </Button>
          <Button
            size="sm"
            variant={tab === "admin" ? "default" : "outline"}
            onClick={() => setTab("admin")}
          >
            مدیریت
          </Button>
        </div>
      ) : null}

      {tab === "user" ? (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <PersonalPanel
              title="اخیراً"
              icon={<Clock className="h-4 w-4 text-[var(--primary)]" />}
              empty="هنوز گزارشی اجرا نکرده‌اید"
            >
              {data.recentReports.map((r) => (
                <Link
                  key={r.slug}
                  href={quickRunHref(r.slug)}
                  className="block rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm hover:border-[var(--primary)]"
                >
                  <p className="font-semibold">{r.nameFa}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {r.moduleId} · {formatRelativeTime(r.lastRunAt)}
                  </p>
                </Link>
              ))}
            </PersonalPanel>

            <PersonalPanel
              title="علاقه‌مندی‌ها"
              icon={<Star className="h-4 w-4 text-[var(--warning)]" />}
              empty="از صفحه گزارش ستاره بزنید"
            >
              {data.favorites.map((r) => (
                <Link
                  key={r.slug}
                  href={quickRunHref(r.slug)}
                  className="block rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm hover:border-[var(--primary)]"
                >
                  <p className="font-semibold">{r.nameFa}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">{r.moduleId}</p>
                </Link>
              ))}
            </PersonalPanel>

            <PersonalPanel
              title="نماهای ذخیره‌شده"
              icon={<Bookmark className="h-4 w-4 text-[var(--success)]" />}
              empty="پس از اجرا، نما را ذخیره کنید"
            >
              {data.savedViews.map((v) => (
                <Link
                  key={v.id}
                  href={quickRunHref(v.reportSlug, v.id)}
                  className="block rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm hover:border-[var(--primary)]"
                >
                  <p className="font-semibold">
                    {v.nameFa}
                    {v.isDefault ? " ★" : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {v.reportNameFa}
                  </p>
                </Link>
              ))}
            </PersonalPanel>
          </div>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-[var(--primary)]" />
              <h2 className="section-title">ماژول‌ها</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.moduleCards.map((mod) => (
                <div
                  key={mod.id}
                  className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold">{mod.nameFa}</h3>
                      {mod.description ? (
                        <p className="mt-0.5 text-xs text-[var(--muted)]">
                          {mod.description}
                        </p>
                      ) : null}
                    </div>
                    <span className="badge badge-primary">{mod.reportCount}</span>
                  </div>
                  {mod.lastRunAt ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      آخرین اجرا: {formatRelativeTime(mod.lastRunAt)}
                    </p>
                  ) : null}
                  <ul className="mt-3 space-y-1">
                    {mod.topReports.map((r) => (
                      <li key={r.id}>
                        <Link
                          href={quickRunHref(r.id)}
                          className="text-sm text-[var(--primary)] hover:underline"
                        >
                          {r.nameFa}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Button asChild size="sm" variant="outline" className="mt-3 w-full">
                    <Link href={`/reports?module=${mod.id}`}>مشاهده ماژول</Link>
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <details className="group">
            <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--muted)] hover:text-[var(--primary)]">
              آمار فعالیت امروز
            </summary>
            <div className="mt-3">
              <KpiStrip kpis={data.userKpis} />
            </div>
          </details>

          {data.pinnedReports.length ? (
            <section>
              <h2 className="section-title mb-3">اجرای سریع</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.pinnedReports.map((p) => (
                  <div
                    key={`${p.reportSlug}-${p.viewId ?? "default"}`}
                    className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
                  >
                    <p className="font-bold">{p.nameFa}</p>
                    {p.viewNameFa ? (
                      <p className="text-xs text-[var(--muted)]">نما: {p.viewNameFa}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {p.parameterSummary}
                    </p>
                    <Button
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() =>
                        router.push(
                          quickRunHref(p.reportSlug, p.viewId, p.hasRequiredParams),
                        )
                      }
                    >
                      <Play className="h-3.5 w-3.5" />
                      اجرای سریع
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {data.schedules.length ? (
            <section>
              <h2 className="section-title mb-3">زمان‌بندی‌های من</h2>
              <div className="list-panel">
                {data.schedules.map((s) => (
                  <div key={s.id} className="action-row text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold">{s.nameFa}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {s.reportNameFa} · {s.frequency} @ {s.runAt} · {s.format}
                      </p>
                    </div>
                    {s.nextRunAt ? (
                      <span className="badge text-xs">
                        {new Date(s.nextRunAt).toLocaleString("fa-IR")}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {widgets.filter((w) => w.type !== "chart" && w.type !== "report-pin")
            .length || widgets.some((w) => w.type === "chart") ? (
            <details>
              <summary className="mb-3 cursor-pointer list-none text-sm font-semibold text-[var(--muted)] hover:text-[var(--primary)]">
                ویجت‌ها
              </summary>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {widgets.map((w) => {
                  if (w.type === "chart") {
                    const reportSlug = String(w.config.reportSlug ?? "");
                    const chartIndex = Number(w.config.chartIndex ?? 0);
                    return (
                      <div
                        key={w.id}
                        className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:col-span-2"
                      >
                        <p className="mb-2 font-semibold">{w.title}</p>
                        <ChartPreview
                          reportSlug={reportSlug}
                          chartIndex={chartIndex}
                        />
                      </div>
                    );
                  }
                  if (w.type === "report-pin") return null;
                  return (
                    <div
                      key={w.id}
                      className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
                    >
                      <p className="font-semibold">{w.title}</p>
                      {w.type === "report-link" &&
                      typeof w.config.href === "string" ? (
                        <Link
                          href={w.config.href}
                          className="mt-2 inline-block text-sm text-[var(--primary)]"
                        >
                          {String(w.config.label ?? "مشاهده")}
                        </Link>
                      ) : w.type === "kpi" ? (
                        <p className="mt-2 text-2xl font-bold text-[var(--primary)]">
                          {String(w.config.value ?? "—")}
                        </p>
                      ) : (
                        <p className="mt-2 text-sm text-[var(--muted)]">
                          {String(w.config.text ?? "")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}
        </>
      ) : (
        <AdminTab
          data={data}
          widgets={widgets}
          builderOpen={builderOpen}
          setBuilderOpen={setBuilderOpen}
          newWidget={newWidget}
          setNewWidget={setNewWidget}
          saving={saving}
          onAddWidget={() => void addWidget()}
          onRemoveWidget={(id) => void removeWidget(id)}
        />
      )}
    </div>
  );
}

function PersonalPanel({
  title,
  icon,
  empty,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  empty: string;
  children: React.ReactNode;
}) {
  const hasItems = Children.count(children) > 0;

  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-bold">{title}</h2>
      </div>
      {hasItems ? (
        <div className="space-y-2">{children}</div>
      ) : (
        <p className="text-sm text-[var(--muted)]">{empty}</p>
      )}
    </section>
  );
}

function AdminTab({
  data,
  widgets,
  builderOpen,
  setBuilderOpen,
  newWidget,
  setNewWidget,
  saving,
  onAddWidget,
  onRemoveWidget,
}: {
  data: DashboardData;
  widgets: DashboardData["widgets"];
  builderOpen: boolean;
  setBuilderOpen: (v: boolean) => void;
  newWidget: {
    title: string;
    type: string;
    reportSlug: string;
    href: string;
    label: string;
    text: string;
    chartIndex: number;
  };
  setNewWidget: React.Dispatch<React.SetStateAction<typeof newWidget>>;
  saving: boolean;
  onAddWidget: () => void;
  onRemoveWidget: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <KpiStrip kpis={data.systemKpis} />

      {data.migration ? (
        <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="section-title">مهاجرت RDL</h2>
              <p className="text-sm text-[var(--muted)]">
                پیشرفت تبدیل گزارش‌های SSRS
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/migration">داشبورد مهاجرت</Link>
            </Button>
          </div>
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]">
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-all"
              style={{ width: `${data.migration.progressPct}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
            <div>
              <p className="text-[var(--muted)]">کل</p>
              <p className="font-bold">{data.migration.total}</p>
            </div>
            <div>
              <p className="text-[var(--muted)]">تبدیل‌شده</p>
              <p className="font-bold text-[var(--success)]">
                {data.migration.converted}
              </p>
            </div>
            <div>
              <p className="text-[var(--muted)]">بازبینی</p>
              <p className="font-bold text-[var(--warning)]">
                {data.migration.needsReview}
              </p>
            </div>
            <div>
              <p className="text-[var(--muted)]">ناموفق</p>
              <p className="font-bold text-[var(--danger)]">
                {data.migration.failed}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="section-title">سازنده ویجت</h2>
          <Button size="sm" variant="outline" onClick={() => setBuilderOpen(!builderOpen)}>
            {builderOpen ? "بستن" : "ویجت جدید"}
          </Button>
        </div>

        {builderOpen ? (
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            <input
              className="input-field"
              placeholder="عنوان"
              value={newWidget.title}
              onChange={(e) =>
                setNewWidget((w) => ({ ...w, title: e.target.value }))
              }
            />
            <select
              className="input-field"
              value={newWidget.type}
              onChange={(e) =>
                setNewWidget((w) => ({ ...w, type: e.target.value }))
              }
            >
              <option value="report-link">لینک</option>
              <option value="text">متن</option>
              <option value="kpi">KPI</option>
              <option value="chart">نمودار گزارش</option>
              <option value="report-pin">پین اجرای سریع</option>
            </select>
            {newWidget.type === "report-link" ? (
              <>
                <input
                  className="input-field"
                  placeholder="آدرس"
                  value={newWidget.href}
                  onChange={(e) =>
                    setNewWidget((w) => ({ ...w, href: e.target.value }))
                  }
                />
                <input
                  className="input-field"
                  placeholder="برچسب"
                  value={newWidget.label}
                  onChange={(e) =>
                    setNewWidget((w) => ({ ...w, label: e.target.value }))
                  }
                />
              </>
            ) : null}
            {newWidget.type === "text" || newWidget.type === "kpi" ? (
              <input
                className="input-field sm:col-span-2"
                placeholder={newWidget.type === "kpi" ? "مقدار" : "متن"}
                value={newWidget.text}
                onChange={(e) =>
                  setNewWidget((w) => ({ ...w, text: e.target.value }))
                }
              />
            ) : null}
            {newWidget.type === "chart" || newWidget.type === "report-pin" ? (
              <input
                className="input-field sm:col-span-2"
                placeholder="شناسه گزارش (slug)"
                value={newWidget.reportSlug}
                onChange={(e) =>
                  setNewWidget((w) => ({ ...w, reportSlug: e.target.value }))
                }
              />
            ) : null}
            {newWidget.type === "chart" ? (
              <input
                className="input-field"
                type="number"
                min={0}
                placeholder="شماره نمودار"
                value={newWidget.chartIndex}
                onChange={(e) =>
                  setNewWidget((w) => ({
                    ...w,
                    chartIndex: Number(e.target.value),
                  }))
                }
              />
            ) : null}
            <Button onClick={onAddWidget} disabled={saving || !newWidget.title}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              ذخیره ویجت
            </Button>
          </div>
        ) : null}

        <div className="space-y-2">
          {widgets.map((w) => (
            <div
              key={w.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              <span>
                <strong>{w.title}</strong> — {w.type}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="text-[var(--danger)]"
                onClick={() => onRemoveWidget(w.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <div className="status-line">
        <strong>وضعیت</strong>
        <span
          className={cn(
            "status-pill",
            data.rahkaranConnected ? "status-pill-ok" : "status-pill-warn",
          )}
        >
          راهکاران {data.rahkaranConnected ? "متصل" : "نیاز به تنظیم"}
        </span>
        <Link href="/admin/audit" className="text-[var(--primary)]">
          گزارش ممیزی
        </Link>
        <Link href="/admin/schedules" className="text-[var(--primary)]">
          زمان‌بندی‌ها
        </Link>
      </div>
    </div>
  );
}
