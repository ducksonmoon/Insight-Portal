"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
  type ICellRendererParams,
  type ValueFormatterParams,
} from "ag-grid-community";
import "ag-grid-community/styles/ag-theme-quartz.css";

import { formatCellValue } from "@/lib/reports/format";
import { AG_GRID_LOCALE_FA } from "@/lib/ag-grid/locale-fa";
import { ReportGridToolbar } from "@/components/reports/report-grid-toolbar";
import {
  resolveGridConfig,
  type ReportColumn,
  type ReportDefinition,
  type ReportGridConfig,
} from "@/types/report";

ModuleRegistry.registerModules([AllCommunityModule]);

const NO_ROWS_OVERLAY = '<span class="ag-overlay-no-rows-center">ردیف‌ای برای نمایش نیست</span>';

type ReportDataGridProps = {
  rows: Record<string, unknown>[];
  columns: ReportColumn[];
  grouping?: ReportDefinition["grouping"];
  gridConfig?: ReportGridConfig;
  reportId?: string;
  showToolbar?: boolean;
  heightClass?: string;
  /** Master-detail: called with the clicked row, so a parent grid can drive a detail panel. */
  onRowClick?: (row: Record<string, unknown>) => void;
  /** Highlights the row the detail panel is currently showing. */
  isRowSelected?: (row: Record<string, unknown>) => boolean;
  /**
   * Keeps this row inside the grid's own viewport. Needed because the grid
   * shrinks when a detail panel opens, which can drop the row that was just
   * clicked below the new, shorter viewport.
   */
  ensureVisibleRow?: Record<string, unknown> | null;
};

function alignToCss(align?: ReportColumn["align"], isNumber?: boolean): string {
  if (align === "center") return "center";
  if (align === "end") return "left";
  if (align === "start") return "right";
  return isNumber ? "left" : "right";
}

export function ReportDataGrid({
  rows,
  columns,
  grouping,
  gridConfig: gridConfigInput,
  reportId,
  showToolbar,
  heightClass = "h-[min(62vh,640px)]",
  onRowClick,
  isRowSelected,
  ensureVisibleRow,
}: ReportDataGridProps) {
  const gridConfig = resolveGridConfig(gridConfigInput);
  const toolbarVisible = showToolbar ?? gridConfig.showToolbar ?? true;
  const [gridApi, setGridApi] = useState<GridApi | null>(null);
  const [filteredRows, setFilteredRows] = useState(rows.length);

  const sortedRows = useMemo(() => {
    if (!grouping?.groupBy?.length) return rows;
    const keys = grouping.groupBy;
    return [...rows].sort((a, b) => {
      for (const key of keys) {
        const av = String(a[key] ?? "");
        const bv = String(b[key] ?? "");
        if (av < bv) return -1;
        if (av > bv) return 1;
      }
      return 0;
    });
  }, [rows, grouping]);

  const effectiveColumns = useMemo<ReportColumn[]>(() => {
    if (columns.length) return columns;
    if (!rows[0]) return [];
    return Object.keys(rows[0]).map((field) => ({
      field,
      header: field,
      type: "string" as const,
      width: 140,
    }));
  }, [columns, rows]);

  const colDefs = useMemo<ColDef[]>(() => {
    let firstVisiblePinned = false;

    return effectiveColumns.map((col) => {
      const isGroup = grouping?.groupBy?.includes(col.field);
      const isNumber = col.type === "number";
      let pinned = col.pinned;

      if (!pinned && isGroup) {
        pinned = "right";
      } else if (
        !pinned &&
        gridConfig.pinFirstColumn &&
        !col.hidden &&
        !firstVisiblePinned
      ) {
        pinned = "right";
        firstVisiblePinned = true;
      }

      return {
        field: col.field,
        headerName: col.header,
        width: col.width ?? 140,
        hide: col.hidden ?? false,
        filter: true,
        sortable: true,
        resizable: true,
        pinned,
        sort: col.sort ?? undefined,
        cellClass: isNumber ? "ag-cell-number" : undefined,
        cellStyle: {
          textAlign: alignToCss(col.align, isNumber),
        },
        valueFormatter: (p: ValueFormatterParams) =>
          formatCellValue(p.value, col),
        // Renders a status-like value ("معوق", "تسویه شده", …) as a coloured
        // badge instead of plain text — declared per-column via
        // ReportColumn.badgeTone (see src/types/report.ts). Values with no
        // entry in the map fall back to plain text, so a partial map is safe.
        // ag-grid-react treats a plain function cellRenderer as a React
        // component, so it must return JSX — a raw DOM node here throws
        // "Objects are not valid as a React child" the moment the column
        // renders.
        cellRenderer: col.badgeTone
          ? (p: ICellRendererParams) => {
              const text = p.value == null ? "" : String(p.value);
              const tone = col.badgeTone?.[text];
              return tone ? <span className={`badge badge-${tone}`}>{text}</span> : text;
            }
          : undefined,
      };
    });
  }, [effectiveColumns, grouping, gridConfig.pinFirstColumn]);

  const updateFilteredCount = useCallback((api: GridApi) => {
    setFilteredRows(api.getDisplayedRowCount());
  }, []);

  const onGridReady = useCallback(
    (event: GridReadyEvent) => {
      setGridApi(event.api);
      updateFilteredCount(event.api);

      event.api.autoSizeAllColumns(false);
      const cols = event.api.getColumns();
      if (cols) {
        const widths: Array<{ key: string; newWidth: number }> = [];
        for (const col of cols) {
          const colId = col.getColId();
          const def = effectiveColumns.find((c) => c.field === colId);
          const measured = col.getActualWidth();
          const w = def?.width ?? Math.min(measured, 280);
          widths.push({ key: colId, newWidth: w });
        }
        if (widths.length) {
          event.api.setColumnWidths(widths);
        }
      }
    },
    [effectiveColumns, updateFilteredCount],
  );

  useEffect(() => {
    if (!gridApi || !ensureVisibleRow) return;
    // Row objects come straight from `rows`, so identity comparison is exact
    // and avoids inventing a key the caller would have to keep in sync.
    gridApi.forEachNode((node) => {
      if (node.data === ensureVisibleRow && typeof node.rowIndex === "number") {
        gridApi.ensureIndexVisible(node.rowIndex, "middle");
      }
    });
  }, [gridApi, ensureVisibleRow]);

  const densityClass =
    gridConfig.density === "compact" ? "ag-grid-compact" : "";

  return (
    <div className="space-y-2">
      {grouping?.groupBy?.length ? (
        <p className="text-xs text-[var(--muted)]">
          مرتب‌سازی گروهی بر اساس: {grouping.groupBy.join("، ")}
          {grouping.aggregates?.length
            ? ` · تجمیع: ${grouping.aggregates.map((a) => a.label).join("، ")}`
            : null}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
        {toolbarVisible ? (
          <ReportGridToolbar
            gridApi={gridApi}
            totalRows={sortedRows.length}
            filteredRows={filteredRows}
            reportId={reportId}
            enableQuickFilter={gridConfig.enableQuickFilter ?? true}
          />
        ) : null}

        <div
          className={`ag-theme-quartz ${densityClass} ${heightClass} w-full`}
        >
          <AgGridReact
            rowData={sortedRows}
            columnDefs={colDefs}
            enableRtl
            localeText={AG_GRID_LOCALE_FA}
            animateRows
            pagination
            paginationPageSize={gridConfig.pageSize ?? 50}
            paginationPageSizeSelector={
              gridConfig.pageSizeOptions ?? [20, 50, 100, 200]
            }
            enableCellTextSelection
            ensureDomOrder
            suppressCellFocus
            overlayNoRowsTemplate={NO_ROWS_OVERLAY}
            onGridReady={onGridReady}
            onFilterChanged={(e) => updateFilteredCount(e.api)}
            onRowDataUpdated={(e) => updateFilteredCount(e.api)}
            onRowClicked={
              onRowClick
                ? (e) => e.data && onRowClick(e.data as Record<string, unknown>)
                : undefined
            }
            rowClassRules={
              isRowSelected
                ? {
                    "report-row-selected": (p) =>
                      Boolean(p.data) && isRowSelected(p.data as Record<string, unknown>),
                    "report-row-clickable": () => true,
                  }
                : undefined
            }
            defaultColDef={{
              sortable: true,
              filter: true,
              resizable: true,
              minWidth: 90,
            }}
          />
        </div>
      </div>
    </div>
  );
}
