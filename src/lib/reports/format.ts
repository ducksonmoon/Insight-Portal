import type { ReportColumn } from "@/types/report";

const faNumber = new Intl.NumberFormat("fa-IR");
const faNumber2 = new Intl.NumberFormat("fa-IR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a cell value using optional column.format hints (number/date). */
export function formatCellValue(
  value: unknown,
  column?: Pick<ReportColumn, "type" | "format">,
): string {
  if (value == null || value === "") return "";

  if (column?.type === "number" || typeof value === "number") {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return String(value);
    if (column?.format === "currency" || column?.format === "#,##0") {
      return faNumber.format(n);
    }
    if (column?.format === "#,##0.00" || column?.format === "decimal") {
      return faNumber2.format(n);
    }
    return faNumber.format(n);
  }

  if (column?.type === "date" || value instanceof Date) {
    const d = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("fa-IR");
  }

  if (column?.type === "boolean") {
    return value === true || value === 1 || value === "1" || value === "true"
      ? "بله"
      : "خیر";
  }

  return String(value);
}
