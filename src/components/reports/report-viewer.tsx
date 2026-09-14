"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileBarChart2,
  Loader2,
  Printer,
  Star,
} from "lucide-react";

import { ReportCharts } from "@/components/reports/report-charts";
import { ReportDataGrid } from "@/components/reports/report-data-grid";
import { ReportKpiBand } from "@/components/reports/report-kpi-band";
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
import { makeDatasetJoinKey } from "@/types/report-result";
import type {
  ExecuteReportResult,
  DatasetResult,
  EmbedResult,
} from "@/types/report-result";
import {
  getPrimaryDataset,
  isCompositeReport,
  resolveGridConfig,
  type ReportDefinition,
  type ReportParameter,
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

/**
 * A dataset that has a child dataset, rendered as master-detail: click a row in
 * the master grid and the child's rows for that key appear beneath it.
 *
 * The join is already done — the engine groups child rows into
 * `childrenByParentKey` when a dataset declares `parentDatasetId` — so this
 * costs no extra query and no extra round trip. Selecting a row is pure
 * client-side lookup against data that is already loaded.
 *
 * Without this the two datasets render as two independent grids and the only
 * way to narrow the child to one parent is to retype a filter and re-run the
 * whole report.
 */
function MasterDetailSection({
  title,
  master,
  detail,
  detailTitle,
  report,
}: {
  title?: string;
  master: DatasetResult;
  detail: DatasetResult;
  detailTitle?: string;
  report: ReportDefinition;
}) {
  const masterDef = report.datasets.find((d) => d.id === master.id);
  const detailDef = report.datasets.find((d) => d.id === detail.id);
  const masterGrid = resolveGridConfig(report.gridConfig, masterDef?.gridConfig);
  const detailGrid = resolveGridConfig(report.gridConfig, detailDef?.gridConfig);

  const parentKeyFields = detailDef?.parentKeyFields ?? [];
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  // Reviewing goes LC by LC: click one, read its payments, move to the next.
  // That only works if the selected row stays on screen next to its detail, so
  // the master grid gives up height while a detail is open instead of pushing
  // it below the fold. Full height again once nothing is selected.
  useEffect(() => {
    if (selected) {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selected]);

  const selectedKey = selected
    ? makeDatasetJoinKey(selected, parentKeyFields)
    : null;
  const detailRows = selectedKey
    ? (detail.childrenByParentKey?.[selectedKey] ?? [])
    : [];

  // Most LCs have a handful of payments and a few have twenty. A fixed-height
  // detail grid means either acres of empty rows or needless scrolling, so
  // pick a bucket. Literal class strings — Tailwind only sees what it can read.
  const detailHeight =
    detailRows.length <= 4
      ? "h-[200px]"
      : detailRows.length <= 10
        ? "h-[min(28vh,320px)]"
        : "h-[min(36vh,380px)]";

  // A label for whichever row is open, built from the same fields that join
  // the two datasets — so it always names the thing the detail rows belong to.
  const selectedLabel = selected
    ? parentKeyFields
        .map((f) => String(selected[f] ?? ""))
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-[var(--foreground)]">
          {title || master.nameFa || master.id}
        </h3>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="badge badge-primary">{master.totalCount} ردیف</span>
          {master.truncated ? (
            <span className="badge badge-warning">محدود شده</span>
          ) : null}
        </div>
      </div>

      {masterDef?.kpiBand?.length ? (
        <ReportKpiBand rows={master.rows} cards={masterDef.kpiBand} />
      ) : null}

      <ReportCharts charts={master.charts ?? []} rows={master.rows} />

      <p className="text-xs text-[var(--muted)]">
        روی هر سطر کلیک کنید تا «{detailTitle || detail.nameFa}» همان سطر در
        پایین نمایش داده شود.
      </p>

      <ReportDataGrid
        rows={master.rows}
        columns={master.columns}
        grouping={master.grouping}
        gridConfig={masterGrid}
        reportId={report.id}
        heightClass={
          selected ? "h-[min(34vh,360px)]" : "h-[min(62vh,640px)]"
        }
        ensureVisibleRow={selected}
        onRowClick={(row) =>
          setSelected((current) =>
            current &&
            makeDatasetJoinKey(current, parentKeyFields) ===
              makeDatasetJoinKey(row, parentKeyFields)
              ? null
              : row,
          )
        }
        isRowSelected={(row) =>
          selectedKey !== null &&
          makeDatasetJoinKey(row, parentKeyFields) === selectedKey
        }
      />

      <div
        ref={detailRef}
        className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-muted)] p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-[var(--foreground)]">
            {detailTitle || detail.nameFa}
            {selectedLabel ? (
              <span className="mr-2 text-xs font-normal text-[var(--muted)]">
                {selectedLabel}
              </span>
            ) : null}
          </h4>
          {selected ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="badge badge-primary">{detailRows.length} ردیف</span>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                بستن
              </Button>
            </div>
          ) : (
            <span className="badge">{detail.totalCount} ردیف در کل</span>
          )}
        </div>

        {selected ? (
          detailRows.length ? (
            <ReportDataGrid
              rows={detailRows}
              columns={detail.columns}
              grouping={detail.grouping}
              gridConfig={detailGrid}
              reportId={`${report.id}-${detail.id}`}
              exportReportId={report.id}
              heightClass={detailHeight}
            />
          ) : (
            <p className="py-6 text-center text-sm text-[var(--muted)]">
              برای این سطر موردی ثبت نشده است.
            </p>
          )
        ) : (
          <p className="py-6 text-center text-sm text-[var(--muted)]">
            یک سطر از جدول بالا را انتخاب کنید.
          </p>
        )}
      </div>
    </section>
  );
}

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
      {datasetDef?.kpiBand?.length ? (
        <ReportKpiBand rows={dataset.rows} cards={datasetDef.kpiBand} />
      ) : null}
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

            // A dataset that is some other dataset's child is rendered inside
            // that parent's section, not as a section of its own.
            const parentDef = report.datasets.find(
              (d) => d.id === section.datasetId,
            )?.parentDatasetId;
            if (parentDef && datasets[parentDef]) return null;

            const childDef = report.datasets.find(
              (d) => d.parentDatasetId === section.datasetId,
            );
            const childDs = childDef ? datasets[childDef.id] : undefined;
            if (childDef && childDs?.childrenByParentKey) {
              const childSection = layout.find(
                (s) => s.type === "dataset" && s.datasetId === childDef.id,
              );
              return (
                <MasterDetailSection
                  key={`md-${section.datasetId}-${idx}`}
                  title={section.title}
                  master={ds}
                  detail={childDs}
                  detailTitle={
                    childSection && childSection.type === "dataset"
                      ? childSection.title
                      : undefined
                  }
                  report={report}
                />
              );
            }

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
  const kpiBand = report ? getPrimaryDataset(report).kpiBand : undefined;

  return (
    <div className="space-y-5">
      {kpiBand?.length ? <ReportKpiBand rows={result.rows} cards={kpiBand} /> : null}
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

/**
 * A human-readable summary of one submitted filter value, for the compact
 * "applied filters" strip shown once a report's filter panel collapses after
 * running — so a manager can see at a glance what's being filtered without
 * reopening the form. Returns null for an empty/unset filter (nothing to
 * show — "خالی یعنی همه").
 */
function formatAppliedFilterValue(
  param: ReportParameter,
  values: Record<string, unknown>,
): string | null {
  if (param.type === "jalali-date-range") {
    const startName = param.rangeStartName ?? "STARTDATE";
    const endName = param.rangeEndName ?? "ENDDATE";
    const start = values[startName];
    const end = values[endName];
    if (!start && !end) return null;
    return `${start ? String(start) : "…"} تا ${end ? String(end) : "…"}`;
  }

  const raw = values[param.name];
  if (raw == null || raw === "") return null;

  if (param.type === "boolean") {
    return raw === true || raw === "true" ? "بله" : "خیر";
  }
  if (param.type === "select") {
    return param.options?.find((o) => o.value === raw)?.label ?? String(raw);
  }
  return String(raw);
}

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
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  // Collapsed once a run succeeds — a manager checking a daily report wants
  // the numbers, not a re-explanation of the filter form every time. Stays
  // (or reopens) on error so a bad filter is easy to fix.
  const [filtersOpen, setFiltersOpen] = useState(true);
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
        setLastRunAt(new Date());
        setFiltersOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "خطای ناشناخته");
        setResult(null);
        setMeta(null);
        setFiltersOpen(true);
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

  const appliedFilterCount = report.parameters.filter(
    (param) => formatAppliedFilterValue(param, lastParams) != null,
  ).length;

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
            {hasRun && lastRunAt
              ? `آخرین اجرا: امروز ساعت ${lastRunAt.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}`
              : "فیلترهای زیر را تنظیم کنید و گزارش را اجرا بگیرید."}
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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="section-title">فیلترها</h2>
              {filtersOpen ? (
                <p className="section-desc">
                  تاریخ شمسی را با فیلدهای سال / ماه / روز وارد کنید، یا از
                  دکمه‌های میان‌بر بازه استفاده کنید.
                  {hasRequired
                    ? " فیلدهای ستاره‌دار الزامی‌اند."
                    : " فیلترهای خالی یعنی «همه»."}
                </p>
              ) : appliedFilterCount > 0 ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {report.parameters.map((param) => {
                    const text = formatAppliedFilterValue(param, lastParams);
                    if (!text) return null;
                    return (
                      <span key={param.name} className="badge badge-muted">
                        {param.label}: {text}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="section-desc">فیلتری اعمال نشده — همه دیتا نمایش داده شده.</p>
              )}
            </div>

            {hasRun ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFiltersOpen((open) => !open)}
              >
                {filtersOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                {filtersOpen ? "بستن فیلترها" : "ویرایش فیلترها"}
              </Button>
            ) : null}
          </div>
        </div>
        <div className={filtersOpen ? "filter-panel-body space-y-4" : "hidden"}>
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
        <section className="results-panel relative">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">نتایج</h2>
            <div className="flex flex-wrap gap-2 text-xs">
              {meta?.totalCount != null ? (
                <span className="badge badge-primary">
                  {meta.totalCount.toLocaleString("fa-IR")} ردیف
                </span>
              ) : null}
              {meta?.durationMs != null ? (
                <span className="badge badge-success">{meta.durationMs} ms</span>
              ) : null}
              {meta?.truncated ? (
                <span className="badge badge-warning">نتایج محدود شده‌اند</span>
              ) : null}
            </div>
          </div>

          {isLoading ? (
            <div className="absolute inset-0 z-10 flex items-start justify-center rounded-[var(--radius)] bg-[var(--surface)]/70 pt-16 backdrop-blur-[1px]">
              <span className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] shadow-[var(--shadow-md)]">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />
                در حال به‌روزرسانی نتایج…
              </span>
            </div>
          ) : null}

          <div className={isLoading ? "pointer-events-none opacity-50" : undefined}>
            <ReportResultSections result={result} report={report} />
          </div>
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
