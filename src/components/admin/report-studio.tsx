"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Columns3,
  FlaskConical,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import { ReportExportButton } from "@/components/admin/report-import-export";
import { ReportSourceBadge } from "@/components/admin/report-source-badge";
import { ReportCharts } from "@/components/reports/report-charts";
import { ReportDataGrid } from "@/components/reports/report-data-grid";
import { ReportParameterForm } from "@/components/reports/report-parameter-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ExecuteReportResult } from "@/types/report-result";
import type {
  OrgFolderNode,
  OrgModuleNode,
} from "@/lib/reports/organization";
import {
  getPrimaryDataset,
  normalizeDefinition,
  reportModules as staticModules,
  resolveGridConfig,
  type ReportColumn,
  type ReportDataset,
  type ReportDefinition,
  type ReportEmbed,
  type ReportGridConfig,
  type ReportModule,
  type ReportParameter,
  type ReportParameterType,
  type ReportSection,
} from "@/types/report";
import { cn } from "@/lib/utils";

function flattenFolderOptions(
  nodes: OrgFolderNode[],
  depth = 0,
): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  for (const node of nodes) {
    out.push({
      id: node.id,
      label: `${"—".repeat(depth)} ${node.nameFa}`.trim(),
    });
    out.push(...flattenFolderOptions(node.children, depth + 1));
  }
  return out;
}

type StudioTab =
  | "sql"
  | "parameters"
  | "datasets"
  | "layout"
  | "embeds"
  | "columns"
  | "charts"
  | "test";

type LookupCatalog = {
  slug: string;
  nameFa: string;
};

type ValidationIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
};

const PARAM_TYPES: Array<{ value: ReportParameterType; label: string }> = [
  { value: "jalali-date", label: "تاریخ شمسی" },
  { value: "jalali-date-range", label: "بازه تاریخ شمسی" },
  { value: "text", label: "متن" },
  { value: "number", label: "عدد" },
  { value: "select", label: "انتخابی" },
  { value: "lookup", label: "لیست از دیتابیس" },
  { value: "boolean", label: "بله/خیر" },
];

const emptyDefinition = (): ReportDefinition =>
  normalizeDefinition({
    id: "",
    nameFa: "",
    moduleId: "",
    dataSourceId: "rahkaran",
    sqlSource: { mode: "inline", text: "" },
    parameters: [],
    columns: [],
    charts: [],
    validation: { maxRows: 10000, queryTimeoutSec: 30 },
  });

type ReportStudioProps = {
  mode: "create" | "edit";
  initialId?: string;
};

function syncPrimarySql(
  definition: ReportDefinition,
  sqlText: string,
): ReportDefinition {
  const primary = getPrimaryDataset(definition);
  const nextDatasets = definition.datasets.map((d) =>
    d.id === primary.id
      ? { ...d, sqlSource: { mode: "inline" as const, text: sqlText } }
      : d,
  );
  return normalizeDefinition({
    ...definition,
    sqlSource: { mode: "inline", text: sqlText },
    sql: sqlText,
    datasets: nextDatasets,
  });
}

export function ReportStudio({ mode, initialId }: ReportStudioProps) {
  const router = useRouter();
  const [tab, setTab] = useState<StudioTab>("sql");
  const [definition, setDefinition] = useState<ReportDefinition>(emptyDefinition);
  const [sqlText, setSqlText] = useState("");
  const [activeDatasetId, setActiveDatasetId] = useState("main");
  const [modules, setModules] = useState<ReportModule[]>(staticModules);
  const [organization, setOrganization] = useState<OrgModuleNode[]>([]);
  const [folderId, setFolderId] = useState<string>("");
  const [catalogs, setCatalogs] = useState<LookupCatalog[]>([]);
  const [publishedReports, setPublishedReports] = useState<
    Array<{ id: string; nameFa: string }>
  >([]);
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<ExecuteReportResult | null>(
    null,
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sourceType, setSourceType] = useState<string | null>(null);
  const [sourceRef, setSourceRef] = useState<string | null>(null);
  const [dataSourceOptions, setDataSourceOptions] = useState<
    Array<{ key: string; nameFa: string; configured: boolean }>
  >([{ key: "rahkaran", nameFa: "راهکاران", configured: true }]);

  const draftDefinition = useMemo(
    () => syncPrimarySql(definition, sqlText),
    [definition, sqlText],
  );

  const activeDataset: ReportDataset =
    draftDefinition.datasets.find((d) => d.id === activeDatasetId) ??
    getPrimaryDataset(draftDefinition);

  useEffect(() => {
    fetch("/api/admin/reports/lookup-catalogs")
      .then((r) => r.json())
      .then((data) => setCatalogs(data.catalogs ?? []))
      .catch(() => undefined);

    fetch("/api/admin/modules")
      .then((r) => r.json())
      .then((data) => {
        if (data.modules?.length) setModules(data.modules);
        if (data.organization?.length) setOrganization(data.organization);
      })
      .catch(() => undefined);

    fetch("/api/admin/reports")
      .then((r) => r.json())
      .then((data) =>
        setPublishedReports(
          (data.reports ?? []).map((r: { id: string; nameFa: string }) => ({
            id: r.id,
            nameFa: r.nameFa,
          })),
        ),
      )
      .catch(() => undefined);

    fetch("/api/admin/datasources")
      .then((r) => r.json())
      .then((data) => {
        const providers = (data.providers ?? []) as Array<{
          key: string;
          nameFa: string;
          configured: boolean;
        }>;
        if (providers.length) setDataSourceOptions(providers);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (mode !== "create" || definition.moduleId || !modules.length) return;
    setDefinition((prev) =>
      normalizeDefinition({ ...prev, moduleId: modules[0]!.id }),
    );
  }, [mode, modules, definition.moduleId]);

  const folderOptions = useMemo(() => {
    const mod = organization.find((m) => m.id === definition.moduleId);
    return mod ? flattenFolderOptions(mod.folders) : [];
  }, [organization, definition.moduleId]);

  useEffect(() => {
    if (mode !== "edit" || !initialId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/reports/${initialId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "بارگذاری ناموفق");
        if (cancelled) return;
        const def = normalizeDefinition(data.definition);
        setDefinition(def);
        setSqlText(data.sqlText ?? def.sqlSource.text ?? "");
        setFolderId(data.folderId ?? "");
        setSourceType(data.sourceType ?? "studio");
        setSourceRef(data.sourceRef ?? null);
        setActiveDatasetId(getPrimaryDataset(def).id);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "خطا در بارگذاری"),
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, initialId]);

  const updateMeta = useCallback((patch: Partial<ReportDefinition>) => {
    setDefinition((prev) =>
      normalizeDefinition({ ...prev, ...patch } as ReportDefinition),
    );
  }, []);

  const updateDataset = useCallback(
    (datasetId: string, patch: Partial<ReportDataset>) => {
      setDefinition((prev) => {
        const datasets = prev.datasets.map((d) =>
          d.id === datasetId ? { ...d, ...patch } : d,
        );
        const primary = getPrimaryDataset({ ...prev, datasets });
        const next: Partial<ReportDefinition> & {
          id: string;
          nameFa: string;
          moduleId: string;
        } = {
          ...prev,
          datasets,
        };
        if (datasetId === primary.id) {
          if (patch.sqlSource) next.sqlSource = patch.sqlSource;
          if (patch.columns) next.columns = patch.columns;
          if (patch.charts) next.charts = patch.charts;
          if (patch.grouping !== undefined) next.grouping = patch.grouping;
          if (patch.sqlSource?.mode === "inline" && patch.sqlSource.text != null) {
            setSqlText(patch.sqlSource.text);
          }
        }
        return normalizeDefinition(next);
      });
    },
    [],
  );

  async function runValidate() {
    setValidating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reports/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          definition: draftDefinition,
          sqlText,
        }),
      });
      const data = await res.json();
      setIssues(data.issues ?? []);
      if (data.ok) {
        setMessage("اعتبارسنجی موفق بود");
      } else {
        setMessage(null);
        setError("اعتبارسنجی خطا دارد — قبل از انتشار رفع کنید");
      }
      return Boolean(data.ok);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا");
      return false;
    } finally {
      setValidating(false);
    }
  }

  async function introspectColumns(datasetId?: string) {
    const targetId = datasetId ?? activeDataset.id;
    setPreviewLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reports/introspect-columns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          definition: draftDefinition,
          parameters: {},
          datasetId: targetId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا در تشخیص ستون‌ها");
      updateDataset(targetId, { columns: data.columns ?? [] });
      setMessage(`${data.columns?.length ?? 0} ستون برای «${targetId}» شناسایی شد`);
      setTab("columns");
      setActiveDatasetId(targetId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function save(publish = true) {
    if (!draftDefinition.id.trim() || !draftDefinition.nameFa.trim()) {
      setError("شناسه و نام فارسی الزامی است");
      setTab("sql");
      return;
    }

    const ok = await runValidate();
    if (!ok) return;

    setSaving(true);
    setError(null);
    try {
      const endpoint =
        mode === "edit"
          ? `/api/admin/reports/${draftDefinition.id}`
          : "/api/admin/reports";
      const method = mode === "edit" ? "PUT" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          definition: draftDefinition,
          publish,
          sqlInline: true,
          folderId: folderId || null,
          note: publish ? "publish from studio" : "draft",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.validation?.issues) setIssues(data.validation.issues);
        throw new Error(data.error ?? "ذخیره ناموفق");
      }
      setMessage(
        publish
          ? `انتشار شد (نسخه ${data.version})`
          : "پیش‌نویس ذخیره شد",
      );
      if (mode === "create") {
        router.push(`/admin/reports/${draftDefinition.id}/edit`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ذخیره");
    } finally {
      setSaving(false);
    }
  }

  async function runTest(parameters: Record<string, unknown>) {
    setPreviewLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reports/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          definition: draftDefinition,
          parameters,
          maxRows: 100,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "پیش‌نمایش ناموفق");
      setPreviewResult(data as ExecuteReportResult);
      setMessage(`${data.totalCount ?? 0} ردیف در ${data.durationMs ?? "?"}ms`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا");
      setPreviewResult(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  function addParameter() {
    const next: ReportParameter = {
      name: `param${definition.parameters.length + 1}`,
      label: "پارامتر جدید",
      type: "text",
      nullable: true,
    };
    updateMeta({ parameters: [...definition.parameters, next] });
  }

  function updateParameter(index: number, patch: Partial<ReportParameter>) {
    const parameters = definition.parameters.map((p, i) =>
      i === index ? { ...p, ...patch } : p,
    );
    updateMeta({ parameters });
  }

  function removeParameter(index: number) {
    updateMeta({
      parameters: definition.parameters.filter((_, i) => i !== index),
    });
  }

  function updateColumn(index: number, patch: Partial<ReportColumn>) {
    const columns = activeDataset.columns.map((c, i) =>
      i === index ? { ...c, ...patch } : c,
    );
    updateDataset(activeDataset.id, { columns });
  }

  const activeGridConfig = resolveGridConfig(
    definition.gridConfig,
    definition.datasets.length > 1 ? activeDataset.gridConfig : undefined,
  );

  function updateGridConfig(patch: Partial<ReportGridConfig>) {
    if (definition.datasets.length > 1) {
      updateDataset(activeDataset.id, {
        gridConfig: { ...activeDataset.gridConfig, ...patch },
      });
    } else {
      updateMeta({ gridConfig: { ...definition.gridConfig, ...patch } });
    }
  }

  function addDataset() {
    const id = `dataset${definition.datasets.length + 1}`;
    const dataset: ReportDataset = {
      id,
      nameFa: `دیتاست ${definition.datasets.length + 1}`,
      sqlSource: { mode: "inline", text: "SELECT 1 AS Col" },
      columns: [],
      charts: [],
    };
    const datasets = [...definition.datasets, dataset];
    const layout: ReportSection[] = [
      ...definition.layout,
      { type: "dataset", datasetId: id, title: dataset.nameFa },
    ];
    updateMeta({
      schemaVersion: 2,
      datasets,
      layout,
    });
    setActiveDatasetId(id);
    setTab("datasets");
  }

  function removeDataset(datasetId: string) {
    if (definition.datasets.length <= 1) {
      setError("حداقل یک دیتاست باید بماند");
      return;
    }
    const primary = getPrimaryDataset(definition);
    if (datasetId === primary.id) {
      setError("دیتاست اصلی را نمی‌توان حذف کرد — ابتدا دیتاست دیگری بسازید و جابه‌جا کنید");
      return;
    }
    const datasets = definition.datasets.filter((d) => d.id !== datasetId);
    const layout = definition.layout.filter(
      (s) =>
        !(
          (s.type === "dataset" || s.type === "chart") &&
          s.datasetId === datasetId
        ),
    );
    updateMeta({ datasets, layout, schemaVersion: 2 });
    setActiveDatasetId(primary.id);
  }

  function addEmbed() {
    const id = `embed${(definition.embeds?.length ?? 0) + 1}`;
    const embed: ReportEmbed = {
      id,
      nameFa: "زیرگزارش",
      reportSlug: publishedReports[0]?.id ?? "",
      parameterMap: {},
    };
    const embeds = [...(definition.embeds ?? []), embed];
    const layout: ReportSection[] = [
      ...definition.layout,
      { type: "embed", embedId: id, title: embed.nameFa },
    ];
    updateMeta({ schemaVersion: 2, embeds, layout });
    setTab("embeds");
  }

  function updateEmbed(index: number, patch: Partial<ReportEmbed>) {
    const embeds = (definition.embeds ?? []).map((e, i) =>
      i === index ? { ...e, ...patch } : e,
    );
    updateMeta({ embeds, schemaVersion: 2 });
  }

  function removeEmbed(index: number) {
    const target = definition.embeds?.[index];
    const embeds = (definition.embeds ?? []).filter((_, i) => i !== index);
    const layout = definition.layout.filter(
      (s) => !(s.type === "embed" && s.embedId === target?.id),
    );
    updateMeta({ embeds, layout, schemaVersion: 2 });
  }

  function moveLayout(index: number, dir: -1 | 1) {
    const next = [...definition.layout];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    updateMeta({ layout: next, schemaVersion: 2 });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-[var(--muted)]">
        <Loader2 className="h-5 w-5 animate-spin" />
        در حال بارگذاری گزارش...
      </div>
    );
  }

  const tabs: Array<{ id: StudioTab; label: string }> = [
    { id: "sql", label: "۱. مشخصات و SQL" },
    { id: "parameters", label: "۲. پارامترها" },
    { id: "datasets", label: "۳. دیتاست‌ها" },
    { id: "columns", label: "۴. ستون‌ها" },
    { id: "charts", label: "۵. نمودار" },
    { id: "layout", label: "۶. چیدمان" },
    { id: "embeds", label: "۷. زیرگزارش" },
    { id: "test", label: "۸. آزمایش" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/reports"
            className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--primary)]"
          >
            <ArrowRight className="h-4 w-4" />
            بازگشت به فهرست
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="page-title">
              {mode === "create"
                ? "گزارش جدید"
                : `ویرایش: ${definition.nameFa || definition.id}`}
            </h1>
            {mode === "edit" ? <ReportSourceBadge sourceType={sourceType} /> : null}
          </div>
          <p className="page-subtitle">
            SQL، دیتاست‌های چندگانه، چیدمان و زیرگزارش — سپس آزمایش و انتشار
            {sourceType === "rdl" && sourceRef ? (
              <>
                {" · "}
                <Link href={`/admin/rdl/${sourceRef}`} className="text-[var(--primary)]">
                  منبع RDL
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => runValidate()}
            disabled={validating || saving}
          >
            {validating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            اعتبارسنجی
          </Button>
          <Button
            variant="secondary"
            onClick={() => introspectColumns()}
            disabled={previewLoading || saving}
          >
            <Columns3 className="h-4 w-4" />
            تشخیص ستون‌ها
          </Button>
          {mode === "edit" && draftDefinition.id ? (
            <ReportExportButton reportSlug={draftDefinition.id} />
          ) : null}
          <Button onClick={() => save(true)} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            انتشار
          </Button>
        </div>
      </div>

      {message ? (
        <div className="rounded-xl border border-[var(--success)]/20 bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {issues.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-[var(--warning)]" />
              نتایج اعتبارسنجی
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {issues.map((issue, idx) => (
              <div
                key={`${issue.code}-${idx}`}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm",
                  issue.level === "error"
                    ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                    : "bg-[var(--warning-soft)] text-[var(--warning)]",
                )}
              >
                {issue.message}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="overflow-x-auto border-b border-[var(--border)]">
        <div className="flex min-w-max">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={cn("studio-tab", tab === t.id && "studio-tab-active")}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "sql" ? (
        <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>مشخصات گزارش</CardTitle>
              <CardDescription>برای مدیران و کاربران قابل‌نمایش</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="block space-y-1.5 text-sm">
                <span className="font-semibold">شناسه انگلیسی</span>
                <input
                  className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                  value={definition.id}
                  disabled={mode === "edit"}
                  placeholder="bank-balance"
                  onChange={(e) =>
                    updateMeta({
                      id: e.target.value
                        .trim()
                        .toLowerCase()
                        .replace(/[^a-z0-9-_]/g, "-"),
                    })
                  }
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-semibold">نام فارسی</span>
                <input
                  className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                  value={definition.nameFa}
                  placeholder="گزارش موجودی بانک"
                  onChange={(e) => updateMeta({ nameFa: e.target.value })}
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-semibold">ماژول</span>
                <select
                  className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                  value={definition.moduleId}
                  onChange={(e) => {
                    updateMeta({ moduleId: e.target.value });
                    setFolderId("");
                  }}
                >
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nameFa}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-semibold">پوشه (اختیاری)</span>
                <select
                  className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  disabled={!folderOptions.length}
                >
                  <option value="">ریشه ماژول</option>
                  {folderOptions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
                {!folderOptions.length ? (
                  <p className="text-xs text-[var(--muted)]">
                    پوشه‌ای برای این ماژول نیست — از «ماژول‌ها» بسازید
                  </p>
                ) : null}
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-semibold">منبع داده</span>
                <select
                  className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                  value={definition.dataSourceId}
                  onChange={(e) =>
                    updateMeta({ dataSourceId: e.target.value })
                  }
                >
                  {dataSourceOptions.map((ds) => (
                    <option
                      key={ds.key}
                      value={ds.key}
                      disabled={!ds.configured}
                    >
                      {ds.nameFa}
                      {!ds.configured ? " (پیکربندی نشده)" : ""}
                    </option>
                  ))}
                </select>
                {!dataSourceOptions.find(
                  (d) => d.key === definition.dataSourceId,
                )?.configured ? (
                  <p className="text-xs text-[var(--danger)]">
                    این منبع داده پیکربندی نشده — از تنظیمات برند وضعیت را بررسی
                    کنید.
                  </p>
                ) : null}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1.5 text-sm">
                  <span className="font-semibold">حداکثر ردیف</span>
                  <input
                    type="number"
                    className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                    value={definition.validation?.maxRows ?? 10000}
                    onChange={(e) =>
                      updateMeta({
                        validation: {
                          ...definition.validation,
                          maxRows: Number(e.target.value) || 10000,
                        },
                      })
                    }
                  />
                </label>
                <label className="block space-y-1.5 text-sm">
                  <span className="font-semibold">مهلت (ثانیه)</span>
                  <input
                    type="number"
                    className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                    value={definition.validation?.queryTimeoutSec ?? 30}
                    onChange={(e) =>
                      updateMeta({
                        validation: {
                          ...definition.validation,
                          queryTimeoutSec: Number(e.target.value) || 30,
                        },
                      })
                    }
                  />
                </label>
              </div>
              <p className="text-xs text-[var(--muted)]">
                نسخه schema: {draftDefinition.schemaVersion} ·{" "}
                {draftDefinition.datasets.length} دیتاست ·{" "}
                {draftDefinition.embeds?.length ?? 0} زیرگزارش
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SQL دیتاست اصلی ({getPrimaryDataset(draftDefinition).id})</CardTitle>
              <CardDescription>
                از پارامترهای <code>@Name</code> استفاده کنید — دیتاست‌های بیشتر در تب «دیتاست‌ها»
              </CardDescription>
            </CardHeader>
            <CardContent>
              <textarea
                className="sql-editor"
                value={sqlText}
                spellCheck={false}
                placeholder="SELECT ... WHERE (@Status IS NULL OR Status = @Status)"
                onChange={(e) => setSqlText(e.target.value)}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "parameters" ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle>پارامترهای فیلتر</CardTitle>
              <CardDescription>
                مشترک بین همه دیتاست‌ها و زیرگزارش‌ها
              </CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={addParameter}>
              <Plus className="h-4 w-4" />
              افزودن پارامتر
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {!definition.parameters.length ? (
              <p className="rounded-xl bg-[var(--surface-muted)] px-4 py-8 text-center text-sm text-[var(--muted)]">
                هنوز پارامتری نیست.
              </p>
            ) : null}
            {definition.parameters.map((param, index) => (
              <div
                key={`${param.name}-${index}`}
                className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 p-4 md:grid-cols-12"
              >
                <label className="space-y-1 text-sm md:col-span-2">
                  <span className="text-xs font-semibold text-[var(--muted)]">
                    نام SQL
                  </span>
                  <input
                    className="h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3"
                    value={param.name}
                    onChange={(e) =>
                      updateParameter(index, { name: e.target.value })
                    }
                  />
                </label>
                <label className="space-y-1 text-sm md:col-span-3">
                  <span className="text-xs font-semibold text-[var(--muted)]">
                    برچسب فارسی
                  </span>
                  <input
                    className="h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3"
                    value={param.label}
                    onChange={(e) =>
                      updateParameter(index, { label: e.target.value })
                    }
                  />
                </label>
                <label className="space-y-1 text-sm md:col-span-2">
                  <span className="text-xs font-semibold text-[var(--muted)]">
                    نوع
                  </span>
                  <select
                    className="h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3"
                    value={param.type}
                    onChange={(e) =>
                      updateParameter(index, {
                        type: e.target.value as ReportParameterType,
                      })
                    }
                  >
                    {PARAM_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                {param.type === "lookup" ? (
                  <label className="space-y-1 text-sm md:col-span-3">
                    <span className="text-xs font-semibold text-[var(--muted)]">
                      کاتالوگ Lookup
                    </span>
                    <select
                      className="h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3"
                      value={param.lookupCatalogSlug ?? ""}
                      onChange={(e) =>
                        updateParameter(index, {
                          lookupCatalogSlug: e.target.value || undefined,
                        })
                      }
                    >
                      <option value="">— انتخاب —</option>
                      {catalogs.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.nameFa}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="md:col-span-3" />
                )}
                <div className="flex items-end gap-2 md:col-span-2">
                  <label className="flex h-10 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(param.nullable ?? true)}
                      onChange={(e) => {
                        const optional = e.target.checked;
                        updateParameter(index, {
                          nullable: optional,
                          required: !optional,
                        });
                      }}
                    />
                    اختیاری
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeParameter(index)}
                    aria-label="حذف"
                  >
                    <Trash2 className="h-4 w-4 text-[var(--danger)]" />
                  </Button>
                </div>
                {param.type === "select" ? (
                  <label className="space-y-1 text-sm md:col-span-12">
                    <span className="text-xs font-semibold text-[var(--muted)]">
                      گزینه‌ها (value|label در هر خط)
                    </span>
                    <textarea
                      className="min-h-20 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2"
                      value={(param.options ?? [])
                        .map((o) => `${o.value}|${o.label}`)
                        .join("\n")}
                      onChange={(e) => {
                        const options = e.target.value
                          .split("\n")
                          .map((line) => line.trim())
                          .filter(Boolean)
                          .map((line) => {
                            const [value, label] = line.split("|");
                            return {
                              value: (value ?? "").trim(),
                              label: (label ?? value ?? "").trim(),
                            };
                          });
                        updateParameter(index, { options });
                      }}
                    />
                  </label>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {tab === "datasets" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-[var(--muted)]">
              هر دیتاست یک کوئری جدا است. برای header/detail کلید join را تنظیم کنید.
            </p>
            <Button type="button" variant="outline" onClick={addDataset}>
              <Plus className="h-4 w-4" />
              دیتاست جدید
            </Button>
          </div>
          {definition.datasets.map((ds) => {
            const isActive = ds.id === activeDatasetId;
            const isPrimary = ds.id === getPrimaryDataset(definition).id;
            return (
              <Card
                key={ds.id}
                className={cn(isActive && "ring-2 ring-[var(--primary)]/30")}
              >
                <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                  <div className="grid flex-1 gap-2 md:grid-cols-3">
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-[var(--muted)]">شناسه</span>
                      <input
                        className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                        value={ds.id}
                        disabled={isPrimary}
                        onChange={(e) => {
                          const newId = e.target.value
                            .trim()
                            .toLowerCase()
                            .replace(/[^a-z0-9-_]/g, "-");
                          if (!newId || newId === ds.id) return;
                          const datasets = definition.datasets.map((d) =>
                            d.id === ds.id ? { ...d, id: newId } : d,
                          );
                          const layout = definition.layout.map((s) => {
                            if (
                              (s.type === "dataset" || s.type === "chart") &&
                              s.datasetId === ds.id
                            ) {
                              return { ...s, datasetId: newId };
                            }
                            return s;
                          });
                          updateMeta({ datasets, layout, schemaVersion: 2 });
                          setActiveDatasetId(newId);
                        }}
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-[var(--muted)]">نام فارسی</span>
                      <input
                        className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                        value={ds.nameFa}
                        onChange={(e) =>
                          updateDataset(ds.id, { nameFa: e.target.value })
                        }
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-[var(--muted)]">دیتاست والد</span>
                      <select
                        className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                        value={ds.parentDatasetId ?? ""}
                        onChange={(e) =>
                          updateDataset(ds.id, {
                            parentDatasetId: e.target.value || undefined,
                          })
                        }
                      >
                        <option value="">— بدون والد —</option>
                        {definition.datasets
                          .filter((d) => d.id !== ds.id)
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.nameFa} ({d.id})
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      onClick={() => setActiveDatasetId(ds.id)}
                    >
                      انتخاب
                    </Button>
                    {!isPrimary ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeDataset(ds.id)}
                      >
                        <Trash2 className="h-4 w-4 text-[var(--danger)]" />
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {ds.parentDatasetId ? (
                    <div className="grid gap-2 md:grid-cols-2">
                      <label className="space-y-1 text-sm">
                        <span className="text-xs text-[var(--muted)]">
                          کلیدهای والد (با کاما)
                        </span>
                        <input
                          className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                          value={(ds.parentKeyFields ?? []).join(",")}
                          placeholder="Id,Code"
                          onChange={(e) =>
                            updateDataset(ds.id, {
                              parentKeyFields: e.target.value
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-xs text-[var(--muted)]">
                          کلیدهای فرزند (با کاما)
                        </span>
                        <input
                          className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                          value={(ds.childKeyFields ?? []).join(",")}
                          placeholder="ParentId,Code"
                          onChange={(e) =>
                            updateDataset(ds.id, {
                              childKeyFields: e.target.value
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </label>
                    </div>
                  ) : null}
                  {!isPrimary ? (
                    <textarea
                      className="sql-editor min-h-40"
                      value={ds.sqlSource.text ?? ""}
                      spellCheck={false}
                      onChange={(e) =>
                        updateDataset(ds.id, {
                          sqlSource: { mode: "inline", text: e.target.value },
                        })
                      }
                    />
                  ) : (
                    <p className="text-xs text-[var(--muted)]">
                      SQL دیتاست اصلی را در تب «مشخصات و SQL» ویرایش کنید.
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => introspectColumns(ds.id)}
                    disabled={previewLoading}
                  >
                    <Columns3 className="h-4 w-4" />
                    تشخیص ستون‌های این دیتاست
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      {tab === "columns" ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle>
                ستون‌های «{activeDataset.nameFa}» ({activeDataset.id})
              </CardTitle>
              <CardDescription>
                دیتاست فعال را از تب دیتاست‌ها یا اینجا عوض کنید
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                className="h-10 rounded-lg border border-[var(--border)] px-3 text-sm"
                value={activeDatasetId}
                onChange={(e) => setActiveDatasetId(e.target.value)}
              >
                {definition.datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nameFa}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                onClick={() => introspectColumns(activeDataset.id)}
                disabled={previewLoading}
              >
                {previewLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Columns3 className="h-4 w-4" />
                )}
                تشخیص خودکار
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!activeDataset.columns.length ? (
              <p className="rounded-xl bg-[var(--surface-muted)] px-4 py-8 text-center text-sm text-[var(--muted)]">
                ستونی تعریف نشده.
              </p>
            ) : null}
            {activeDataset.columns.map((col, index) => (
              <div
                key={`${col.field}-${index}`}
                className="space-y-0 rounded-xl border border-[var(--border)]"
              >
              <div className="grid gap-3 p-3 md:grid-cols-5">
                <label className="space-y-1 text-sm">
                  <span className="text-xs text-[var(--muted)]">فیلد</span>
                  <input
                    className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                    value={col.field}
                    onChange={(e) =>
                      updateColumn(index, { field: e.target.value })
                    }
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs text-[var(--muted)]">عنوان</span>
                  <input
                    className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                    value={col.header}
                    onChange={(e) =>
                      updateColumn(index, { header: e.target.value })
                    }
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs text-[var(--muted)]">نوع</span>
                  <select
                    className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                    value={col.type}
                    onChange={(e) =>
                      updateColumn(index, {
                        type: e.target.value as ReportColumn["type"],
                      })
                    }
                  >
                    <option value="string">متن</option>
                    <option value="number">عدد</option>
                    <option value="date">تاریخ</option>
                    <option value="boolean">منطقی</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs text-[var(--muted)]">عرض</span>
                  <input
                    type="number"
                    className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                    value={col.width ?? 140}
                    onChange={(e) =>
                      updateColumn(index, {
                        width: Number(e.target.value) || 140,
                      })
                    }
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs text-[var(--muted)]">فرمت</span>
                  <select
                    className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                    value={col.format ?? ""}
                    onChange={(e) =>
                      updateColumn(index, {
                        format: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">پیش‌فرض</option>
                    <option value="currency">#,##0</option>
                    <option value="#,##0.00">اعشار</option>
                    <option value="decimal">decimal</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-3 border-t border-[var(--border)] p-3 md:grid-cols-4">
                <label className="space-y-1 text-sm">
                  <span className="text-xs text-[var(--muted)]">ثابت</span>
                  <select
                    className="h-10 w-full rounded-lg border border-[var(--border)] px-2"
                    value={col.pinned ?? ""}
                    onChange={(e) =>
                      updateColumn(index, {
                        pinned:
                          e.target.value === ""
                            ? undefined
                            : (e.target.value as "left" | "right"),
                      })
                    }
                  >
                    <option value="">بدون</option>
                    <option value="right">راست (شروع)</option>
                    <option value="left">چپ (پایان)</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs text-[var(--muted)]">تراز</span>
                  <select
                    className="h-10 w-full rounded-lg border border-[var(--border)] px-2"
                    value={col.align ?? ""}
                    onChange={(e) =>
                      updateColumn(index, {
                        align:
                          e.target.value === ""
                            ? undefined
                            : (e.target.value as ReportColumn["align"]),
                      })
                    }
                  >
                    <option value="">پیش‌فرض</option>
                    <option value="start">شروع</option>
                    <option value="center">وسط</option>
                    <option value="end">پایان</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs text-[var(--muted)]">مرتب‌سازی اولیه</span>
                  <select
                    className="h-10 w-full rounded-lg border border-[var(--border)] px-2"
                    value={col.sort ?? ""}
                    onChange={(e) =>
                      updateColumn(index, {
                        sort:
                          e.target.value === ""
                            ? undefined
                            : (e.target.value as "asc" | "desc"),
                      })
                    }
                  >
                    <option value="">بدون</option>
                    <option value="asc">صعودی</option>
                    <option value="desc">نزولی</option>
                  </select>
                </label>
                <label className="flex h-10 items-center gap-2 self-end text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(col.hidden)}
                    onChange={(e) =>
                      updateColumn(index, { hidden: e.target.checked || undefined })
                    }
                  />
                  مخفی در جدول
                </label>
              </div>
              </div>
            ))}
            <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <p className="mb-3 text-sm font-semibold">نمایش جدول</p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-1 text-sm">
                  <span className="text-xs text-[var(--muted)]">تراکم</span>
                  <select
                    className="h-10 w-full rounded-lg border border-[var(--border)] bg-white px-2"
                    value={activeGridConfig.density ?? "comfortable"}
                    onChange={(e) =>
                      updateGridConfig({
                        density: e.target.value as "comfortable" | "compact",
                      })
                    }
                  >
                    <option value="comfortable">معمولی</option>
                    <option value="compact">فشرده</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs text-[var(--muted)]">اندازه صفحه</span>
                  <select
                    className="h-10 w-full rounded-lg border border-[var(--border)] bg-white px-2"
                    value={activeGridConfig.pageSize ?? 50}
                    onChange={(e) =>
                      updateGridConfig({ pageSize: Number(e.target.value) })
                    }
                  >
                    {(activeGridConfig.pageSizeOptions ?? [20, 50, 100, 200]).map(
                      (n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label className="flex h-10 items-center gap-2 self-end text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(activeGridConfig.pinFirstColumn)}
                    onChange={(e) =>
                      updateGridConfig({ pinFirstColumn: e.target.checked })
                    }
                  />
                  ثابت کردن ستون اول
                </label>
                <label className="flex h-10 items-center gap-2 self-end text-sm">
                  <input
                    type="checkbox"
                    checked={activeGridConfig.showToolbar !== false}
                    onChange={(e) =>
                      updateGridConfig({ showToolbar: e.target.checked })
                    }
                  />
                  نمایش نوار ابزار
                </label>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "charts" ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle>نمودارهای «{activeDataset.nameFa}»</CardTitle>
            </div>
            <select
              className="h-10 rounded-lg border border-[var(--border)] px-3 text-sm"
              value={activeDatasetId}
              onChange={(e) => setActiveDatasetId(e.target.value)}
            >
              {definition.datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nameFa}
                </option>
              ))}
            </select>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                updateDataset(activeDataset.id, {
                  charts: [
                    ...(activeDataset.charts ?? []),
                    {
                      type: "bar",
                      title: "نمودار جدید",
                      xField: activeDataset.columns[0]?.field ?? "",
                      yField: activeDataset.columns[1]?.field ?? "",
                    },
                  ],
                })
              }
            >
              <Plus className="h-4 w-4" />
              افزودن نمودار
            </Button>
            {(activeDataset.charts ?? []).map((chart, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-xl border border-[var(--border)] p-3 md:grid-cols-5"
              >
                <input
                  className="h-10 rounded-lg border border-[var(--border)] px-3 md:col-span-2"
                  value={chart.title}
                  onChange={(e) => {
                    const charts = [...(activeDataset.charts ?? [])];
                    charts[index] = { ...chart, title: e.target.value };
                    updateDataset(activeDataset.id, { charts });
                  }}
                />
                <select
                  className="h-10 rounded-lg border border-[var(--border)] px-3"
                  value={chart.type}
                  onChange={(e) => {
                    const charts = [...(activeDataset.charts ?? [])];
                    charts[index] = {
                      ...chart,
                      type: e.target.value as "bar" | "line" | "pie",
                    };
                    updateDataset(activeDataset.id, { charts });
                  }}
                >
                  <option value="bar">میله‌ای</option>
                  <option value="line">خطی</option>
                  <option value="pie">دایره‌ای</option>
                </select>
                <select
                  className="h-10 rounded-lg border border-[var(--border)] px-3"
                  value={chart.xField}
                  onChange={(e) => {
                    const charts = [...(activeDataset.charts ?? [])];
                    charts[index] = { ...chart, xField: e.target.value };
                    updateDataset(activeDataset.id, { charts });
                  }}
                >
                  {activeDataset.columns.map((c) => (
                    <option key={c.field} value={c.field}>
                      {c.header}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <select
                    className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                    value={chart.yField}
                    onChange={(e) => {
                      const charts = [...(activeDataset.charts ?? [])];
                      charts[index] = { ...chart, yField: e.target.value };
                      updateDataset(activeDataset.id, { charts });
                    }}
                  >
                    {activeDataset.columns.map((c) => (
                      <option key={c.field} value={c.field}>
                        {c.header}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      updateDataset(activeDataset.id, {
                        charts: (activeDataset.charts ?? []).filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4 text-[var(--danger)]" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {tab === "layout" ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle>چیدمان بخش‌ها</CardTitle>
              <CardDescription>
                ترتیب نمایش در صفحه گزارش و شیت‌های Excel
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const layout: ReportSection[] = [
                  ...definition.datasets.map((d) => ({
                    type: "dataset" as const,
                    datasetId: d.id,
                    title: d.nameFa,
                  })),
                  ...(definition.embeds ?? []).map((e) => ({
                    type: "embed" as const,
                    embedId: e.id,
                    title: e.nameFa,
                  })),
                ];
                updateMeta({ layout, schemaVersion: 2 });
              }}
            >
              بازسازی از دیتاست/زیرگزارش
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {definition.layout.map((section, index) => (
              <div
                key={index}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2"
              >
                <span className="badge badge-primary">{section.type}</span>
                <input
                  className="h-9 min-w-[160px] flex-1 rounded-lg border border-[var(--border)] px-3 text-sm"
                  value={section.title ?? ""}
                  placeholder="عنوان بخش"
                  onChange={(e) => {
                    const layout = definition.layout.map((s, i) =>
                      i === index ? { ...s, title: e.target.value } : s,
                    );
                    updateMeta({ layout, schemaVersion: 2 });
                  }}
                />
                <span className="text-xs text-[var(--muted)]">
                  {section.type === "dataset"
                    ? section.datasetId
                    : section.type === "embed"
                      ? section.embedId
                      : `${section.datasetId}#${section.chartIndex}`}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => moveLayout(index, -1)}
                >
                  بالا
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => moveLayout(index, 1)}
                >
                  پایین
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    updateMeta({
                      layout: definition.layout.filter((_, i) => i !== index),
                      schemaVersion: 2,
                    })
                  }
                >
                  <Trash2 className="h-4 w-4 text-[var(--danger)]" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {tab === "embeds" ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle>زیرگزارش‌های منتشرشده</CardTitle>
              <CardDescription>
                پارامترها را از فیلتر والد یا فیلد ردیف اول دیتاست اصلی نگاشت کنید
                (عمق حداکثر ۲)
              </CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={addEmbed}>
              <Plus className="h-4 w-4" />
              افزودن زیرگزارش
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {!(definition.embeds?.length) ? (
              <p className="rounded-xl bg-[var(--surface-muted)] px-4 py-8 text-center text-sm text-[var(--muted)]">
                هنوز زیرگزارشی نیست — الگوی Settlement اینجا ساخته می‌شود.
              </p>
            ) : null}
            {(definition.embeds ?? []).map((embed, index) => (
              <div
                key={embed.id}
                className="space-y-3 rounded-xl border border-[var(--border)] p-4"
              >
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="space-y-1 text-sm">
                    <span className="text-xs text-[var(--muted)]">شناسه</span>
                    <input
                      className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                      value={embed.id}
                      onChange={(e) =>
                        updateEmbed(index, { id: e.target.value })
                      }
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-xs text-[var(--muted)]">عنوان</span>
                    <input
                      className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                      value={embed.nameFa}
                      onChange={(e) =>
                        updateEmbed(index, { nameFa: e.target.value })
                      }
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-xs text-[var(--muted)]">گزارش منتشرشده</span>
                    <select
                      className="h-10 w-full rounded-lg border border-[var(--border)] px-3"
                      value={embed.reportSlug}
                      onChange={(e) =>
                        updateEmbed(index, { reportSlug: e.target.value })
                      }
                    >
                      <option value="">— انتخاب —</option>
                      {publishedReports
                        .filter((r) => r.id !== definition.id)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.nameFa} ({r.id})
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <label className="block space-y-1 text-sm">
                  <span className="text-xs text-[var(--muted)]">
                    نگاشت پارامتر (childParam=parentFieldOrParam در هر خط)
                  </span>
                  <textarea
                    className="min-h-24 w-full rounded-lg border border-[var(--border)] px-3 py-2"
                    value={Object.entries(embed.parameterMap)
                      .map(([k, v]) => `${k}=${v}`)
                      .join("\n")}
                    onChange={(e) => {
                      const parameterMap: Record<string, string> = {};
                      for (const line of e.target.value.split("\n")) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;
                        const eq = trimmed.indexOf("=");
                        if (eq <= 0) continue;
                        parameterMap[trimmed.slice(0, eq).trim()] = trimmed
                          .slice(eq + 1)
                          .trim();
                      }
                      updateEmbed(index, { parameterMap });
                    }}
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeEmbed(index)}
                >
                  <Trash2 className="h-4 w-4 text-[var(--danger)]" />
                  حذف
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {tab === "test" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4" />
                آزمایش با داده واقعی
              </CardTitle>
              <CardDescription>
                همه دیتاست‌ها و زیرگزارش‌های منتشرشده (در صورت وجود) اجرا می‌شوند
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReportParameterForm
                reportId={definition.id || "draft"}
                parameters={definition.parameters}
                skipLookups={!definition.id}
                isLoading={previewLoading}
                submitLabel="اجرای آزمایشی"
                onSubmit={runTest}
              />
            </CardContent>
          </Card>

          {previewResult ? (
            <div className="space-y-6">
              {previewResult.layout?.length && previewResult.datasets
                ? previewResult.layout.map((section, idx) => {
                    if (section.type === "dataset") {
                      const ds = previewResult.datasets?.[section.datasetId];
                      if (!ds) return null;
                      return (
                        <div key={idx} className="space-y-3">
                          <h3 className="font-bold">
                            {section.title || ds.nameFa}
                          </h3>
                          <ReportCharts
                            charts={ds.charts ?? []}
                            rows={ds.rows}
                          />
                          <ReportDataGrid
                            rows={ds.rows}
                            columns={ds.columns}
                            grouping={ds.grouping}
                            gridConfig={resolveGridConfig(
                              definition.gridConfig,
                              definition.datasets.find((d) => d.id === ds.id)
                                ?.gridConfig,
                            )}
                            reportId={definition.id}
                            heightClass="h-[min(40vh,420px)]"
                          />
                        </div>
                      );
                    }
                    if (section.type === "embed") {
                      const emb = previewResult.embeds?.[section.embedId];
                      if (!emb) return null;
                      return (
                        <div key={idx} className="space-y-3 rounded-xl border p-3">
                          <h3 className="font-bold">
                            {section.title || emb.nameFa}
                          </h3>
                          <ReportDataGrid
                            rows={emb.result.rows}
                            columns={emb.result.columns}
                            reportId={emb.reportSlug}
                            heightClass="h-[min(40vh,420px)]"
                          />
                        </div>
                      );
                    }
                    return null;
                  })
                : (
                    <>
                      <ReportCharts
                        charts={previewResult.charts ?? []}
                        rows={previewResult.rows}
                      />
                      <ReportDataGrid
                        rows={previewResult.rows}
                        columns={
                          previewResult.columns.length
                            ? previewResult.columns
                            : Object.keys(previewResult.rows[0] ?? {}).map(
                                (field) => ({
                                  field,
                                  header: field,
                                  type: "string" as const,
                                }),
                              )
                        }
                        grouping={previewResult.grouping}
                        gridConfig={activeGridConfig}
                        reportId={definition.id}
                      />
                    </>
                  )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
