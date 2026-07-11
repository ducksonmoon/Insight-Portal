"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Download,
  FileBarChart2,
  Loader2,
  Printer,
  Star,
} from "lucide-react";

import { ReportCharts } from "@/components/reports/report-charts";
import { ReportDataGrid } from "@/components/reports/report-data-grid";
import { ReportParameterForm } from "@/components/reports/report-parameter-form";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { ReportPlacement } from "@/lib/reports/organization";
import type {
  ExecuteReportResult,
  DatasetResult,
  EmbedResult,
} from "@/types/report-result";
import {
  isCompositeReport,
  resolveGridConfig,
  type ReportDefinition,
} from "@/types/report";

type ReportViewerProps = {
  report: ReportDefinition;
  placement?: ReportPlacement | null;
};

type RunMeta = {
  totalCount: number;
  durationMs?: number;
  truncated?: boolean;
};

function DatasetSection({
  title,
  dataset,
  report,
}: {
  title?: string;
  dataset: DatasetResult;
  report: ReportDefinition;
}) {
  const datasetDef = report.datasets.find((d) => d.id === dataset.id);
  const gridConfig = resolveGridConfig(report.gridConfig, datasetDef?.gridConfig);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-[var(--foreground)]">
          {title || dataset.nameFa || dataset.id}
        </h3>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="badge badge-primary">{dataset.totalCount} ردیف</span>
          {dataset.truncated ? (
            <span className="badge badge-warning">محدود شده</span>
          ) : null}
        </div>
      </div>
      <ReportCharts charts={dataset.charts ?? []} rows={dataset.rows} />
      <ReportDataGrid
        rows={dataset.rows}
        columns={dataset.columns}
        grouping={dataset.grouping}
        gridConfig={gridConfig}
        reportId={report.id}
      />
    </section>
  );
}

function EmbedSection({
  title,
  embed,
}: {
  title?: string;
  embed: EmbedResult;
}) {
  const child = embed.result;
  return (
    <section className="space-y-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold">
          {title || embed.nameFa}
          <span className="mr-2 text-xs font-normal text-[var(--muted)]">
            ({embed.reportSlug})
          </span>
        </h3>
        <span className="badge badge-primary">{child.totalCount} ردیف</span>
      </div>
      <ReportResultSections result={child} reportId={embed.reportSlug} />
    </section>
  );
}

function ReportResultSections({
  result,
  report,
  reportId,
}: {
  result: ExecuteReportResult;
  report?: ReportDefinition;
  reportId?: string;
}) {
  const layout = result.layout;
  const datasets = result.datasets;
  const embeds = result.embeds;

  if (layout?.length && datasets && report) {
    return (
      <div className="space-y-8">
        {layout.map((section, idx) => {
          if (section.type === "dataset") {
            const ds = datasets[section.datasetId];
            if (!ds) return null;
            return (
              <DatasetSection
                key={`ds-${section.datasetId}-${idx}`}
                title={section.title}
                dataset={ds}
                report={report}
              />
            );
          }
          if (section.type === "chart") {
            const ds = datasets[section.datasetId];
            const chart = ds?.charts?.[section.chartIndex];
            if (!ds || !chart) return null;
            return (
              <div key={`ch-${section.datasetId}-${section.chartIndex}-${idx}`}>
                <h3 className="mb-3 text-base font-bold">
                  {section.title || chart.title}
                </h3>
                <ReportCharts charts={[chart]} rows={ds.rows} />
              </div>
            );
          }
          if (section.type === "embed") {
            const emb = embeds?.[section.embedId];
            if (!emb) return null;
            return (
              <EmbedSection
                key={`em-${section.embedId}-${idx}`}
                title={section.title}
                embed={emb}
              />
            );
          }
          return null;
        })}
      </div>
    );
  }

  if (datasets && Object.keys(datasets).length > 1 && report) {
    return (
      <div className="space-y-8">
        {Object.values(datasets).map((ds) => (
          <DatasetSection key={ds.id} dataset={ds} report={report} />
        ))}
      </div>
    );
  }

  const gridConfig = report
    ? resolveGridConfig(report.gridConfig)
    : undefined;

  return (
    <div className="space-y-5">
      <ReportCharts charts={result.charts ?? []} rows={result.rows} />
      <ReportDataGrid
        rows={result.rows}
        columns={result.columns}
        grouping={result.grouping}
        gridConfig={gridConfig}
        reportId={reportId ?? report?.id}
      />
    </div>
  );
}

type SavedView = {
  id: string;
  nameFa: string;
  parameters: Record<string, unknown>;
  isDefault: boolean;
};

const paramsKey = (reportId: string) => `insight:report-params:${reportId}`;

export function ReportViewer({ report, placement }: ReportViewerProps) {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const viewIdFromUrl = searchParams.get("view");
  const forceRun = searchParams.get("run") === "1";
  const [result, setResult] = useState<ExecuteReportResult | null>(null);
  const [lastParams, setLastParams] = useState<Record<string, unknown>>({});
  const [initialParams, setInitialParams] = useState<Record<string, unknown>>({});
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [meta, setMeta] = useState<RunMeta | null>(null);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");
  const [saveViewDefault, setSaveViewDefault] = useState(false);
  const [savingView, setSavingView] = useState(false);
  const autoRan = useRef(false);

  const composite = isCompositeReport(report);
  const hasRequired = report.parameters.some(
    (p) => p.required || p.nullable === false,
  );

  const runReport = useCallback(
    async (parameters: Record<string, unknown>) => {
      setIsLoading(true);
      setError(null);
      setLastParams(parameters);

      try {
        if (typeof window !== "undefined") {
          localStorage.setItem(paramsKey(report.id), JSON.stringify(parameters));
        }

        const res = await fetch(`/api/reports/${report.id}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parameters }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "خطا در اجرای گزارش");
        }
        setResult(data as ExecuteReportResult);
        setMeta({
          totalCount: data.totalCount ?? data.rows?.length ?? 0,
          durationMs: data.durationMs,
          truncated: data.truncated,
        });
        setHasRun(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "خطای ناشناخته");
        setResult(null);
        setMeta(null);
      } finally {
        setIsLoading(false);
      }
    },
    [report.id],
  );

  useEffect(() => {
    async function bootstrap() {
      try {
        const [viewsRes, favRes] = await Promise.all([
          fetch(`/api/reports/${report.id}/views`),
          fetch(`/api/reports/${report.id}/favorite`),
        ]);
        const viewsData = await viewsRes.json();
        const favData = await favRes.json();
        const views: SavedView[] = viewsData.views ?? [];
        setSavedViews(views);
        setIsFavorite(Boolean(favData.favorite));

        let params: Record<string, unknown> = {};
        const urlView = viewIdFromUrl
          ? views.find((v) => v.id === viewIdFromUrl)
          : undefined;
        const defaultView = urlView ?? views.find((v) => v.isDefault);
        if (defaultView) {
          params = defaultView.parameters;
        } else if (typeof window !== "undefined") {
          const raw = localStorage.getItem(paramsKey(report.id));
          if (raw) {
            try {
              params = JSON.parse(raw) as Record<string, unknown>;
            } catch {
              params = {};
            }
          }
        }
        setInitialParams(params);

        const shouldAutoRun =
          forceRun || (!hasRequired && !autoRan.current);
        if (shouldAutoRun) {
          autoRan.current = true;
          void runReport(params);
        }
      } catch {
        // non-fatal
      }
    }
    void bootstrap();
  }, [report.id, hasRequired, runReport, viewIdFromUrl, forceRun]);

  async function toggleFavorite() {
    const method = isFavorite ? "DELETE" : "POST";
    const res = await fetch(`/api/reports/${report.id}/favorite`, { method });
    if (res.ok) {
      setIsFavorite(!isFavorite);
      toast(isFavorite ? "از علاقه‌مندی حذف شد" : "به علاقه‌مندی‌ها افزوده شد", "success");
    }
  }

  async function saveCurrentView() {
    if (!saveViewName.trim()) {
      toast("نام نما را وارد کنید", "error");
      return;
    }
    setSavingView(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/views`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameFa: saveViewName.trim(),
          parameters: lastParams,
          isDefault: saveViewDefault || savedViews.length === 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "خطا", "error");
        return;
      }
      setSavedViews((prev) => [...prev, data.view]);
      setSaveViewOpen(false);
      setSaveViewName("");
      setSaveViewDefault(false);
      toast("نما ذخیره شد", "success");
    } finally {
      setSavingView(false);
    }
  }

  function openSaveViewDialog() {
    setSaveViewName("");
    setSaveViewDefault(savedViews.length === 0);
    setSaveViewOpen(true);
  }

  async function applyView(view: SavedView) {
    setInitialParams(view.parameters);
    await runReport(view.parameters);
  }

  async function exportExcel() {
    setIsExporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${report.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parameters: lastParams }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "خطا در خروجی اکسل");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.id}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطای ناشناخته");
    } finally {
      setIsExporting(false);
    }
  }

  async function exportPdf() {
    setIsPdfExporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${report.id}/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parameters: lastParams }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "خطا در خروجی چاپ");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.id}-print.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطای ناشناخته");
    } finally {
      setIsPdfExporting(false);
    }
  }
  const hasRows =
    (result?.totalCount ?? 0) > 0 ||
    Object.values(result?.datasets ?? {}).some((d) => d.rows.length > 0);

  const exportDisabled = !hasRun || isLoading || !hasRows;
  const exportHint = !hasRun
    ? "ابتدا گزارش را اجرا کنید"
    : !hasRows
      ? "داده‌ای برای خروجی نیست"
      : undefined;

  const breadcrumbItems = placement
    ? [
        { label: "گزارش‌ها", href: "/reports" },
        {
          label: placement.moduleNameFa,
          href: `/reports?module=${placement.moduleSlug}`,
        },
        ...(placement.folderNameFa
          ? [{ label: placement.folderNameFa }]
          : []),
        { label: report.nameFa },
      ]
    : [{ label: "گزارش‌ها", href: "/reports" }, { label: report.nameFa }];

  return (
    <div className="space-y-6">
      <Breadcrumbs items={breadcrumbItems} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="badge badge-primary">
              <FileBarChart2 className="h-3.5 w-3.5" />
              {report.moduleId}
            </span>
            {composite ? (
              <span className="badge badge-success">چندبخشی</span>
            ) : null}
          </div>
          <h1 className="page-title">{report.nameFa}</h1>
          <p className="page-subtitle">
            فیلترها را تنظیم کنید و اجرا بگیرید. خروجی Excel کامل از سرور؛ CSV
            سریع از نوار ابزار جدول (فیلترشده).
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void toggleFavorite()}
            aria-pressed={isFavorite}
          >
            <Star
              className={`h-4 w-4 ${isFavorite ? "fill-[var(--warning)] text-[var(--warning)]" : ""}`}
            />
            علاقه‌مندی
          </Button>
          <span className="export-hint" title={exportHint}>
            <Button
              variant="outline"
              onClick={exportExcel}
              disabled={exportDisabled || isExporting}
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Excel
            </Button>
          </span>
          <span className="export-hint" title={exportHint}>
            <Button
              variant="outline"
              onClick={() => void exportPdf()}
              disabled={exportDisabled || isPdfExporting}
            >
              {isPdfExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              چاپ/PDF
            </Button>
          </span>
        </div>
      </div>

      <section className="filter-panel">
        <div className="filter-panel-header">
          <h2 className="section-title">فیلترها</h2>
          <p className="section-desc">
            تاریخ شمسی را با فیلدهای سال / ماه / روز وارد کنید.
            {report.parameters.some((p) => p.required || p.nullable === false)
              ? " فیلدهای ستاره‌دار الزامی‌اند."
              : " فیلترهای خالی یعنی «همه»."}
          </p>
        </div>
        <div className="filter-panel-body space-y-4">
          {savedViews.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[var(--muted)]">نماهای ذخیره‌شده:</span>
              {savedViews.map((view) => (
                <Button
                  key={view.id}
                  size="sm"
                  variant="outline"
                  onClick={() => void applyView(view)}
                >
                  {view.nameFa}
                  {view.isDefault ? " ★" : ""}
                </Button>
              ))}
              {hasRun ? (
                <Button size="sm" variant="ghost" onClick={openSaveViewDialog}>
                  ذخیره نما
                </Button>
              ) : null}
            </div>
          ) : hasRun ? (
            <Button size="sm" variant="ghost" onClick={openSaveViewDialog}>
              ذخیره نما
            </Button>
          ) : null}
          <ReportParameterForm
            reportId={report.id}
            parameters={report.parameters}
            initialValues={initialParams}
            onSubmit={runReport}
            isLoading={isLoading}
          />
        </div>
      </section>

      {error ? <p className="alert alert-danger">{error}</p> : null}

      {hasRun && result ? (
        <section className="results-panel">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">نتایج</h2>
            <div className="flex flex-wrap gap-2 text-xs">
              {meta?.durationMs != null ? (
                <span className="badge badge-success">{meta.durationMs} ms</span>
              ) : null}
              {meta?.truncated ? (
                <span className="badge badge-warning">نتایج محدود شده‌اند</span>
              ) : null}
            </div>
          </div>
          <ReportResultSections result={result} report={report} />
        </section>
      ) : (
        <div className="results-empty space-y-3 text-center">
          <p className="font-semibold text-[var(--foreground)]">
            {hasRequired
              ? "برای مشاهده نتایج، فیلترهای الزامی را پر کنید"
              : "هنوز اجرایی نشده است"}
          </p>
          <p className="text-sm text-[var(--muted)]">
            {hasRequired
              ? "فیلدهای ستاره‌دار را تکمیل کرده و دکمه «اجرای گزارش» را بزنید."
              : "فیلترها را تنظیم کنید یا «اجرای گزارش» را بزنید."}
          </p>
        </div>
      )}

      <Dialog open={saveViewOpen} onOpenChange={setSaveViewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ذخیره نما</DialogTitle>
            <DialogDescription>
              پارامترهای فعلی با این نام ذخیره می‌شوند.
            </DialogDescription>
          </DialogHeader>
          <label className="block space-y-1">
            <span className="field-label">نام نما</span>
            <Input
              value={saveViewName}
              onChange={(e) => setSaveViewName(e.target.value)}
              placeholder="مثلاً ماه جاری"
              autoFocus
            />
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={saveViewDefault}
              onChange={(e) => setSaveViewDefault(e.target.checked)}
            />
            نمای پیش‌فرض این گزارش
          </label>
          <DialogFooter>
            <DialogCloseButton />
            <Button
              onClick={() => void saveCurrentView()}
              disabled={savingView || !saveViewName.trim()}
            >
              {savingView ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
