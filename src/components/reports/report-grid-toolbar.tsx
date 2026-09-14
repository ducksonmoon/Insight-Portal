"use client";

import { useCallback, useState } from "react";
import type { GridApi } from "ag-grid-community";
import {
  Columns3,
  Download,
  FileSpreadsheet,
  FilterX,
  Loader2,
  Maximize2,
  Minimize2,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ReportColumn } from "@/types/report";

type ReportGridToolbarProps = {
  gridApi: GridApi | null;
  totalRows: number;
  filteredRows: number;
  /** Used for downloaded file names (CSV/Excel). */
  reportId?: string;
  /**
   * The real, permission-checked report slug the Excel export endpoint
   * should authorize against. Distinct from `reportId` because a
   * master-detail child grid's `reportId` is a synthetic display id like
   * "lc-summary-payments", not a report that actually exists — the server
   * call still has to name the real report. Defaults to `reportId`.
   */
  exportReportId?: string;
  columns?: ReportColumn[];
  enableQuickFilter?: boolean;
  showRowCount?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
};

export function ReportGridToolbar({
  gridApi,
  totalRows,
  filteredRows,
  reportId,
  exportReportId,
  columns,
  enableQuickFilter = true,
  showRowCount = true,
  isExpanded = false,
  onToggleExpand,
}: ReportGridToolbarProps) {
  const [quickFilter, setQuickFilter] = useState("");
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const applyQuickFilter = useCallback(
    (value: string) => {
      setQuickFilter(value);
      gridApi?.setGridOption("quickFilterText", value);
    },
    [gridApi],
  );

  function clearFilters() {
    setQuickFilter("");
    if (!gridApi) return;
    gridApi.setGridOption("quickFilterText", "");
    gridApi.setFilterModel(null);
  }

  function autoSizeColumns() {
    if (!gridApi) return;
    gridApi.autoSizeAllColumns(false);
    const cols = gridApi.getColumns();
    if (!cols) return;
    const widths: Array<{ key: string; newWidth: number }> = [];
    for (const col of cols) {
      const w = col.getActualWidth();
      widths.push({ key: col.getColId(), newWidth: Math.min(w, 280) });
    }
    if (widths.length) gridApi.setColumnWidths(widths);
  }

  function exportCsv() {
    if (!gridApi) return;
    const fileName = reportId ? `${reportId}-grid.csv` : "report-grid.csv";
    gridApi.exportDataAsCsv({ fileName });
  }

  /**
   * Exactly what's on screen right now — same filtered/sorted rows and
   * visible columns CSV export uses — turned into a real .xlsx via the
   * server (ag-grid Community has no built-in Excel exporter; that's an
   * Enterprise-only feature). See src/app/api/reports/[id]/export-grid.
   */
  async function exportExcel() {
    if (!gridApi || !columns?.length) return;
    const targetReportId = exportReportId ?? reportId;
    if (!targetReportId) return;

    setIsExportingExcel(true);
    try {
      const rows: Record<string, unknown>[] = [];
      gridApi.forEachNodeAfterFilterAndSort((node) => {
        if (node.data) rows.push(node.data as Record<string, unknown>);
      });
      const visibleColumns = columns.filter((c) => !c.hidden);

      const res = await fetch(`/api/reports/${targetReportId}/export-grid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetName: reportId ?? targetReportId,
          columns: visibleColumns,
          rows,
        }),
      });
      if (!res.ok) return;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${reportId ?? targetReportId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExportingExcel(false);
    }
  }

  return (
    <div className="report-grid-toolbar flex flex-wrap items-center justify-between gap-3 rounded-t-xl border border-b-0 border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {enableQuickFilter ? (
          <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <input
              type="search"
              value={quickFilter}
              onChange={(e) => applyQuickFilter(e.target.value)}
              placeholder="جستجو در جدول…"
              className="h-9 w-full rounded-lg border border-[var(--border)] bg-white pr-9 pl-3 text-sm"
            />
          </label>
        ) : null}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!gridApi}
          onClick={clearFilters}
        >
          <FilterX className="h-3.5 w-3.5" />
          پاک کردن فیلترها
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!gridApi}
          onClick={autoSizeColumns}
        >
          <Columns3 className="h-3.5 w-3.5" />
          تنظیم عرض ستون‌ها
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!gridApi || totalRows === 0}
          onClick={exportCsv}
        >
          <Download className="h-3.5 w-3.5" />
          خروجی CSV
        </Button>

        {columns?.length ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!gridApi || totalRows === 0 || isExportingExcel}
            onClick={() => void exportExcel()}
          >
            {isExportingExcel ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-3.5 w-3.5" />
            )}
            خروجی Excel
          </Button>
        ) : null}

        {onToggleExpand ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onToggleExpand}
          >
            {isExpanded ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
            {isExpanded ? "اندازه عادی" : "بزرگ‌نمایی"}
          </Button>
        ) : null}
      </div>

      {showRowCount ? (
        <span className="badge badge-primary shrink-0 text-xs">
          نمایش {filteredRows.toLocaleString("fa-IR")} از{" "}
          {totalRows.toLocaleString("fa-IR")}
        </span>
      ) : null}
    </div>
  );
}
