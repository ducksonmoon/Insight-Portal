"use client";

import { useCallback, useState } from "react";
import type { GridApi } from "ag-grid-community";
import {
  Columns3,
  Download,
  FilterX,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";

type ReportGridToolbarProps = {
  gridApi: GridApi | null;
  totalRows: number;
  filteredRows: number;
  reportId?: string;
  enableQuickFilter?: boolean;
  showRowCount?: boolean;
};

export function ReportGridToolbar({
  gridApi,
  totalRows,
  filteredRows,
  reportId,
  enableQuickFilter = true,
  showRowCount = true,
}: ReportGridToolbarProps) {
  const [quickFilter, setQuickFilter] = useState("");

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
